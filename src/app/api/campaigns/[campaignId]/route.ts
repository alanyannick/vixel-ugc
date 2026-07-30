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
  CloudCampaignError,
  deleteCloudCampaign,
  saveCloudCampaign,
} from "@/lib/server/cloud-campaigns";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 20;

const campaignIdSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

const campaignSchema = z
  .object({
    id: campaignIdSchema,
    revision: z.number().int().min(1),
    name: z.string().min(1).max(240),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

const saveSchema = z.object({
  expectedRevision: z.number().int().min(1).nullable(),
  campaign: campaignSchema,
});

const deleteSchema = z.object({
  expectedRevision: z.number().int().min(1),
});

type Context = { params: Promise<{ campaignId: string }> };

function campaignError(
  error: CloudCampaignError,
  requestId: string,
): Response {
  return apiError(
    error.code === "not_found" ? 404 : 409,
    error.code,
    error.currentRevision
      ? `${error.message} Current revision: ${error.currentRevision}.`
      : error.message,
    false,
    requestId,
  );
}

async function authorizeMutation(
  request: Request,
  requestId: string,
): Promise<
  | { allowed: true; userId: string }
  | { allowed: false; response: Response }
> {
  if (!mutationComesFromSameOrigin(request)) {
    return {
      allowed: false,
      response: apiError(
        403,
        "cross_site_request_blocked",
        "This request must originate from Vixel UGC.",
        false,
        requestId,
      ),
    };
  }
  if (!getServerRuntimeConfig().product.features.cloudCampaigns.ready) {
    return {
      allowed: false,
      response: apiError(
        503,
        "cloud_campaigns_unavailable",
        "Cloud campaign sync is not available yet.",
        false,
        requestId,
      ),
    };
  }
  const authorization = await authorizeAccount(request, requestId, {
    approved: true,
  });
  return authorization.allowed
    ? { allowed: true, userId: authorization.account.userId }
    : authorization;
}

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const authorization = await authorizeMutation(request, requestId);
    if (!authorization.allowed) return authorization.response;
    const { campaignId } = await context.params;
    if (!campaignIdSchema.safeParse(campaignId).success) {
      return apiError(
        400,
        "invalid_campaign_id",
        "The campaign identifier is invalid.",
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
        "invalid_campaign",
        "A valid campaign snapshot is required.",
        false,
        requestId,
      );
    }
    const parsed = saveSchema.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.campaign.id !== campaignId ||
      (parsed.data.expectedRevision === null
        ? parsed.data.campaign.revision < 1
        : parsed.data.campaign.revision !==
          parsed.data.expectedRevision + 1)
    ) {
      return apiError(
        400,
        "invalid_campaign",
        "The campaign snapshot or revision is invalid.",
        false,
        requestId,
      );
    }
    const campaign = await saveCloudCampaign({
      userId: authorization.userId,
      campaignKey: campaignId,
      title: parsed.data.campaign.name,
      snapshot: parsed.data.campaign,
      revision: parsed.data.campaign.revision,
      expectedRevision: parsed.data.expectedRevision,
    });
    return jsonResponse({ ok: true, requestId, campaign });
  } catch (error) {
    if (error instanceof CloudCampaignError) {
      return campaignError(error, requestId);
    }
    return apiError(
      503,
      "cloud_campaigns_unavailable",
      "The campaign could not be saved.",
      true,
      requestId,
    );
  }
}

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const authorization = await authorizeMutation(request, requestId);
    if (!authorization.allowed) return authorization.response;
    const { campaignId } = await context.params;
    if (!campaignIdSchema.safeParse(campaignId).success) {
      return apiError(
        400,
        "invalid_campaign_id",
        "The campaign identifier is invalid.",
        false,
        requestId,
      );
    }
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      return apiError(
        400,
        "invalid_campaign_delete",
        "A valid campaign revision is required.",
        false,
        requestId,
      );
    }
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        400,
        "invalid_campaign_delete",
        "A valid campaign revision is required.",
        false,
        requestId,
      );
    }
    await deleteCloudCampaign({
      userId: authorization.userId,
      campaignKey: campaignId,
      expectedRevision: parsed.data.expectedRevision,
    });
    return jsonResponse({ ok: true, requestId });
  } catch (error) {
    if (error instanceof CloudCampaignError) {
      return campaignError(error, requestId);
    }
    return apiError(
      503,
      "cloud_campaigns_unavailable",
      "The campaign could not be deleted.",
      true,
      requestId,
    );
  }
}
