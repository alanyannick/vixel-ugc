import { z } from "zod";

import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/api";
import {
  createSessionToken,
  expiredSessionCookie,
  getAccessState,
  sessionCookie,
  verifyAccessCode,
} from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 10;

const loginSchema = z.object({
  code: z.string().max(1_024),
});

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const state = getAccessState(request);
  return jsonResponse({
    ok: true,
    authenticated: state.allowed,
    required: state.required,
    configured: state.configured,
    requestId,
  });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const state = getAccessState(request);
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

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
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
    return apiError(
      401,
      "invalid_access_code",
      "The access code is invalid.",
      false,
      requestId,
    );
  }
  const token = createSessionToken();
  if (!token) {
    return apiError(
      503,
      "access_not_configured",
      "Studio access is not configured on this deployment.",
      false,
      requestId,
    );
  }
  return jsonResponse(
    {
      ok: true,
      authenticated: true,
      required: true,
      requestId,
    },
    { headers: { "set-cookie": sessionCookie(token) } },
  );
}

export async function DELETE(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  return jsonResponse(
    { ok: true, authenticated: false, requestId },
    { headers: { "set-cookie": expiredSessionCookie() } },
  );
}

