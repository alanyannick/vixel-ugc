import { z } from "zod";

import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  mutationComesFromSameOrigin,
  readJsonBody,
} from "@/lib/server/api";
import { getServerRuntimeConfig } from "@/lib/server/env";
import { verifyTurnstile } from "@/lib/server/turnstile";
import { submitWaitlist } from "@/lib/server/waitlist";

export const runtime = "nodejs";
export const maxDuration = 15;

const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  useCase: z.string().trim().max(1_000).optional(),
  expectedVolume: z.string().trim().max(80).optional(),
  productUpdatesOptedIn: z.boolean().optional().default(false),
  source: z.string().trim().max(120).optional(),
  captchaToken: z.string().max(4_096).optional(),
});

function remoteIp(request: Request): string | undefined {
  return request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim()
    .slice(0, 64);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  if (!mutationComesFromSameOrigin(request)) {
    return apiError(
      403,
      "cross_site_request_blocked",
      "This request must originate from Vixel Campaigns.",
      false,
      requestId,
    );
  }
  if (!getServerRuntimeConfig().product.features.waitlist.ready) {
    return apiError(
      503,
      "waitlist_unavailable",
      "The beta waitlist is not available yet.",
      true,
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
      "invalid_waitlist_request",
      "A valid waitlist request is required.",
      false,
      requestId,
    );
  }
  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_waitlist_request",
      "Enter a valid email and keep profile fields within their limits.",
      false,
      requestId,
    );
  }
  if (
    !(await verifyTurnstile({
      token: parsed.data.captchaToken ?? "",
      remoteIp: remoteIp(request),
      expectedAction: "waitlist",
    }))
  ) {
    return apiError(
      403,
      "bot_check_failed",
      "The security check could not be verified.",
      true,
      requestId,
    );
  }
  try {
    const entry = await submitWaitlist({
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      company: parsed.data.company,
      useCase: parsed.data.useCase,
      expectedVolume: parsed.data.expectedVolume,
      productUpdatesOptedIn: parsed.data.productUpdatesOptedIn,
      source: parsed.data.source,
    });
    return jsonResponse(
      {
        ok: true,
        requestId,
        waitlist: {
          status: entry.status,
          createdAt: entry.createdAt,
        },
      },
      { status: 202 },
    );
  } catch {
    return apiError(
      503,
      "waitlist_unavailable",
      "The beta waitlist is temporarily unavailable.",
      true,
      requestId,
    );
  }
}
