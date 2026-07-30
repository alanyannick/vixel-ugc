import {
  approvalFingerprint,
  canonicalVideoApprovalInput,
  mediaInputSignature,
  providerModelFor,
  verifyMediaApproval,
} from "@/lib/server/approval";
import {
  ApiRequestError,
  apiError,
  getRequestId,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/api";
import {
  getStudioSessionIdentity,
  requireStudioSession,
} from "@/lib/server/auth";
import {
  claimMediaSubmission,
  completeMediaSubmission,
  failMediaSubmission,
  isTerminalMediaLedgerStatus,
  MediaLedgerError,
  paidControlPlaneReadiness,
  publicLedgerEntry,
  publicSubmissionReplay,
  type MediaLedgerStatus,
} from "@/lib/server/ledger";
import {
  IdempotencyKeyConflictError,
  providerErrorResponse,
  resolveIdempotencyKey,
  videoGenerationRequestSchema,
} from "@/lib/server/media";
import {
  ProviderRequestError,
  submitNewApiVideo,
} from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

function ledgerErrorResponse(
  error: MediaLedgerError,
  requestId: string,
): Response {
  if (error.code === "paid_submission_quota_exceeded") {
    return apiError(
      429,
      error.code,
      error.message,
      true,
      requestId,
    );
  }
  const conflict = ["idempotency_conflict", "approval_reused"].includes(
    error.code,
  );
  return apiError(
    conflict ? 409 : 503,
    error.code,
    error.message,
    false,
    requestId,
  );
}

function statusFor(
  status: "queued" | "processing" | "succeeded" | "failed",
): Exclude<MediaLedgerStatus, "submitting" | "submit_unknown"> {
  return status === "queued" ? "submitted" : status;
}

export async function POST(request: Request): Promise<Response> {
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
  const approvalToken =
    request.headers.get("x-media-approval")?.trim() ??
    (body &&
    typeof body === "object" &&
    "approvalToken" in body &&
    typeof body.approvalToken === "string"
      ? body.approvalToken
      : null);
  const parsed = videoGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_video_request",
      "The video request is invalid. Frame references must be uploaded PNG, JPEG, or WebP data URLs.",
      false,
      requestId,
    );
  }

  const canonicalInput = canonicalVideoApprovalInput(parsed.data);
  let idempotencyKey: string;
  try {
    idempotencyKey = resolveIdempotencyKey(
      request,
      "video",
      parsed.data.idempotencyKey,
      canonicalInput,
    );
  } catch (error) {
    if (error instanceof IdempotencyKeyConflictError) {
      return apiError(
        400,
        "idempotency_key_conflict",
        "The header and body idempotency keys do not match.",
        false,
        requestId,
      );
    }
    throw error;
  }
  const inputSignature = mediaInputSignature(canonicalInput);
  const providerModel = providerModelFor("video");
  if (
    !verifyMediaApproval(approvalToken, {
      sessionIdentity,
      kind: "video",
      inputSignature,
      providerModel,
      idempotencyKey,
    })
  ) {
    return apiError(
      403,
      "invalid_media_approval",
      "A current server-signed approval for this exact video input is required.",
      false,
      requestId,
    );
  }

  let claim: Awaited<ReturnType<typeof claimMediaSubmission>>;
  try {
    claim = await claimMediaSubmission({
      sessionIdentity,
      kind: "video",
      idempotencyKey,
      inputSignature,
      approvalSignature: approvalFingerprint(approvalToken!),
      providerModel,
    });
  } catch (error) {
    return error instanceof MediaLedgerError
      ? ledgerErrorResponse(error, requestId)
      : apiError(
          503,
          "database_unavailable",
          "The durable media ledger is unavailable.",
          false,
          requestId,
        );
  }
  if (!claim.acquired) {
    return jsonResponse(
      {
        requestId,
        replayed: true,
        job: publicLedgerEntry(claim.entry),
        submission: publicSubmissionReplay(claim.entry),
        result: claim.entry.providerResult,
      },
      {
        status: isTerminalMediaLedgerStatus(claim.entry.status)
          ? 200
          : 202,
      },
    );
  }

  try {
    const submitted = await submitNewApiVideo({
      ...parsed.data,
      idempotencyKey,
      signal: request.signal,
    });
    let entry;
    try {
      entry = await completeMediaSubmission({
        entryId: claim.entry.id,
        sessionIdentity,
        expectedStatus: claim.entry.status,
        expectedRevision: claim.entry.revision,
        status: statusFor(submitted.result.status),
        providerTaskId: submitted.result.taskId,
        providerResult: submitted.result,
      });
    } catch (error) {
      return error instanceof MediaLedgerError
        ? ledgerErrorResponse(error, requestId)
        : apiError(
            503,
            "database_unavailable",
            "The provider accepted the task, but its durable claim is pending reconciliation.",
            true,
            requestId,
          );
    }
    return jsonResponse(
      {
        requestId,
        replayed: false,
        job: publicLedgerEntry(entry),
        result: entry.providerResult,
      },
      { status: entry.status === "succeeded" ? 200 : 202 },
    );
  } catch (error) {
    const providerError =
      error instanceof ProviderRequestError
        ? error
        : new ProviderRequestError(
            "provider_unavailable",
            "Video generation could not be submitted.",
            false,
          );
    try {
      await failMediaSubmission({
        entryId: claim.entry.id,
        sessionIdentity,
        expectedStatus: claim.entry.status,
        expectedRevision: claim.entry.revision,
        status: providerError.retryable ? "submit_unknown" : "failed",
        errorCode: providerError.code,
        errorMessage: providerError.message,
      });
    } catch (ledgerError) {
      return ledgerError instanceof MediaLedgerError
        ? ledgerErrorResponse(ledgerError, requestId)
        : apiError(
            503,
            "database_unavailable",
            "The media failure could not be reconciled durably.",
            true,
            requestId,
          );
    }
    return error instanceof ProviderRequestError
      ? providerErrorResponse(error, requestId)
      : apiError(
          500,
          "video_submission_failed",
          "Video generation could not be submitted.",
          false,
          requestId,
        );
  }
}
