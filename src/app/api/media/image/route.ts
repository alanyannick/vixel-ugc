import {
  approvalFingerprint,
  canonicalImageApprovalInput,
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
  MediaLedgerError,
  paidControlPlaneReadiness,
  publicLedgerEntry,
} from "@/lib/server/ledger";
import {
  IdempotencyKeyConflictError,
  imageGenerationRequestSchema,
  imageSizeFor,
  parsedReferences,
  providerErrorResponse,
  resolveIdempotencyKey,
} from "@/lib/server/media";
import {
  generateNewApiImage,
  ProviderRequestError,
} from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 300;

function ledgerErrorResponse(
  error: MediaLedgerError,
  requestId: string,
): Response {
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

function approvalTokenFrom(request: Request, body: unknown): string | null {
  const header = request.headers.get("x-media-approval")?.trim();
  if (header) return header;
  return body &&
    typeof body === "object" &&
    "approvalToken" in body &&
    typeof body.approvalToken === "string"
    ? body.approvalToken
    : null;
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
  const approvalToken = approvalTokenFrom(request, body);
  const parsed = imageGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_image_request",
      "The image request is invalid. References must be uploaded PNG, JPEG, or WebP data URLs.",
      false,
      requestId,
    );
  }

  const canonicalInput = canonicalImageApprovalInput(parsed.data);
  let idempotencyKey: string;
  try {
    idempotencyKey = resolveIdempotencyKey(
      request,
      "image",
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
  const providerModel = providerModelFor("image");
  if (
    !verifyMediaApproval(approvalToken, {
      sessionIdentity,
      kind: "image",
      inputSignature,
      providerModel,
      idempotencyKey,
    })
  ) {
    return apiError(
      403,
      "invalid_media_approval",
      "A current server-signed approval for this exact image input is required.",
      false,
      requestId,
    );
  }

  let claim: Awaited<ReturnType<typeof claimMediaSubmission>>;
  try {
    claim = await claimMediaSubmission({
      sessionIdentity,
      kind: "image",
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
    return jsonResponse({
      requestId,
      replayed: true,
      job: publicLedgerEntry(claim.entry),
      result: claim.entry.providerResult,
    });
  }

  try {
    const references = parsedReferences(parsed.data);
    const generated = await generateNewApiImage({
      prompt: parsed.data.prompt,
      size: imageSizeFor(parsed.data.size, parsed.data.aspectRatio),
      aspectRatio: parsed.data.aspectRatio,
      references,
      idempotencyKey,
      signal: request.signal,
    });
    let entry;
    try {
      entry = await completeMediaSubmission({
        entryId: claim.entry.id,
        sessionIdentity,
        status: "succeeded",
        providerResult: generated.result,
      });
    } catch (error) {
      return error instanceof MediaLedgerError
        ? ledgerErrorResponse(error, requestId)
        : apiError(
            503,
            "database_unavailable",
            "The provider completed, but its durable result claim is pending reconciliation.",
            true,
            requestId,
          );
    }
    return jsonResponse({
      requestId,
      replayed: false,
      job: {
        ...publicLedgerEntry(entry),
        mode: generated.mode,
        attempts: generated.attempts,
      },
      result: generated.result,
    });
  } catch (error) {
    const providerError =
      error instanceof ProviderRequestError
        ? error
        : new ProviderRequestError(
            "provider_unavailable",
            "Image generation could not be completed.",
            false,
          );
    try {
      await failMediaSubmission({
        entryId: claim.entry.id,
        sessionIdentity,
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
          "image_generation_failed",
          "Image generation could not be completed.",
          false,
          requestId,
        );
  }
}
