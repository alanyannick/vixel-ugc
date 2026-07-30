import {
  apiError,
  getRequestId,
  jsonResponse,
} from "@/lib/server/api";
import {
  getStudioSessionIdentity,
  requireStudioSession,
} from "@/lib/server/auth";
import {
  completeMediaSubmission,
  findOwnedVideoTask,
  isTerminalMediaLedgerStatus,
  MediaLedgerError,
  noteMediaLedgerError,
  paidControlPlaneReadiness,
  publicLedgerEntry,
  type MediaLedgerStatus,
} from "@/lib/server/ledger";
import { providerErrorResponse } from "@/lib/server/media";
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

function statusFor(
  status: "queued" | "processing" | "succeeded" | "failed",
): Exclude<MediaLedgerStatus, "submitting" | "submit_unknown"> {
  return status === "queued" ? "submitted" : status;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = getRequestId(request);
  const accessError = requireStudioSession(request, requestId);
  if (accessError) return accessError;
  const sessionIdentity = getStudioSessionIdentity(request);
  if (!sessionIdentity) {
    return apiError(
      401,
      "session_identity_required",
      "A signed studio session is required for paid media.",
      false,
      requestId,
    );
  }
  const readiness = paidControlPlaneReadiness();
  if (!readiness.ready) {
    return apiError(
      503,
      readiness.code,
      readiness.message,
      false,
      requestId,
    );
  }

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

  let owned;
  try {
    owned = await findOwnedVideoTask(sessionIdentity, taskId);
  } catch (error) {
    return apiError(
      503,
      error instanceof MediaLedgerError
        ? error.code
        : "database_unavailable",
      "The durable media ledger is unavailable.",
      false,
      requestId,
    );
  }
  if (!owned) {
    return apiError(
      404,
      "video_task_not_found",
      "No video task owned by this studio session was found.",
      false,
      requestId,
    );
  }
  if (isTerminalMediaLedgerStatus(owned.status)) {
    return jsonResponse({
      requestId,
      replayed: true,
      job: publicLedgerEntry(owned),
      result: owned.providerResult,
    });
  }

  try {
    const polled = await pollNewApiVideo({
      taskId,
      signal: request.signal,
    });
    const entry = await completeMediaSubmission({
      entryId: owned.id,
      sessionIdentity,
      expectedStatus: owned.status,
      expectedRevision: owned.revision,
      status: statusFor(polled.result.status),
      providerTaskId: polled.result.taskId,
      providerResult: polled.result,
    });
    return jsonResponse({
      requestId,
      replayed: false,
      job: publicLedgerEntry(entry),
      result: entry.providerResult,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      try {
        await noteMediaLedgerError({
          entryId: owned.id,
          sessionIdentity,
          expectedStatus: owned.status,
          expectedRevision: owned.revision,
          errorCode: error.code,
          errorMessage: error.message,
        });
      } catch {
        return apiError(
          503,
          "database_unavailable",
          "The video poll error could not be recorded durably.",
          true,
          requestId,
        );
      }
      return providerErrorResponse(error, requestId);
    }
    if (error instanceof MediaLedgerError) {
      return apiError(
        503,
        error.code,
        "The video status could not be written to the durable ledger.",
        true,
        requestId,
      );
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
