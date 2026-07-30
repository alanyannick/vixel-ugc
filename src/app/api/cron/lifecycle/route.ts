import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import { constantTimeTextEqual } from "@/lib/server/auth";
import { envValue } from "@/lib/server/env";
import {
  deliverLifecycleEmails,
  enqueueInvitationReminders,
  projectProductUpdatePreferences,
} from "@/lib/server/lifecycle-email";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const expected = envValue(process.env, "CRON_SECRET");
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!expected || !supplied || !constantTimeTextEqual(supplied, expected)) {
    return apiError(
      401,
      "cron_authentication_required",
      "A valid cron authorization is required.",
      false,
      requestId,
    );
  }
  try {
    const remindersEnqueued = await enqueueInvitationReminders();
    const preferenceProjection = await projectProductUpdatePreferences();
    const delivery = await deliverLifecycleEmails();
    return jsonResponse({
      ok: true,
      requestId,
      remindersEnqueued,
      preferenceProjection,
      delivery,
    });
  } catch {
    return apiError(
      503,
      "lifecycle_processing_failed",
      "Lifecycle processing could not complete.",
      true,
      requestId,
    );
  }
}
