import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { apiError } from "./api";
import { getServerRuntimeConfig } from "./env";

export const STUDIO_SESSION_COOKIE = "vixel_studio_session";
export const STUDIO_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const STUDIO_IDENTITY_COOKIE = "vixel_studio_identity";
export const STUDIO_IDENTITY_TTL_SECONDS = 60 * 60 * 24 * 365;

const TOKEN_CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_SIGNED_TOKEN_LENGTH = 1_024;
const SESSION_NONCE_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const STUDIO_SUBJECT_PATTERN = /^[a-f0-9]{64}$/;
const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENCODED_EMAIL_PATTERN = /^[A-Za-z0-9_-]{3,427}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AccountStatus = "pending" | "approved" | "suspended";
export type AppRole = "user" | "admin";
export type AccountSession = {
  userId: string;
  email: string;
  accountStatus: AccountStatus;
  appRole: AppRole;
  expiresAt: number;
};

type VerifiedSession =
  | { version: "v1"; expiresAt: number }
  | { version: "v2"; expiresAt: number; subject: string }
  | ({ version: "v3" } & AccountSession);

type VerifiedStudioIdentity = {
  subject: string;
  issuedAt: number;
  expiresAt: number;
};

export type StudioLoginSession = {
  sessionToken: string;
  identityTokenToSet: string | null;
};

type AccessState =
  | { allowed: true; required: boolean; configured: boolean }
  | {
      allowed: false;
      required: true;
      configured: boolean;
      reason: "not_authenticated" | "not_configured" | "not_approved";
    };

function secretValue(name: "STUDIO_ACCESS_CODE" | "STUDIO_SESSION_SECRET") {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function constantTimeTextEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function signPayload(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload, "utf8").digest();
}

function signScopedPayload(
  scope: "session:v2" | "session:v3" | "identity:v1",
  payload: string,
  secret: string,
): Buffer {
  return createHmac("sha256", secret)
    .update(`vixel-studio-${scope}\0`, "utf8")
    .update(payload, "utf8")
    .digest();
}

