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

export type MediaLedgerJob = {
  id: string;
  kind: "image" | "video";
  status:
    | "submitting"
    | "submitted"
    | "processing"
    | "succeeded"
    | "failed"
    | "submit_unknown"
    | "cancelled"
    | "reconciliation_required";
  provider: string;
  model: string;
  inputSignature: string;
  idempotencyKey: string;
  taskId: string | null;
  hasResult: boolean;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
};

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

export async function approveMediaInput(
  kind: "image" | "video",
  input: Record<string, unknown> & { idempotencyKey: string },
): Promise<{
  approvalToken: string;
  idempotencyKey: string;
  inputSignature: string;
  providerModel: string;
  adapterVersion: string;
  expiresAt: string;
}> {
  const response = await fetch("/api/media/approval", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({ kind, input }),
  });
  return parseResponse<{
    approvalToken: string;
    idempotencyKey: string;
    inputSignature: string;
    providerModel: string;
    adapterVersion: string;
    expiresAt: string;
  }>(response);
}

export async function createImageCandidate(input: {
  prompt: string;
  aspectRatio: string;
  references?: Array<{ dataUrl?: string; url?: string }>;
  idempotencyKey: string;
  approvalToken: string;
}): Promise<{
  url: string;
  provider: string;
  job: MediaLedgerJob;
  requestId?: string;
}> {
  const response = await fetch("/api/media/image", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
      "x-media-approval": input.approvalToken,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      references: input.references,
      idempotencyKey: input.idempotencyKey,
    }),
  });
  const result = await parseResponse<{
    url?: string;
    image?: { url?: string };
    result?: { url?: string };
    job: MediaLedgerJob;
    provider?: string;
    requestId?: string;
  }>(response);
  let job = result.job;
  let url = result.url ?? result.image?.url ?? result.result?.url;
  if (
    !url &&
    job &&
    ["submitting", "submitted", "processing"].includes(job.status)
  ) {
    const recovered = await waitForImageResult(job.id);
    job = recovered.job;
    url = recovered.url;
  }
  if (!url) {
    throw new StudioApiError(
      job?.status === "submit_unknown"
        ? "The image submission is awaiting reconciliation. It will remain recoverable from the server ledger and will not be submitted again automatically."
        : "The provider completed without returning a usable image.",
      job?.status === "submit_unknown"
        ? "SUBMISSION_RECONCILIATION_REQUIRED"
        : "RESULT_MISSING",
      job?.status !== "failed",
    );
  }
  return {
    url,
    provider: job?.provider ?? result.provider ?? "NewAPI",
    job,
    requestId: result.requestId,
  };
}

async function waitForImageResult(
  entryId: string,
): Promise<{ url: string; job: MediaLedgerJob }> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    const detail = await readRecoverableMediaJob(entryId);
    const url = detail.result?.url;
    if (detail.job.status === "succeeded" && url) {
      return { url, job: detail.job };
    }
    if (
      detail.job.status === "failed" ||
      detail.job.status === "submit_unknown" ||
      detail.job.status === "cancelled" ||
      detail.job.status === "reconciliation_required"
    ) {
      throw new StudioApiError(
        detail.job.error?.message ??
          "The image submission did not produce a recoverable result.",
        detail.job.error?.code ?? "IMAGE_GENERATION_FAILED",
        false,
      );
    }
  }
  throw new StudioApiError(
    "The image is still processing. Its ledger claim is safe; reload later to recover the result without another paid submission.",
    "IMAGE_RESULT_PENDING",
    true,
  );
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
  imageDataUrl: string;
  durationSec: number;
  ratio: "1:1" | "16:9" | "9:16";
  resolution: "720p" | "1080p";
  generateAudio: boolean;
  idempotencyKey: string;
  approvalToken: string;
}): Promise<{
  result: VideoJobResult;
  provider: string;
  job: MediaLedgerJob;
}> {
  const response = await fetch("/api/media/video", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
      "x-media-approval": input.approvalToken,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      imageDataUrl: input.imageDataUrl,
      durationSec: input.durationSec,
      ratio: input.ratio,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      idempotencyKey: input.idempotencyKey,
    }),
  });
  const body = await parseResponse<{
    job: MediaLedgerJob;
    result: VideoJobResult | null;
  }>(response);
  if (!body.result) {
    throw new StudioApiError(
      "This video submission is already being reconciled. Reload the campaign to recover its ledgered task instead of submitting it again.",
      "VIDEO_SUBMISSION_PENDING",
      true,
    );
  }
  return {
    result: body.result,
    provider: body.job.provider ?? "NewAPI",
    job: body.job,
  };
}

export async function pollVideoCandidate(
  taskId: string,
  signal?: AbortSignal,
): Promise<{ result: VideoJobResult; provider: string }> {
  const response = await fetch(
    `/api/media/video/${encodeURIComponent(taskId)}`,
    { cache: "no-store", signal },
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

export async function listRecoverableMediaJobs(): Promise<MediaLedgerJob[]> {
  const response = await fetch("/api/media/jobs", { cache: "no-store" });
  const body = await parseResponse<{ jobs: MediaLedgerJob[] }>(response);
  return body.jobs;
}

export async function readRecoverableMediaJob(entryId: string): Promise<{
  job: MediaLedgerJob;
  result: { url?: string; taskId?: string; status?: string } | null;
}> {
  const response = await fetch(
    `/api/media/jobs/${encodeURIComponent(entryId)}`,
    { cache: "no-store" },
  );
  return parseResponse(response);
}
