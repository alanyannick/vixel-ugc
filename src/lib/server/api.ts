import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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
  if (Number.isFinite(contentLength) && contentLength > 32 * 1024 * 1024) {
    throw new ApiRequestError("request_too_large");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new ApiRequestError("invalid_json");
  }
  if (Buffer.byteLength(text, "utf8") > 32 * 1024 * 1024) {
    throw new ApiRequestError("request_too_large");
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
