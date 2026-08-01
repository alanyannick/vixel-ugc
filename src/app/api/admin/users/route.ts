import { z } from "zod";

import { authorizeAccount } from "@/lib/server/accounts";
import { listAdminUsers } from "@/lib/server/admin-operations";
import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  search: z.string().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const authorization = await authorizeAccount(request, requestId, {
      approved: true,
      admin: true,
    });
    if (!authorization.allowed) return authorization.response;

    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      search: params.get("search") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return apiError(
        400,
        "invalid_admin_user_query",
        "The admin user search or limit is invalid.",
        false,
        requestId,
      );
    }
    const result = await listAdminUsers(parsed.data);
    return jsonResponse(result);
  } catch {
    return apiError(
      503,
      "admin_users_unavailable",
      "Admin users are temporarily unavailable.",
      true,
      requestId,
    );
  }
}
