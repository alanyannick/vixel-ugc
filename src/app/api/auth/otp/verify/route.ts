import { z } from "zod";

import { ensureAccountProfile } from "@/lib/server/accounts";
import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
  readJsonBody,
} from "@/lib/server/api";
import {
  createAccountSessionToken,
  sessionCookie,
} from "@/lib/server/auth";
import { getServerRuntimeConfig } from "@/lib/server/env";
import {
  SupabaseAuthError,
  verifySupabaseEmailOtp,
} from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const maxDuration = 15;

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  code: z.string().regex(/^[0-9]{6}$/),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  if (!mutationComesFromSameOrigin(request)) {
    return apiError(
      403,
      "cross_site_request_blocked",
      "This request must originate from Vixel Campaigns.",
      false,
      requestId,
    );
  }
  if (!getServerRuntimeConfig().product.features.accountAuth.ready) {
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
      "A valid verification request is required.",
      false,
      requestId,
    );
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_otp",
      "Enter the six-digit code from your email.",
      false,
      requestId,
    );
  }

  try {
    const identity = await verifySupabaseEmailOtp({
      email: parsed.data.email,
      token: parsed.data.code,
    });
    const account = await ensureAccountProfile(identity);
    const token = createAccountSessionToken({
      userId: account.userId,
      email: account.email,
      accountStatus: account.accountStatus,
      appRole: account.appRole,
    });
    if (!token) {
      return apiError(
        503,
        "session_signing_unavailable",
        "The account session could not be created.",
        false,
        requestId,
      );
    }
    return jsonResponse(
      {
        ok: true,
        requestId,
        account: {
          email: account.email,
          accountStatus: account.accountStatus,
          appRole: account.appRole,
        },
      },
      { headers: { "set-cookie": sessionCookie(token) } },
    );
  } catch (error) {
    const invalidOtp =
      error instanceof SupabaseAuthError &&
      error.code === "otp_verification_failed";
    return apiError(
      invalidOtp ? 400 : 503,
      invalidOtp ? "invalid_otp" : "account_session_unavailable",
      invalidOtp
        ? "The sign-in code is invalid or has expired."
        : "The account session could not be created.",
      false,
      requestId,
    );
  }
}
