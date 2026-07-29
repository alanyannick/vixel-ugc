import { Buffer } from "node:buffer";

import { getServerRuntimeConfig } from "./env";
import type { ParsedImageDataUrl } from "./data-url";

// Vercel Functions reject request or response bodies above 4.5 MB. Keep enough
// headroom for the API envelope when a provider returns base64 JSON.
const MAX_PROVIDER_JSON_BYTES = 3_500_000;
const SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type FetchLike = typeof fetch;

export class ProviderRequestError extends Error {
  constructor(
    readonly code:
      | "provider_not_configured"
      | "provider_timeout"
      | "provider_unavailable"
      | "provider_rejected_request"
      | "provider_invalid_response",
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

function providerApiKey(): string {
  const apiKey = process.env.NEWAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderRequestError(
      "provider_not_configured",
      "The generation provider is not configured.",
      false,
    );
  }
  return apiKey;
}

function providerErrorForStatus(
  capability: "image" | "video",
  status: number,
): ProviderRequestError {
  const retryable = status === 408 || status === 429 || status >= 500;
  return new ProviderRequestError(
    retryable ? "provider_unavailable" : "provider_rejected_request",
    retryable
      ? `The ${capability} provider is temporarily unavailable.`
      : `The ${capability} provider rejected the request.`,
    retryable,
    status,
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|timeout/i.test(error.message))
  );
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

async function readProviderJson(response: Response): Promise<unknown> {
  const announcedLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(announcedLength) &&
    announcedLength > MAX_PROVIDER_JSON_BYTES
  ) {
    throw new ProviderRequestError(
      "provider_invalid_response",
      "The provider response was too large.",
      false,
      response.status,
    );
  }

  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ProviderRequestError(
          "provider_invalid_response",
          "The provider response was too large.",
          false,
          response.status,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(
      "provider_invalid_response",
      "The provider returned an invalid response.",
      false,
      response.status,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPrivateResultHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  const octets = normalized.split(".").map(Number);
  if (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
  ) {
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] === 0
    );
  }
  return false;
}

function isSafeProviderAssetUrl(url: URL): boolean {
  const allowedProtocol =
    process.env.NODE_ENV === "production"
      ? url.protocol === "https:"
      : ["http:", "https:"].includes(url.protocol);
  return (
    allowedProtocol &&
    !url.username &&
    !url.password &&
    !isPrivateResultHostname(url.hostname)
  );
}

function imageMimeFromBytes(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type NormalizedImageResult =
  | {
      type: "data_url";
      dataUrl: string;
      url: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
    }
  | {
      type: "url";
      url: string;
      mimeType: null;
    };

export function normalizeImageProviderResponse(
  data: unknown,
): NormalizedImageResult {
  const first =
    isRecord(data) && Array.isArray(data.data) && data.data.length
      ? data.data[0]
      : null;
  if (!isRecord(first)) {
    throw new ProviderRequestError(
      "provider_invalid_response",
      "The image provider returned no image.",
      false,
    );
  }

  if (typeof first.b64_json === "string" && first.b64_json) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(first.b64_json, "base64"));
    } catch {
      bytes = new Uint8Array();
    }
    const canonical = Buffer.from(bytes).toString("base64").replace(/=+$/, "");
    const supplied = first.b64_json.replace(/=+$/, "");
    const mimeType = imageMimeFromBytes(bytes);
    if (
      !bytes.length ||
      bytes.length > MAX_PROVIDER_JSON_BYTES ||
      canonical !== supplied ||
      !mimeType
    ) {
      throw new ProviderRequestError(
        "provider_invalid_response",
        "The image provider returned invalid image data.",
        false,
      );
    }
    return {
      type: "data_url",
      dataUrl: `data:${mimeType};base64,${first.b64_json}`,
      url: `data:${mimeType};base64,${first.b64_json}`,
      mimeType,
    };
  }

  if (typeof first.url === "string") {
    let url: URL;
    try {
      url = new URL(first.url);
    } catch {
      throw new ProviderRequestError(
        "provider_invalid_response",
        "The image provider returned an invalid image URL.",
        false,
      );
    }
    if (!isSafeProviderAssetUrl(url)) {
      throw new ProviderRequestError(
        "provider_invalid_response",
        "The image provider returned an invalid image URL.",
        false,
      );
    }
    return { type: "url", url: url.toString(), mimeType: null };
  }

  throw new ProviderRequestError(
    "provider_invalid_response",
    "The image provider returned no usable image.",
    false,
  );
}

export function normalizeImageModel(model: string): string {
  const unprefixed = model.trim().replace(/^newapi[:/]/i, "");
  if (/^gpt-image-2(?:-customtools)?$/i.test(unprefixed)) return "gpt-image-2";
  if (/^gpt-image-1(?:-customtools)?$/i.test(unprefixed)) return "gpt-image-1";
  return unprefixed || "gpt-image-2";
}

function referenceFileName(
  mimeType: ParsedImageDataUrl["mimeType"],
  index: number,
): string {
  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/webp"
        ? "webp"
        : "png";
  return `reference-${index + 1}.${extension}`;
}

