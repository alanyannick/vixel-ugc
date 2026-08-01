import { getAccountProfile } from "@/lib/server/accounts";
import {
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
} from "@/lib/server/api";
import {
  createAccountSessionToken,
  expiredSessionCookie,
  getAccountSession,
  sessionCookie,
} from "@/lib/server/auth";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const feature = getServerRuntimeConfig().product.features.accountAuth;
  const currentSession = getAccountSession(request);
  if (!currentSession) {
    return jsonResponse({
      requestId,
      authenticated: false,
      enabled: feature.enabled,
      ready: feature.ready,
    });
  }
  try {
    const account = await getAccountProfile(currentSession.userId);
    if (!account) {
      return apiError(
        401,
        "account_not_found",
        "The account session is no longer valid.",
        false,
        requestId,
        { "set-cookie": expiredSessionCookie() },
      );
    }
    const refreshedToken = createAccountSessionToken({
      userId: account.userId,
      email: account.email,
      accountStatus: account.accountStatus,
      appRole: account.appRole,
    });
    if (!refreshedToken) {
      return apiError(
        503,
        "session_signing_unavailable",
        "The account session could not be refreshed.",
        false,
        requestId,
      );
    }
    const refreshedCookie = sessionCookie(refreshedToken);
    if (account.accountStatus === "suspended") {
      return apiError(
        403,
        "account_suspended",
        "This account is suspended.",
        false,
        requestId,
        { "set-cookie": refreshedCookie },
      );
    }
    return jsonResponse(
      {
        requestId,
        authenticated: true,
        enabled: feature.enabled,
        ready: feature.ready,
        account: {
          userId: account.userId,
          email: account.email,
          displayName: account.displayName,
          accountStatus: account.accountStatus,
          appRole: account.appRole,
        },
      },
      { headers: { "set-cookie": refreshedCookie } },
    );
  } catch {
    return apiError(
      503,
      "account_database_unavailable",
      "Account status is temporarily unavailable.",
      true,
      requestId,
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
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
  return jsonResponse(
    { ok: true, requestId },
    { headers: { "set-cookie": expiredSessionCookie() } },
  );
}
