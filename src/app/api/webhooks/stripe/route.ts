import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import {
  BillingError,
  constructStripeEvent,
  projectStripeEvent,
} from "@/lib/server/billing";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_WEBHOOK_BYTES
  ) {
    return apiError(
      413,
      "webhook_too_large",
      "The webhook payload is too large.",
      false,
      requestId,
    );
  }
  const signature = request.headers.get("stripe-signature")?.trim();
  if (!signature) {
    return apiError(
      400,
      "stripe_signature_required",
      "A Stripe signature is required.",
      false,
      requestId,
    );
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return apiError(
      413,
      "webhook_too_large",
      "The webhook payload is too large.",
      false,
      requestId,
    );
  }
  try {
    const event = await constructStripeEvent(rawBody, signature);
    const result = await projectStripeEvent({ event, rawBody });
    return jsonResponse({ requestId, received: true, ...result });
  } catch (error) {
    const invalid =
      error instanceof BillingError &&
      error.code === "billing_event_invalid";
    return apiError(
      invalid ? 400 : 503,
      invalid ? "stripe_signature_invalid" : "stripe_webhook_unavailable",
      invalid
        ? "The Stripe signature is invalid."
        : "The Stripe webhook could not be processed.",
      !invalid,
      requestId,
    );
  }
}
