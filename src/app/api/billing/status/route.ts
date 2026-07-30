import { authorizeAccount } from "@/lib/server/accounts";
import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import { getBillingState } from "@/lib/server/billing";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const authorization = await authorizeAccount(request, requestId, {
    approved: true,
  });
  if (!authorization.allowed) return authorization.response;
  const config = getServerRuntimeConfig();
  if (!config.product.features.billing.enabled) {
    return jsonResponse({
      requestId,
      enabled: false,
      ready: false,
      state: {
        status: "none",
        customerConfigured: false,
        subscriptionConfigured: false,
        priceId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        entitled: false,
      },
    });
  }
  if (!config.product.features.billing.ready) {
    return apiError(
      503,
      "billing_not_ready",
      "Subscription billing is not ready.",
      false,
      requestId,
    );
  }
  const state = await getBillingState(authorization.account.userId);
  return jsonResponse({
    requestId,
    enabled: true,
    ready: true,
    state,
  });
}
