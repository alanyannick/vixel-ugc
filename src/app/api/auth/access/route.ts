import { z } from "zod";

import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
  readJsonBody,
} from "@/lib/server/api";
import {
  createStudioLoginSession,
  expiredSessionCookie,
  getOperatorRecoveryAccessState,
  sessionCookie,
  studioIdentityCookie,
  studioSessionMigrationCookies,
  verifyAccessCode,
} from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 10;

const loginSchema = z.object({
  code: z.string().max(1_024),
});

const FAILED_ATTEMPT_LIMIT = 8;
const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1_000;
const MAX_TRACKED_CLIENTS = 5_000;

type AttemptRecord = {
  failures: number;
  resetAt: number;
};

// This is intentionally a best-effort, per-instance brake. It limits cheap
// brute-force bursts against a warm function, but it is not a distributed
// security boundary. Production deployments should additionally enforce a
// shared edge/WAF rate limit.
const accessAttempts = new Map<string, AttemptRecord>();

function clientKey(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return (forwarded || request.headers.get("x-real-ip")?.trim() || "unknown").slice(
    0,
    128,
  );
}

function pruneAttemptStore(now: number): void {
  if (accessAttempts.size < 1_000) return;
  for (const [key, record] of accessAttempts) {
    if (record.resetAt <= now) accessAttempts.delete(key);
  }
  while (accessAttempts.size > MAX_TRACKED_CLIENTS) {
    const oldestKey = accessAttempts.keys().next().value as string | undefined;
    if (!oldestKey) break;
    accessAttempts.delete(oldestKey);
  }
}

function activeAttemptRecord(key: string, now: number): AttemptRecord | null {
  const record = accessAttempts.get(key);
  if (!record) return null;
  if (record.resetAt <= now) {
    accessAttempts.delete(key);
    return null;
  }
  return record;
}

function recordFailedAttempt(key: string, now: number): void {
  pruneAttemptStore(now);
  const current = activeAttemptRecord(key, now);
  accessAttempts.set(key, {
    failures: (current?.failures ?? 0) + 1,
    resetAt: current?.resetAt ?? now + FAILED_ATTEMPT_WINDOW_MS,
  });
}

function crossSiteError(requestId: string): Response {
  return apiError(
    403,
    "cross_site_request_blocked",
    "This request must originate from the studio.",
    false,
    requestId,
  );
}

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const state = getOperatorRecoveryAccessState(request);
  const headers = new Headers();
  if (state.allowed && state.required) {
    for (const cookie of studioSessionMigrationCookies(request)) {
      headers.append("set-cookie", cookie);
    }
  }
  return jsonResponse(
    {
      ok: true,
      authenticated: state.allowed,
      required: state.required,
      configured: state.configured,
      requestId,
    },
    { headers },
  );
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  if (!mutationComesFromSameOrigin(request)) {
    return crossSiteError(requestId);
  }

  const state = getOperatorRecoveryAccessState(request);
  if (!state.required) {
    return jsonResponse({
      ok: true,
      authenticated: true,
      required: false,
      requestId,
    });
  }
  if (!state.configured) {
    return apiError(
      503,
      "access_not_configured",
      "Studio access is not configured on this deployment.",
      false,
      requestId,
    );
  }

  const attemptKey = clientKey(request);
  const now = Date.now();
  const attemptRecord = activeAttemptRecord(attemptKey, now);
  if (attemptRecord && attemptRecord.failures >= FAILED_ATTEMPT_LIMIT) {
    const retryAfter = Math.max(
      1,
      Math.ceil((attemptRecord.resetAt - now) / 1_000),
    );
    return apiError(
      429,
      "access_rate_limited",
      "Too many access attempts. Try again later.",
      true,
      requestId,
      { "retry-after": String(retryAfter) },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    recordFailedAttempt(attemptKey, now);
    return apiError(
      error instanceof ApiRequestError && error.code === "request_too_large"
        ? 413
        : 400,
      error instanceof ApiRequestError ? error.code : "invalid_json",
      "A valid JSON request body is required.",
      false,
      requestId,
    );
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success || !verifyAccessCode(parsed.data.code)) {
    recordFailedAttempt(attemptKey, now);
    return apiError(
      401,
      "invalid_access_code",
      "The access code is invalid.",
      false,
      requestId,
    );
  }
  accessAttempts.delete(attemptKey);
  const loginSession = createStudioLoginSession(request);
  if (!loginSession) {
    return apiError(
      503,
      "access_not_configured",
      "Studio access is not configured on this deployment.",
      false,
      requestId,
    );
  }
  const headers = new Headers();
  if (loginSession.identityTokenToSet) {
    headers.append(
      "set-cookie",
      studioIdentityCookie(loginSession.identityTokenToSet),
    );
  }
  headers.append("set-cookie", sessionCookie(loginSession.sessionToken));
  return jsonResponse(
    {
      ok: true,
      authenticated: true,
      required: true,
      requestId,
    },
    { headers },
  );
}

export async function DELETE(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  if (!mutationComesFromSameOrigin(request)) {
    return crossSiteError(requestId);
  }
  return jsonResponse(
    { ok: true, authenticated: false, requestId },
    { headers: { "set-cookie": expiredSessionCookie() } },
  );
}
