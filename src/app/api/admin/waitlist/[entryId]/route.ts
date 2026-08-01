import { z } from "zod";

import { authorizeAccount } from "@/lib/server/accounts";
import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
  readJsonBody,
} from "@/lib/server/api";
import {
  transitionWaitlist,
  updateWaitlistNote,
  WaitlistTransitionError,
} from "@/lib/server/waitlist";

export const runtime = "nodejs";
export const maxDuration = 15;

const entryIdSchema = z.string().uuid();
const mutationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("transition"),
    action: z.enum(["approve", "reject", "invite", "revoke"]),
    reason: z.string().max(240).optional(),
  }),
  z.object({
    operation: z.literal("note"),
    note: z.string().max(4_000).nullable(),
  }),
]);

type Context = { params: Promise<{ entryId: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
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
  try {
    const authorization = await authorizeAccount(request, requestId, {
      approved: true,
      admin: true,
    });
    if (!authorization.allowed) return authorization.response;
    const { entryId } = await context.params;
    if (!entryIdSchema.safeParse(entryId).success) {
      return apiError(
        400,
        "invalid_waitlist_entry",
        "The waitlist entry identifier is invalid.",
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
        "invalid_admin_operation",
        "A valid admin operation is required.",
        false,
        requestId,
      );
    }
    const parsed = mutationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        400,
        "invalid_admin_operation",
        "The admin operation is invalid.",
        false,
        requestId,
      );
    }
    const entry =
      parsed.data.operation === "transition"
        ? await transitionWaitlist({
            entryId,
            action: parsed.data.action,
            reason: parsed.data.reason,
            actorUserId: authorization.account.userId,
            requestId,
          })
        : await updateWaitlistNote({
            entryId,
            note: parsed.data.note,
            actorUserId: authorization.account.userId,
            requestId,
          });
    return jsonResponse({ ok: true, requestId, entry });
  } catch (error) {
    if (error instanceof WaitlistTransitionError) {
      const status =
        error.code === "not_found"
          ? 404
          : error.code === "actor_not_authorized"
            ? 403
            : error.code === "invalid_reason"
              ? 400
              : 409;
      return apiError(
        status,
        error.code,
        error.message,
        false,
        requestId,
      );
    }
    return apiError(
      503,
      "admin_waitlist_unavailable",
      "The waitlist could not be updated.",
      true,
      requestId,
    );
  }
}
