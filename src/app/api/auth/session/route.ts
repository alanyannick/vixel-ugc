import { authorizeAccount } from "@/lib/server/accounts";
import {
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
} from "@/lib/server/api";
import { expiredSessionCookie, getAccountSession } from "@/lib/server/auth";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const feature = getServerRuntimeConfig().product.features.accountAuth;
  if (!getAccountSession(request)) {
    return jsonResponse({
      requestId,
      authenticated: false,
      enabled: feature.enabled,
      ready: feature.ready,
    });
  }
  try {
    const authorization = await authorizeAccount(request, requestId);
    if (!authorization.allowed) return authorization.response;
    return jsonResponse({
      requestId,
      authenticated: true,
      enabled: feature.enabled,
      ready: feature.ready,
      account: {
        email: authorization.account.email,
        displayName: authorization.account.displayName,
        accountStatus: authorization.account.accountStatus,
        appRole: authorization.account.appRole,
      },
    });
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
      "This request must originate from Vixel UGC.",
      false,
      requestId,
    );
  }
  return jsonResponse(
    { ok: true, requestId },
    { headers: { "set-cookie": expiredSessionCookie() } },
  );
}
