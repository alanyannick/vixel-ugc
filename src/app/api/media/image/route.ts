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
  imageGenerationRequestSchema,
  imageSizeFor,
  parsedReferences,
  providerErrorResponse,
  requireLiveGeneration,
  resolveIdempotencyKey,
} from "@/lib/server/media";
import {
  generateNewApiImage,
  ProviderRequestError,
} from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const parsed = imageGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_image_request",
      "The image request is invalid. References must be uploaded PNG, JPEG, or WebP data URLs.",
      false,
      requestId,
    );
  }

  const references = parsedReferences(parsed.data);
  const referenceHashes = references.map((reference) =>
    createHash("sha256").update(reference.bytes).digest("hex"),
  );
  let idempotencyKey: string;
  try {
    idempotencyKey = resolveIdempotencyKey(
      request,
      "image",
      parsed.data.idempotencyKey,
      {
        prompt: parsed.data.prompt,
        size: parsed.data.size,
        aspectRatio: parsed.data.aspectRatio,
        references: referenceHashes,
      },
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
    const generated = await generateNewApiImage({
      prompt: parsed.data.prompt,
      size: imageSizeFor(parsed.data.size, parsed.data.aspectRatio),
      aspectRatio: parsed.data.aspectRatio,
      references,
      idempotencyKey,
      signal: request.signal,
    });
    return jsonResponse({
      requestId,
      job: {
        id: `image_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`,
        kind: "image",
        status: "succeeded",
        provider: "newapi",
        model: generated.model,
        mode: generated.mode,
        attempts: generated.attempts,
        idempotencyKey,
      },
      result: generated.result,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return providerErrorResponse(error, requestId);
    }
    return apiError(
      500,
      "image_generation_failed",
      "Image generation could not be completed.",
      false,
      requestId,
    );
  }
}

