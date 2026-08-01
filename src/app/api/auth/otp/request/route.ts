import { z } from "zod";

import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
  readJsonBody,
} from "@/lib/server/api";
import { getServerRuntimeConfig } from "@/lib/server/env";
import {
  requestSupabaseEmailOtp,
  SupabaseAuthError,
} from "@/lib/server/supabase-auth";
import { verifyTurnstile } from "@/lib/server/turnstile";

export const runtime = "nodejs";
export const maxDuration = 15;

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  captchaToken: z.string().max(4_096).optional(),
});

function remoteIp(request: Request): string | undefined {
  return request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim()
    .slice(0, 64);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  if (!mutationComesFromSameOrigin(request)) {
    return apiError(
      403,
      "cross_site_request_blocked",
      "This request must originate from Vixel UGC.",
      false,
      requestId,
    );
  }
  const feature = getServerRuntimeConfig().product.features.accountAuth;
  if (!feature.ready) {
    return apiError(
      503,
      "account_auth_unavailable",
      "Email sign-in is not available yet.",
      false,
      requestId,
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return apiError(
      error instanceof ApiRequestError &&
        error.code === "request_too_large"
        ? 413
        : 400,
      "invalid_request",
      "A valid sign-in request is required.",
      false,
      requestId,
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_email",
      "Enter a valid email address.",
      false,
      requestId,
    );
  }
  if (
    !(await verifyTurnstile({
      token: parsed.data.captchaToken ?? "",
      remoteIp: remoteIp(request),
      expectedAction: "otp",
    }))
  ) {
    return apiError(
      403,
      "bot_check_failed",
      "The security check could not be verified.",
      true,
      requestId,
    );
  }

  try {
    await requestSupabaseEmailOtp(parsed.data);
  } catch (error) {
    return apiError(
      error instanceof SupabaseAuthError &&
        error.code === "auth_not_configured"
        ? 503
        : 502,
      "otp_request_failed",
      "The sign-in code could not be sent. Try again shortly.",
      true,
      requestId,
    );
  }
  return jsonResponse({
    ok: true,
    requestId,
    message: "If the address can sign in, a six-digit code is on its way.",
  });
}
