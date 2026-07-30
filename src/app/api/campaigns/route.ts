import { authorizeAccount } from "@/lib/server/accounts";
import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import { listCloudCampaigns } from "@/lib/server/cloud-campaigns";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  if (!getServerRuntimeConfig().product.features.cloudCampaigns.ready) {
    return apiError(
      503,
      "cloud_campaigns_unavailable",
      "Cloud campaign sync is not available yet.",
      false,
      requestId,
    );
  }
  try {
    const authorization = await authorizeAccount(request, requestId, {
      approved: true,
    });
    if (!authorization.allowed) return authorization.response;
    const campaigns = await listCloudCampaigns(authorization.account.userId);
    return jsonResponse({ requestId, campaigns });
  } catch {
    return apiError(
      503,
      "cloud_campaigns_unavailable",
      "Cloud campaigns could not be loaded.",
      true,
      requestId,
    );
  }
}
