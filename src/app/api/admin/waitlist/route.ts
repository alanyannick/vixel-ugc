import { z } from "zod";

import { authorizeAccount } from "@/lib/server/accounts";
import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import { listWaitlist, type WaitlistStatus } from "@/lib/server/waitlist";

export const runtime = "nodejs";
export const maxDuration = 15;

const statusSchema = z.enum([
  "pending",
  "approved",
  "invited",
  "rejected",
  "converted",
]);

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const authorization = await authorizeAccount(request, requestId, {
      approved: true,
      admin: true,
    });
    if (!authorization.allowed) return authorization.response;

    const url = new URL(request.url);
    const statusResult = statusSchema.safeParse(url.searchParams.get("status"));
    const status = statusResult.success
      ? (statusResult.data as WaitlistStatus)
      : undefined;
    const search = url.searchParams.get("search")?.slice(0, 160);
    const entries = await listWaitlist({ status, search });
    return jsonResponse({ requestId, entries });
  } catch {
    return apiError(
      503,
      "admin_waitlist_unavailable",
      "The waitlist could not be loaded.",
      true,
      requestId,
    );
  }
}
