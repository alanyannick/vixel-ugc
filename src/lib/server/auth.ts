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

type AccessState =
  | { allowed: true; required: boolean; configured: boolean }
  | {
      allowed: false;
      required: true;
      configured: boolean;
      reason: "not_authenticated" | "not_configured";
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

export function createSessionToken(now = Date.now()): string | null {
  const secret = secretValue("STUDIO_SESSION_SECRET");
  if (!secret) return null;

  const expiresAt = Math.floor(now / 1000) + STUDIO_SESSION_TTL_SECONDS;
  const payload = `v1.${expiresAt}.${randomBytes(18).toString("base64url")}`;
  const signature = signPayload(payload, secret).toString("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  now = Date.now(),
): boolean {
  const secret = secretValue("STUDIO_SESSION_SECRET");
  if (!secret || !token || token.length > 512) return false;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) {
    return false;
  }

  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(parts[3], "base64url");
  } catch {
    return false;
  }
  const expectedSignature = signPayload(parts.slice(0, 3).join("."), secret);
  return (
    suppliedSignature.length === expectedSignature.length &&
    timingSafeEqual(suppliedSignature, expectedSignature)
  );
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
  if (verifySessionToken(readCookie(request, STUDIO_SESSION_COOKIE))) {
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
  return apiError(
    401,
    "authentication_required",
    "A valid studio session is required.",
    false,
    requestId,
  );
}

/**
 * Returns a stable, pseudonymous owner for the authenticated studio session.
 *
 * The raw cookie and its bearer value must never enter a database, log, or API
 * response. Hashing the already-verified token gives the paid-work ledger a
 * session-scoped ownership key without creating another browser-visible
 * credential.
 */
export function getStudioSessionIdentity(request: Request): string | null {
  const token = readCookie(request, STUDIO_SESSION_COOKIE);
  if (!verifySessionToken(token)) return null;
  return createHash("sha256")
    .update("vixel-studio-session:v1\0", "utf8")
    .update(token!, "utf8")
    .digest("hex");
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
