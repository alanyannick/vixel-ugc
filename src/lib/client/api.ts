"use client";

import type {
  CampaignInput,
  CreativeBrief,
} from "@/lib/client/campaign-store";

export class StudioApiError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code = "UNKNOWN", retryable = false) {
    super(message);
    this.name = "StudioApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string; retryable?: boolean } }
    | null;

  if (!response.ok) {
    const error =
      body && typeof body === "object" && "error" in body ? body.error : null;
    throw new StudioApiError(
      error?.message ?? "The studio could not complete that request.",
      error?.code ?? `HTTP_${response.status}`,
      Boolean(error?.retryable),
    );
  }

  return body as T;
}

export async function createCreativeBrief(
  input: CampaignInput,
): Promise<{ brief: CreativeBrief; provider: string; requestId?: string }> {
  const response = await fetch("/api/creative/brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input,
      category: input.category.trim() || undefined,
      creatorDescription: input.creatorDescription?.trim() || undefined,
    }),
  });
  const result = await parseResponse<{
    brief: CreativeBrief;
    provider?: string;
    requestId?: string;
  }>(response);

  return {
    brief: result.brief,
    provider: result.provider ?? "director",
    requestId: result.requestId,
  };
}

export async function createImageCandidate(input: {
  prompt: string;
  aspectRatio: string;
  references?: Array<{ dataUrl?: string; url?: string }>;
  idempotencyKey: string;
}): Promise<{ url: string; provider: string; requestId?: string }> {
  const response = await fetch("/api/media/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await parseResponse<{
    url?: string;
    image?: { url?: string };
    result?: { url?: string };
    provider?: string;
    requestId?: string;
  }>(response);
  const url = result.url ?? result.image?.url ?? result.result?.url;
  if (!url) {
    throw new StudioApiError(
      "The provider completed without returning a usable image.",
      "RESULT_MISSING",
      true,
    );
  }
  return {
    url,
    provider: result.provider ?? "NewAPI",
    requestId: result.requestId,
  };
}

export type VideoJobResult = {
  taskId: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  progress: number | null;
  url: string | null;
  error: string | null;
};

export async function submitVideoCandidate(input: {
  prompt: string;
  durationSec: number;
  ratio: "1:1" | "16:9" | "9:16";
  resolution: "720p" | "1080p";
  generateAudio: boolean;
  idempotencyKey: string;
}): Promise<{ result: VideoJobResult; provider: string }> {
  const response = await fetch("/api/media/video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseResponse<{
    job: { provider?: string };
    result: VideoJobResult;
  }>(response);
  return {
    result: body.result,
    provider: body.job.provider ?? "NewAPI",
  };
}

export async function pollVideoCandidate(
  taskId: string,
): Promise<{ result: VideoJobResult; provider: string }> {
  const response = await fetch(
    `/api/media/video/${encodeURIComponent(taskId)}`,
    { cache: "no-store" },
  );
  const body = await parseResponse<{
    job: { provider?: string };
    result: VideoJobResult;
  }>(response);
  return {
    result: body.result,
    provider: body.job.provider ?? "NewAPI",
  };
}
