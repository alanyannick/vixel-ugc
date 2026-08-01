import { authorizeBillingManagement } from "@/lib/server/accounts";
import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import { getBillingState } from "@/lib/server/billing";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const authorization = await authorizeBillingManagement(request, requestId);
  if (!authorization.allowed) return authorization.response;
  const config = getServerRuntimeConfig();
  const state = await getBillingState(authorization.account.userId);
  const manageableSubscription =
    state.status === "active" ||
    state.status === "trialing" ||
    (state.subscriptionConfigured &&
      state.status !== "canceled" &&
      state.status !== "incomplete_expired");
  if (manageableSubscription && config.product.stripe.configured) {
    return jsonResponse({
      requestId,
      enabled: true,
      ready: true,
      state,
    });
  }
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
  return jsonResponse({
    requestId,
    enabled: true,
    ready: true,
    state,
  });
}
