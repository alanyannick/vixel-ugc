import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import {
  projectResendWebhook,
  verifyResendWebhook,
} from "@/lib/server/lifecycle-email";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return apiError(
      400,
      "invalid_webhook_body",
      "The webhook body is invalid.",
      false,
      requestId,
    );
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return apiError(
      413,
      "webhook_too_large",
      "The webhook payload is too large.",
      false,
      requestId,
    );
  }

  const eventId = request.headers.get("svix-id");
  try {
    const event = verifyResendWebhook({
      rawBody,
      svixId: eventId,
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
    });
    const projected = await projectResendWebhook({
      eventId: eventId!,
      event,
      rawBody,
    });
    return jsonResponse({ ok: true, requestId, ...projected });
  } catch {
    return apiError(
      400,
      "invalid_resend_webhook",
      "The Resend webhook could not be verified.",
      false,
      requestId,
    );
  }
}
