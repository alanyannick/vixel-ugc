import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// Vercel Functions reject request or response payloads above 4.5 MB. Keep a
// conservative margin for platform framing and reject while streaming instead
// of buffering an attacker-controlled body first.
export const MAX_JSON_REQUEST_BYTES = 4 * 1024 * 1024;

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
  };
};

export function getRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  requestId: string,
  headers?: HeadersInit,
): Response {
  return jsonResponse(
    { error: { code, message, retryable, requestId } } satisfies ApiErrorBody,
    { status, headers },
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_JSON_REQUEST_BYTES
  ) {
    throw new ApiRequestError("request_too_large");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    reader = request.body?.getReader() ?? null;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_JSON_REQUEST_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new ApiRequestError("request_too_large");
        }
        chunks.push(value);
      }
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError("invalid_json");
  } finally {
    reader?.releaseLock();
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, totalBytes),
    );
  } catch {
    throw new ApiRequestError("invalid_json");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiRequestError("invalid_json");
  }
}

export class ApiRequestError extends Error {
  constructor(readonly code: "invalid_json" | "request_too_large") {
    super(code);
    this.name = "ApiRequestError";
  }
}
