import { createHash } from "node:crypto";

import { z } from "zod";

import { apiError } from "./api";
import {
  imageDataUrlSchema,
  parseImageDataUrl,
  type ParsedImageDataUrl,
} from "./data-url";
import { getServerRuntimeConfig } from "./env";
import { ProviderRequestError } from "./provider";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const referenceSchema = z
  .object({
    dataUrl: imageDataUrlSchema.optional(),
    url: z.string().optional(),
    role: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((reference, context) => {
    if (reference.url !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message:
          "Remote reference URLs are not accepted. Upload an image data URL.",
      });
    }
    if (!reference.dataUrl) {
      context.addIssue({
        code: "custom",
        path: ["dataUrl"],
        message: "A reference image data URL is required.",
      });
    }
  });

export const imageGenerationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(8_000),
    references: z.array(referenceSchema).max(4).default([]),
    size: z
      .enum(["1024x1024", "1536x1024", "1024x1536"])
      .optional(),
    aspectRatio: z.enum(["1:1", "16:9", "9:16"]).optional(),
    idempotencyKey: z
      .string()
      .regex(IDEMPOTENCY_KEY_PATTERN)
      .optional(),
  })
  .superRefine((value, context) => {
    const sizeForRatio = {
      "1:1": "1024x1024",
      "16:9": "1536x1024",
      "9:16": "1024x1536",
    } as const;
    if (
      value.size &&
      value.aspectRatio &&
      sizeForRatio[value.aspectRatio] !== value.size
    ) {
      context.addIssue({
        code: "custom",
        path: ["size"],
        message: "Image size and aspect ratio do not match.",
      });
    }
  });

export const videoGenerationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(12_000),
    imageDataUrl: imageDataUrlSchema.optional(),
    firstFrameDataUrl: imageDataUrlSchema.optional(),
    image: imageDataUrlSchema.optional(),
    lastImageDataUrl: imageDataUrlSchema.optional(),
    lastFrameDataUrl: imageDataUrlSchema.optional(),
    durationSec: z
      .number()
      .int()
      .refine((value) => [4, 6, 8].includes(value), {
        message: "Video duration must be 4, 6, or 8 seconds.",
      })
      .default(8),
    ratio: z.enum(["1:1", "16:9", "9:16"]).optional(),
    aspectRatio: z.enum(["1:1", "16:9", "9:16"]).optional(),
    resolution: z.enum(["720p", "1080p"]).default("720p"),
    generateAudio: z.boolean().optional(),
    audio: z.boolean().optional(),
    idempotencyKey: z
      .string()
      .regex(IDEMPOTENCY_KEY_PATTERN)
      .optional(),
  })
  .superRefine((value, context) => {
    const firstFrames = [
      value.imageDataUrl,
      value.firstFrameDataUrl,
      value.image,
    ].filter((item): item is string => Boolean(item));
    if (new Set(firstFrames).size > 1) {
      context.addIssue({
        code: "custom",
        path: ["imageDataUrl"],
        message: "First-frame aliases must resolve to the same image.",
      });
    }
    if (
      value.ratio &&
      value.aspectRatio &&
      value.ratio !== value.aspectRatio
    ) {
      context.addIssue({
        code: "custom",
        path: ["ratio"],
        message: "Video ratio aliases must match.",
      });
    }
    if (
      value.generateAudio !== undefined &&
      value.audio !== undefined &&
      value.generateAudio !== value.audio
    ) {
      context.addIssue({
        code: "custom",
        path: ["generateAudio"],
        message: "Video audio aliases must match.",
      });
    }
    if (value.generateAudio === false || value.audio === false) {
      context.addIssue({
        code: "custom",
        path: ["generateAudio"],
        message: "The configured Veo 3.1 model always generates audio.",
      });
    }
    if (value.lastImageDataUrl || value.lastFrameDataUrl) {
      context.addIssue({
        code: "custom",
        path: ["lastImageDataUrl"],
        message:
          "Last-frame interpolation is not supported by the configured NewAPI adapter.",
      });
    }
    if (value.resolution === "1080p" && value.durationSec !== 8) {
      context.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "Veo 3.1 requires an 8-second duration for 1080p output.",
      });
    }
  })
  .transform((value) => ({
    prompt: value.prompt,
    imageDataUrl:
      value.imageDataUrl ?? value.firstFrameDataUrl ?? value.image,
    lastImageDataUrl:
      value.lastImageDataUrl ?? value.lastFrameDataUrl,
    durationSec: value.durationSec,
    ratio: value.ratio ?? value.aspectRatio ?? ("9:16" as const),
    resolution: value.resolution,
    generateAudio: value.generateAudio ?? value.audio ?? true,
    idempotencyKey: value.idempotencyKey,
  }));

export type ImageGenerationRequest = z.infer<
  typeof imageGenerationRequestSchema
>;
export type VideoGenerationRequest = z.infer<
  typeof videoGenerationRequestSchema
>;

export function parsedReferences(
  input: ImageGenerationRequest,
): ParsedImageDataUrl[] {
  return input.references.map((reference) => {
    const parsed = parseImageDataUrl(reference.dataUrl ?? "");
    if (!parsed) {
      throw new Error("invalid_reference");
    }
    return parsed;
  });
}

export function imageSizeFor(
  size: ImageGenerationRequest["size"],
  aspectRatio: ImageGenerationRequest["aspectRatio"],
): string {
  if (size) return size;
  if (aspectRatio === "16:9") return "1536x1024";
  if (aspectRatio === "9:16") return "1024x1536";
  return "1024x1024";
}

function safeHeaderIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  return value && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

export function resolveIdempotencyKey(
  request: Request,
  kind: "image" | "video",
  bodyKey: string | undefined,
  canonicalInput: unknown,
): string {
  const headerKey = safeHeaderIdempotencyKey(request);
  if (headerKey && bodyKey && headerKey !== bodyKey) {
    throw new IdempotencyKeyConflictError();
  }
  if (headerKey || bodyKey) return (headerKey ?? bodyKey)!;

  const digest = createHash("sha256")
    .update(JSON.stringify(canonicalInput))
    .digest("hex");
  return `${kind}:${digest}`;
}

export class IdempotencyKeyConflictError extends Error {
  constructor() {
    super("idempotency_key_conflict");
    this.name = "IdempotencyKeyConflictError";
  }
}

export function requireLiveGeneration(requestId: string): Response | null {
  const runtime = getServerRuntimeConfig();
  if (!runtime.liveGeneration) {
    return apiError(
      503,
      "live_generation_disabled",
      "Live generation is disabled on this deployment.",
      false,
      requestId,
    );
  }
  if (!runtime.newApi.configured) {
    return apiError(
      503,
      "provider_not_configured",
      "The generation provider is not configured.",
      false,
      requestId,
    );
  }
  return null;
}

export function providerErrorResponse(
  error: ProviderRequestError,
  requestId: string,
): Response {
  const status =
    error.code === "provider_not_configured"
      ? 503
      : error.code === "provider_timeout"
        ? 504
        : error.code === "provider_rejected_request" ||
            error.code === "provider_invalid_response"
          ? 502
          : 503;
  return apiError(
    status,
    error.code,
    error.message,
    error.retryable,
    requestId,
  );
}
