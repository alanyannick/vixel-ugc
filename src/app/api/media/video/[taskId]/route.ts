import {
  apiError,
  getRequestId,
  jsonResponse,
} from "@/lib/server/api";
import { requireStudioSession } from "@/lib/server/auth";
import {
  providerErrorResponse,
  requireLiveGeneration,
} from "@/lib/server/media";
import {
  isSafeVideoTaskId,
  pollNewApiVideo,
  ProviderRequestError,
} from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = getRequestId(request);
  const accessError = requireStudioSession(request, requestId);
  if (accessError) return accessError;
  const liveError = requireLiveGeneration(requestId);
  if (liveError) return liveError;

  const { taskId } = await context.params;
  if (!isSafeVideoTaskId(taskId)) {
    return apiError(
      400,
      "invalid_video_task_id",
      "The video task identifier is invalid.",
      false,
      requestId,
    );
  }

  try {
    const polled = await pollNewApiVideo({
      taskId,
      signal: request.signal,
    });
    return jsonResponse({
      requestId,
      job: {
        id: polled.result.taskId,
        kind: "video",
        status: polled.result.status,
        provider: "newapi",
        model: polled.model,
      },
      result: polled.result,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return providerErrorResponse(error, requestId);
    }
    return apiError(
      500,
      "video_poll_failed",
      "Video generation status could not be retrieved.",
      false,
      requestId,
    );
  }
}
