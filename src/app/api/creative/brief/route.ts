import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/api";
import { requireStudioSession } from "@/lib/server/auth";
import {
  creativeBriefRequestSchema,
  generateCreativeBrief,
} from "@/lib/server/creative";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const accessError = requireStudioSession(request, requestId);
  if (accessError) return accessError;

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
  const parsed = creativeBriefRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_brief_request",
      "The creative brief request is invalid.",
      false,
      requestId,
    );
  }

  return jsonResponse(await generateCreativeBrief(parsed.data, requestId));
}

