import { authorizeAccount } from "@/lib/server/accounts";
import {
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
} from "@/lib/server/api";
import {
  BillingError,
  createBillingPortalSession,
} from "@/lib/server/billing";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  if (!mutationComesFromSameOrigin(request)) {
    return apiError(
      403,
      "cross_origin_mutation_rejected",
      "The billing request must come from this site.",
      false,
      requestId,
    );
  }
  const authorization = await authorizeAccount(request, requestId, {
    approved: true,
  });
  if (!authorization.allowed) return authorization.response;
  try {
    const portal = await createBillingPortalSession({
      userId: authorization.account.userId,
    });
    return jsonResponse({ requestId, ...portal });
  } catch (error) {
    const missing =
      error instanceof BillingError &&
      error.code === "billing_customer_missing";
    return apiError(
      missing ? 409 : 502,
      missing ? "billing_customer_missing" : "billing_unavailable",
      missing
        ? "Start a subscription before opening the billing portal."
        : "The billing portal is temporarily unavailable.",
      !missing,
      requestId,
    );
  }
}
