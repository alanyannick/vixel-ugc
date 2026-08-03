import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/api";
import { requireCurrentStudioSession } from "@/lib/server/accounts";
import { DirectorTurnRequestSchema } from "@/lib/domain/director";
import {
  DirectorAgentUnavailableError,
  runDirectorTurn,
} from "@/lib/server/director-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const accessError = await requireCurrentStudioSession(request, requestId);
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

  const parsed = DirectorTurnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_director_request",
      "The Director request is invalid.",
      false,
      requestId,
    );
  }

  try {
    return jsonResponse(await runDirectorTurn(parsed.data, requestId));
  } catch (error) {
    if (error instanceof DirectorAgentUnavailableError) {
      return apiError(
        503,
        "director_agent_unavailable",
        error.message,
        true,
        requestId,
      );
    }
    throw error;
  }
}