export async function generateNewApiImage(input: {
  prompt: string;
  size: string;
  aspectRatio?: string;
  references: ParsedImageDataUrl[];
  idempotencyKey: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<{
  result: NormalizedImageResult;
  model: string;
  mode: "generation" | "edit";
  attempts: number;
}> {
  const runtime = getServerRuntimeConfig();
  if (
    !runtime.newApi.configured ||
    !runtime.newApi.openAiBaseUrl
  ) {
    throw new ProviderRequestError(
      "provider_not_configured",
      "The generation provider is not configured.",
      false,
    );
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 240_000;
  const model = normalizeImageModel(runtime.newApi.imageModel);
  const prompt = input.aspectRatio
    ? `${input.prompt}\n\nComposition target: ${input.aspectRatio} aspect ratio. Keep the frame crop-safe.`
    : input.prompt;
  const isEdit = input.references.length > 0;
  const endpoint = `${runtime.newApi.openAiBaseUrl}/images/${isEdit ? "edits" : "generations"}`;

  const headers = new Headers({
    Authorization: `Bearer ${providerApiKey()}`,
    "Idempotency-Key": input.idempotencyKey,
  });
  let body: BodyInit;
  if (isEdit) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt);
    form.set("size", input.size);
    form.set("n", "1");
    input.references.forEach((reference, index) => {
      const imageBuffer = new ArrayBuffer(reference.bytes.byteLength);
      new Uint8Array(imageBuffer).set(reference.bytes);
      form.append(
        "image",
        new Blob([imageBuffer], { type: reference.mimeType }),
        referenceFileName(reference.mimeType, index),
      );
    });
    body = form;
  } else {
    headers.set("content-type", "application/json");
    body = JSON.stringify({
      model,
      prompt,
      size: input.size,
      n: 1,
    });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      endpoint,
      { method: "POST", headers, body },
      timeoutMs,
      input.signal,
    );
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? "provider_timeout" : "provider_unavailable",
      isAbortError(error)
        ? "The image provider timed out. Its acceptance state is unknown; this job will not be submitted again automatically."
        : "The image provider could not be reached. This job will not be submitted again automatically.",
      true,
    );
  }

  if (!response.ok) {
    const providerError = providerErrorForStatus("image", response.status);
    await response.body?.cancel().catch(() => undefined);
    throw providerError;
  }

  const data = await readProviderJson(response);
  return {
    result: normalizeImageProviderResponse(data),
    model,
    mode: isEdit ? "edit" : "generation",
    attempts: 1,
  };
}

export function isSafeVideoTaskId(value: string): boolean {
  return SAFE_TASK_ID.test(value);
}

export function extractVideoTaskId(data: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const taskId = extractVideoTaskId(item, depth + 1);
      if (taskId) return taskId;
    }
    return null;
  }
  if (!isRecord(data)) return null;
  const candidates = [
    data.id,
    data.task_id,
    data.taskId,
    data.video_id,
    data.request_id,
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      isSafeVideoTaskId(candidate.trim())
    ) {
      return candidate.trim();
    }
  }
  for (const nested of [data.data, data.result, data.task, data.output]) {
    const taskId = extractVideoTaskId(nested, depth + 1);
    if (taskId) return taskId;
  }
  return null;
}

function extractTextField(
  data: unknown,
  names: string[],
  depth = 0,
): string | null {
  if (depth > 5) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const value = extractTextField(item, names, depth + 1);
      if (value) return value;
    }
    return null;
  }
  if (!isRecord(data)) return null;
  for (const name of names) {
    const value = data[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const nested of [data.data, data.result, data.task, data.output, data.metadata]) {
    const value = extractTextField(nested, names, depth + 1);
    if (value) return value;
  }
  return null;
}

function normalizeVideoStatus(
  data: unknown,
  hasUrl: boolean,
): "queued" | "processing" | "succeeded" | "failed" {
  const status = (
    extractTextField(data, ["status", "state"]) ??
    (hasUrl ? "succeeded" : "queued")
  ).toLowerCase();
  if (/fail|error|cancel|reject/.test(status)) return "failed";
  if (/success|succeed|complete|finished|done/.test(status)) return "succeeded";
  if (/process|running|progress|generat/.test(status)) return "processing";
  return "queued";
}

function extractVideoUrl(data: unknown, depth = 0): string | null {
  if (depth > 6) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const url = extractVideoUrl(item, depth + 1);
      if (url) return url;
    }
    return null;
  }
  if (!isRecord(data)) return null;
  for (const name of [
    "result_url",
    "resultUrl",
    "video_url",
    "videoUrl",
    "url",
    "output_url",
    "outputUrl",
    "download_url",
    "downloadUrl",
  ]) {
    const value = data[name];
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      if (isSafeProviderAssetUrl(url)) {
        return url.toString();
      }
    } catch {
      // Continue looking for another supported response field.
    }
  }
  for (const nested of [data.data, data.result, data.task, data.output, data.metadata]) {
    const url = extractVideoUrl(nested, depth + 1);
    if (url) return url;
  }
  return null;
}

