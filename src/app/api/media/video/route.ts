import { createHash } from "node:crypto";

import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/api";
import { requireStudioSession } from "@/lib/server/auth";
import {
  IdempotencyKeyConflictError,
  providerErrorResponse,
  requireLiveGeneration,
  resolveIdempotencyKey,
  videoGenerationRequestSchema,
} from "@/lib/server/media";
import {
  ProviderRequestError,
  submitNewApiVideo,
} from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const accessError = requireStudioSession(request, requestId);
  if (accessError) return accessError;
  const liveError = requireLiveGeneration(requestId);
  if (liveError) return liveError;

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const tooLarge =
      error instanceof ApiRequestError && error.code === "request_too_large";
    return apiError(
      tooLarge ? 413 : 400,
      tooLarge ? "request_too_large" : "invalid_json",
      tooLarge
        ? "The request body is too large."
        : "A valid JSON request body is required.",
      false,
      requestId,
    );
  }
  const parsed = videoGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_video_request",
      "The video request is invalid. Frame references must be uploaded PNG, JPEG, or WebP data URLs.",
      false,
      requestId,
    );
  }

  const canonicalInput = {
    ...parsed.data,
    imageDataUrl: parsed.data.imageDataUrl
      ? createHash("sha256").update(parsed.data.imageDataUrl).digest("hex")
      : null,
    lastImageDataUrl: parsed.data.lastImageDataUrl
      ? createHash("sha256").update(parsed.data.lastImageDataUrl).digest("hex")
      : null,
    idempotencyKey: undefined,
  };
  let idempotencyKey: string;
  try {
    idempotencyKey = resolveIdempotencyKey(
      request,
      "video",
      parsed.data.idempotencyKey,
      canonicalInput,
    );
  } catch (error) {
    if (error instanceof IdempotencyKeyConflictError) {
      return apiError(
        400,
        "idempotency_key_conflict",
        "The header and body idempotency keys do not match.",
        false,
        requestId,
      );
    }
    throw error;
  }

  try {
    const submitted = await submitNewApiVideo({
      ...parsed.data,
      idempotencyKey,
      signal: request.signal,
    });
    return jsonResponse(
      {
        requestId,
        job: {
          id: submitted.result.taskId,
          kind: "video",
          status: submitted.result.status,
          provider: "newapi",
          model: submitted.model,
          idempotencyKey,
        },
        result: submitted.result,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return providerErrorResponse(error, requestId);
    }
    return apiError(
      500,
      "video_submission_failed",
      "Video generation could not be submitted.",
      false,
      requestId,
    );
  }
}