function readSignature(value: string): Buffer | null {
  if (!SIGNATURE_PATTERN.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === value
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function signatureMatches(
  supplied: string,
  expected: Buffer,
): boolean {
  const suppliedSignature = readSignature(supplied);
  return Boolean(
    suppliedSignature &&
      suppliedSignature.length === expected.length &&
      timingSafeEqual(suppliedSignature, expected),
  );
}

function validFutureExpiry(
  expiresAt: number,
  nowSeconds: number,
  maximumLifetimeSeconds: number,
): boolean {
  return (
    Number.isSafeInteger(expiresAt) &&
    expiresAt > nowSeconds &&
    expiresAt <=
      nowSeconds + maximumLifetimeSeconds + TOKEN_CLOCK_SKEW_SECONDS
  );
}

function createSessionTokenForSubject(
  subject: string,
  now = Date.now(),
): string | null {
  const secret = secretValue("STUDIO_SESSION_SECRET");
  if (!secret || !STUDIO_SUBJECT_PATTERN.test(subject)) return null;

  const expiresAt = Math.floor(now / 1000) + STUDIO_SESSION_TTL_SECONDS;
  const payload = `v2.${expiresAt}.${subject}.${randomBytes(18).toString("base64url")}`;
  const signature = signScopedPayload("session:v2", payload, secret).toString(
    "base64url",
  );
  return `${payload}.${signature}`;
}

/**
 * Creates a short-lived session with a new pseudonymous subject.
 *
 * Login code should use createStudioLoginSession so a valid long-lived browser
 * identity is reused instead of minting a different owner.
 */
export function createSessionToken(now = Date.now()): string | null {
  return createSessionTokenForSubject(
    randomBytes(32).toString("hex"),
    now,
  );
}

export function createAccountSessionToken(
  account: Omit<AccountSession, "expiresAt">,
  now = Date.now(),
): string | null {
  const secret = secretValue("STUDIO_SESSION_SECRET");
  const normalizedEmail = account.email.trim().toLowerCase();
  if (
    !secret ||
    !USER_ID_PATTERN.test(account.userId) ||
    !["pending", "approved", "suspended"].includes(account.accountStatus) ||
    !["user", "admin"].includes(account.appRole) ||
    normalizedEmail.length > 320
  ) {
    return null;
  }
  const encodedEmail = Buffer.from(normalizedEmail, "utf8").toString(
    "base64url",
  );
  if (!ENCODED_EMAIL_PATTERN.test(encodedEmail)) return null;

  const expiresAt = Math.floor(now / 1000) + STUDIO_SESSION_TTL_SECONDS;
  const payload = [
    "v3",
    expiresAt,
    account.userId.toLowerCase(),
    account.accountStatus,
    account.appRole,
    encodedEmail,
    randomBytes(18).toString("base64url"),
  ].join(".");
  const signature = signScopedPayload("session:v3", payload, secret).toString(
    "base64url",
  );
  return `${payload}.${signature}`;
}

function verifiedSession(
  token: string | null | undefined,
  now = Date.now(),
): VerifiedSession | null {
  const secret = secretValue("STUDIO_SESSION_SECRET");
  if (!secret || !token || token.length > MAX_SIGNED_TOKEN_LENGTH) return null;

  const parts = token.split(".");
  const nowSeconds = Math.floor(now / 1000);

  // v1 is retained only for a bounded migration window. It uses the original
  // signature construction so already-issued seven-day sessions stay valid.
  if (parts.length === 4 && parts[0] === "v1") {
    const expiresAt = Number(parts[1]);
    if (
      !validFutureExpiry(expiresAt, nowSeconds, STUDIO_SESSION_TTL_SECONDS) ||
      !SESSION_NONCE_PATTERN.test(parts[2])
    ) {
      return null;
    }
    const expectedSignature = signPayload(
      parts.slice(0, 3).join("."),
      secret,
    );
    return signatureMatches(parts[3], expectedSignature)
      ? { version: "v1", expiresAt }
      : null;
  }

  if (parts.length === 8 && parts[0] === "v3") {
    const expiresAt = Number(parts[1]);
    const userId = parts[2];
    const accountStatus = parts[3] as AccountStatus;
    const appRole = parts[4] as AppRole;
    const encodedEmail = parts[5];
    if (
      !validFutureExpiry(expiresAt, nowSeconds, STUDIO_SESSION_TTL_SECONDS) ||
      !USER_ID_PATTERN.test(userId) ||
      !["pending", "approved", "suspended"].includes(accountStatus) ||
      !["user", "admin"].includes(appRole) ||
      !ENCODED_EMAIL_PATTERN.test(encodedEmail) ||
      !SESSION_NONCE_PATTERN.test(parts[6])
    ) {
      return null;
    }
    let email: string;
    try {
      email = Buffer.from(encodedEmail, "base64url").toString("utf8");
      if (
        Buffer.from(email, "utf8").toString("base64url") !== encodedEmail ||
        email !== email.trim().toLowerCase() ||
        email.length > 320
      ) {
        return null;
      }
    } catch {
      return null;
    }
    const expectedSignature = signScopedPayload(
      "session:v3",
      parts.slice(0, 7).join("."),
      secret,
    );
    return signatureMatches(parts[7], expectedSignature)
      ? {
          version: "v3",
          expiresAt,
          userId: userId.toLowerCase(),
          email,
          accountStatus,
          appRole,
        }
      : null;
  }

  if (parts.length !== 5 || parts[0] !== "v2") return null;
  const expiresAt = Number(parts[1]);
  const subject = parts[2];
  if (
    !validFutureExpiry(expiresAt, nowSeconds, STUDIO_SESSION_TTL_SECONDS) ||
    !STUDIO_SUBJECT_PATTERN.test(subject) ||
    !SESSION_NONCE_PATTERN.test(parts[3])
  ) {
    return null;
  }
  const expectedSignature = signScopedPayload(
    "session:v2",
    parts.slice(0, 4).join("."),
    secret,
  );
  return signatureMatches(parts[4], expectedSignature)
    ? { version: "v2", expiresAt, subject }
    : null;
}

export function verifySessionToken(
  token: string | null | undefined,
  now = Date.now(),
): boolean {
  return verifiedSession(token, now) !== null;
}

function createStudioIdentityToken(
  subject: string,
  now = Date.now(),
): string | null {
  const secret = secretValue("STUDIO_SESSION_SECRET");
  if (!secret || !STUDIO_SUBJECT_PATTERN.test(subject)) return null;

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + STUDIO_IDENTITY_TTL_SECONDS;
  const payload = `bi1.${issuedAt}.${expiresAt}.${subject}`;
  const signature = signScopedPayload("identity:v1", payload, secret).toString(
    "base64url",
  );
  return `${payload}.${signature}`;
}

function verifiedStudioIdentity(
  token: string | null | undefined,
  now = Date.now(),
): VerifiedStudioIdentity | null {
  const secret = secretValue("STUDIO_SESSION_SECRET");
  if (!secret || !token || token.length > MAX_SIGNED_TOKEN_LENGTH) return null;

  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "bi1") return null;
  const issuedAt = Number(parts[1]);
  const expiresAt = Number(parts[2]);
  const subject = parts[3];
  const nowSeconds = Math.floor(now / 1000);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    issuedAt > nowSeconds + TOKEN_CLOCK_SKEW_SECONDS ||
    expiresAt <= nowSeconds ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > STUDIO_IDENTITY_TTL_SECONDS ||
    !STUDIO_SUBJECT_PATTERN.test(subject)
  ) {
    return null;
  }
  const expectedSignature = signScopedPayload(
    "identity:v1",
    parts.slice(0, 4).join("."),
    secret,
  );
  return signatureMatches(parts[4], expectedSignature)
    ? { subject, issuedAt, expiresAt }
    : null;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

function legacySessionIdentity(token: string): string {
  return createHash("sha256")
    .update("vixel-studio-session:v1\0", "utf8")
    .update(token, "utf8")
    .digest("hex");
}

function sessionSubject(
  token: string | null,
  session: VerifiedSession | null,
): string | null {
  if (!token || !session) return null;
  if (session.version === "v2") return session.subject;
  if (session.version === "v3") {
    return createHash("sha256")
      .update("vixel-account-user:v1\0", "utf8")
      .update(session.userId, "utf8")
      .digest("hex");
  }
  return legacySessionIdentity(token);
}

/**
 * Creates a short-lived authenticated session bound to a signed, long-lived
 * pseudonymous browser identity. The access code is never stored in either
 * token. Invalid client cookie text is ignored unless its HMAC verifies.
 */
export function createStudioLoginSession(
  request: Request,
  now = Date.now(),
): StudioLoginSession | null {
  const identity = verifiedStudioIdentity(
    readCookie(request, STUDIO_IDENTITY_COOKIE),
    now,
  );
  const currentSessionToken = readCookie(request, STUDIO_SESSION_COOKIE);
  const currentSession = verifiedSession(currentSessionToken, now);
  const subject =
    sessionSubject(currentSessionToken, currentSession) ??
    identity?.subject ??
    randomBytes(32).toString("hex");
  const sessionToken = createSessionTokenForSubject(subject, now);
  if (!sessionToken) return null;

  if (identity?.subject === subject) {
    return { sessionToken, identityTokenToSet: null };
  }
  const identityTokenToSet = createStudioIdentityToken(subject, now);
  return identityTokenToSet
    ? { sessionToken, identityTokenToSet }
    : null;
}

/**
 * Upgrades an authenticated legacy session, or repairs a missing identity
 * cookie from a valid v2 session. It never accepts an unsigned subject.
 */
export function studioSessionMigrationCookies(
  request: Request,
  now = Date.now(),
): string[] {
  const sessionToken = readCookie(request, STUDIO_SESSION_COOKIE);
  const session = verifiedSession(sessionToken, now);
  if (!session || !sessionToken) return [];
  if (session.version === "v3") return [];

  const identity = verifiedStudioIdentity(
    readCookie(request, STUDIO_IDENTITY_COOKIE),
    now,
  );
  const subject = sessionSubject(sessionToken, session);
  if (!subject) return [];
  if (session.version === "v2" && identity?.subject === subject) return [];

  const cookies: string[] = [];
  if (identity?.subject !== subject) {
    const identityToken = createStudioIdentityToken(subject, now);
    if (!identityToken) return [];
    cookies.push(studioIdentityCookie(identityToken));
  }
  if (session.version === "v1") {
    const upgradedSession = createSessionTokenForSubject(subject, now);
    if (!upgradedSession) return [];
    cookies.push(sessionCookie(upgradedSession));
  }
  return cookies;
}

export function getAccessState(request: Request): AccessState {
  const runtime = getServerRuntimeConfig();
  if (!runtime.access.required) {
    return { allowed: true, required: false, configured: false };
  }
  if (!runtime.access.configured) {
    return {
      allowed: false,
      required: true,
      configured: false,
      reason: "not_configured",
    };
  }
  const session = verifiedSession(
    readCookie(request, STUDIO_SESSION_COOKIE),
  );
  if (
    session?.version === "v3" &&
    session.accountStatus !== "approved"
  ) {
    return {
      allowed: false,
      required: true,
      configured: true,
      reason: "not_approved",
    };
  }
  if (session) {
    return { allowed: true, required: true, configured: true };
  }
  return {
    allowed: false,
    required: true,
    configured: true,
    reason: "not_authenticated",
  };
}

export function requireStudioSession(
  request: Request,
  requestId: string,
): Response | null {
  const state = getAccessState(request);
  if (state.allowed) return null;
  if (state.reason === "not_configured") {
    return apiError(
      503,
      "access_not_configured",
      "Studio access is not configured on this deployment.",
      false,
      requestId,
    );
  }
  if (state.reason === "not_approved") {
    return apiError(
      403,
      "waitlist_approval_required",
      "Waitlist approval is required to enter Studio.",
      false,
      requestId,
    );
  }
  return apiError(
    401,
    "authentication_required",
    "A valid studio session is required.",
    false,
    requestId,
  );
}

/**
 * Returns the stable, pseudonymous owner bound into an authenticated session.
 *
 * v2 subjects are accepted only after the whole session token verifies. During
 * the bounded v1 migration window, the legacy cookie hash remains the owner so
 * already-created ledger rows do not become inaccessible. Raw bearer cookies
 * must never enter a database, log, or API response.
 */
export function getStudioSessionIdentity(request: Request): string | null {
  const token = readCookie(request, STUDIO_SESSION_COOKIE);
  const session = verifiedSession(token);
  return sessionSubject(token, session);
}

export function getAccountSession(
  request: Request,
  now = Date.now(),
): AccountSession | null {
  const session = verifiedSession(
    readCookie(request, STUDIO_SESSION_COOKIE),
    now,
  );
  if (!session || session.version !== "v3") return null;
  return {
    userId: session.userId,
    email: session.email,
    accountStatus: session.accountStatus,
    appRole: session.appRole,
    expiresAt: session.expiresAt,
  };
}

export function verifyAccessCode(candidate: string): boolean {
  const expected = secretValue("STUDIO_ACCESS_CODE");
  return Boolean(expected && constantTimeTextEqual(candidate, expected));
}

export function sessionCookie(token: string): string {
  const attributes = [
    `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${STUDIO_SESSION_TTL_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

export function studioIdentityCookie(token: string): string {
  const attributes = [
    `${STUDIO_IDENTITY_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${STUDIO_IDENTITY_TTL_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

export function expiredSessionCookie(): string {
  const attributes = [
    `${STUDIO_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}
