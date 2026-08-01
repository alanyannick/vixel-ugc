import { authorizeAccount } from "@/lib/server/accounts";
import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import {
  getAdminOverview,
  isAdminOverviewWindow,
} from "@/lib/server/admin-operations";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const authorization = await authorizeAccount(request, requestId, {
      approved: true,
      admin: true,
    });
    if (!authorization.allowed) return authorization.response;

    const rawWindow = new URL(request.url).searchParams.get("window") ?? "30";
    const windowDays = Number(rawWindow);
    if (!Number.isInteger(windowDays) || !isAdminOverviewWindow(windowDays)) {
      return apiError(
        400,
        "invalid_admin_window",
        "The admin overview window must be 7, 30, or 90 days.",
        false,
        requestId,
      );
    }
    const overview = await getAdminOverview(windowDays);
    return jsonResponse({ overview });
  } catch {
    return apiError(
      503,
      "admin_overview_unavailable",
      "The admin overview is temporarily unavailable.",
      true,
      requestId,
    );
  }
}