function extractProgress(data: unknown, depth = 0): number | null {
  if (depth > 6) return null;
  const raw = extractTextField(data, ["progress", "percent", "percentage"]);
  if (raw) {
    const numeric = Number(raw.replace("%", ""));
    if (Number.isFinite(numeric)) return Math.max(0, Math.min(100, numeric));
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const progress = extractProgress(item, depth + 1);
      if (progress !== null) return progress;
    }
  } else if (isRecord(data)) {
    for (const name of ["progress", "percent", "percentage"]) {
      if (typeof data[name] === "number" && Number.isFinite(data[name])) {
        return Math.max(0, Math.min(100, data[name]));
      }
    }
    for (const nested of [data.data, data.result, data.task, data.output]) {
      const progress = extractProgress(nested, depth + 1);
      if (progress !== null) return progress;
    }
  }
  return null;
}

export type NormalizedVideoResult = {
  taskId: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  progress: number | null;
  url: string | null;
  error: string | null;
};

export function normalizeVideoProviderResponse(
  data: unknown,
  fallbackTaskId?: string,
): NormalizedVideoResult {
  const taskId = extractVideoTaskId(data) ?? fallbackTaskId ?? null;
  if (!taskId || !isSafeVideoTaskId(taskId)) {
    throw new ProviderRequestError(
      "provider_invalid_response",
      "The video provider returned an invalid task identifier.",
      false,
    );
  }
  const url = extractVideoUrl(data);
  const status = normalizeVideoStatus(data, Boolean(url));
  return {
    taskId,
    status,
    progress: extractProgress(data),
    url,
    error:
      status === "failed"
        ? "Video generation failed at the provider."
        : null,
  };
}

async function callVideoProvider(input: {
  path: string;
  method: "GET" | "POST";
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<unknown> {
  const runtime = getServerRuntimeConfig();
  if (!runtime.newApi.configured || !runtime.newApi.rootBaseUrl) {
    throw new ProviderRequestError(
      "provider_not_configured",
      "The generation provider is not configured.",
      false,
    );
  }

  const headers = new Headers({
    Authorization: `Bearer ${providerApiKey()}`,
  });
  if (input.payload) headers.set("content-type", "application/json");
  if (input.idempotencyKey) {
    headers.set("Idempotency-Key", input.idempotencyKey);
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      input.fetchImpl ?? fetch,
      `${runtime.newApi.rootBaseUrl}${input.path}`,
      {
        method: input.method,
        headers,
        body: input.payload ? JSON.stringify(input.payload) : undefined,
      },
      input.timeoutMs,
      input.signal,
    );
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? "provider_timeout" : "provider_unavailable",
      isAbortError(error)
        ? "The video provider timed out."
        : "The video provider is temporarily unavailable.",
      true,
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw providerErrorForStatus("video", response.status);
  }
  return readProviderJson(response);
}

export async function submitNewApiVideo(input: {
  prompt: string;
  imageDataUrl?: string;
  lastImageDataUrl?: string;
  durationSec: number;
  ratio: string;
  resolution: string;
  generateAudio: boolean;
  idempotencyKey: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<{ result: NormalizedVideoResult; model: string }> {
  const runtime = getServerRuntimeConfig();
  const dimensions =
    input.ratio === "1:1"
      ? { width: 1024, height: 1024 }
      : input.ratio === "9:16"
        ? { width: 720, height: 1280 }
        : { width: 1280, height: 720 };
  const payload: Record<string, unknown> = {
    model: runtime.newApi.videoModel,
    prompt: input.prompt,
    duration: input.durationSec,
    ratio: input.ratio,
    resolution: input.resolution,
    width: dimensions.width,
    height: dimensions.height,
    fps: 24,
    n: 1,
    generate_audio: input.generateAudio,
  };
  if (input.imageDataUrl) {
    payload.image = input.imageDataUrl;
    payload.images = [input.imageDataUrl];
  }
  if (input.lastImageDataUrl) payload.last_image = input.lastImageDataUrl;

  const data = await callVideoProvider({
    path: "/v1/video/generations",
    method: "POST",
    payload,
    idempotencyKey: input.idempotencyKey,
    timeoutMs: input.timeoutMs ?? 45_000,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });
  return {
    result: normalizeVideoProviderResponse(data),
    model: runtime.newApi.videoModel,
  };
}

export async function pollNewApiVideo(input: {
  taskId: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<{ result: NormalizedVideoResult; model: string }> {
  if (!isSafeVideoTaskId(input.taskId)) {
    throw new ProviderRequestError(
      "provider_invalid_response",
      "The video task identifier is invalid.",
      false,
    );
  }
  const runtime = getServerRuntimeConfig();
  const data = await callVideoProvider({
    path: `/v1/video/generations/${encodeURIComponent(input.taskId)}`,
    method: "GET",
    timeoutMs: input.timeoutMs ?? 20_000,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });
  return {
    result: normalizeVideoProviderResponse(data, input.taskId),
    model: runtime.newApi.videoModel,
  };
}
