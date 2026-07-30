import { authorizeAccount } from "@/lib/server/accounts";
import {
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
} from "@/lib/server/api";
import {
  BillingError,
  createCheckoutSession,
} from "@/lib/server/billing";

export const runtime = "nodejs";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

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
  const requestKey = request.headers.get("x-idempotency-key")?.trim() ?? "";
  if (!IDEMPOTENCY_PATTERN.test(requestKey)) {
    return apiError(
      400,
      "idempotency_key_required",
      "A valid idempotency key is required.",
      false,
      requestId,
    );
  }
  try {
    const checkout = await createCheckoutSession({
      userId: authorization.account.userId,
      email: authorization.account.email,
      requestKey,
    });
    return jsonResponse({ requestId, ...checkout });
  } catch (error) {
    const code =
      error instanceof BillingError ? error.code : "billing_unavailable";
    return apiError(
      code === "billing_price_not_configured" ? 503 : 502,
      code,
      code === "billing_price_not_configured"
        ? "The subscription price is not configured."
        : "Checkout is temporarily unavailable.",
      true,
      requestId,
    );
  }
}
