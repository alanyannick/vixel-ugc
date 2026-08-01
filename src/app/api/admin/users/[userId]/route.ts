import { z } from "zod";

import { authorizeAccount } from "@/lib/server/accounts";
import {
  AdminUserOperationError,
  mutateAdminUser,
} from "@/lib/server/admin-operations";
import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
  readJsonBody,
} from "@/lib/server/api";

export const runtime = "nodejs";
export const maxDuration = 15;

const userIdSchema = z.string().uuid();
const mutationSchema = z.object({
  action: z.enum(["suspend", "restore", "grant_admin", "revoke_admin"]),
  reason: z.string().max(240),
});

type Context = { params: Promise<{ userId: string }> };

function operationStatus(error: AdminUserOperationError): number {
  if (error.code === "not_found") return 404;
  if (error.code === "actor_not_authorized") return 403;
  if (error.code === "invalid_reason") return 400;
  return 409;
}

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

    const { userId } = await context.params;
    if (!userIdSchema.safeParse(userId).success) {
      return apiError(
        400,
        "invalid_admin_user",
        "The target user identifier is invalid.",
        false,
        requestId,
      );
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return apiError(
        error instanceof ApiRequestError && error.code === "request_too_large"
          ? 413
          : 400,
        "invalid_admin_user_operation",
        "A valid admin user operation is required.",
        false,
        requestId,
      );
    }
    const parsed = mutationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        400,
        "invalid_admin_user_operation",
        "The admin user operation is invalid.",
        false,
        requestId,
      );
    }

    const result = await mutateAdminUser({
      userId: userId.toLowerCase(),
      action: parsed.data.action,
      reason: parsed.data.reason,
      actorUserId: authorization.account.userId,
      requestId,
    });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof AdminUserOperationError) {
      return apiError(
        operationStatus(error),
        error.code,
        error.message,
        false,
        requestId,
      );
    }
    return apiError(
      503,
      "admin_user_operation_unavailable",
      "The admin user operation is temporarily unavailable.",
      true,
      requestId,
    );
  }
}
