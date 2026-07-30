import { z } from "zod";

import {
  canonicalImageApprovalInput,
  canonicalVideoApprovalInput,
  issueMediaApproval,
  mediaInputSignature,
  providerModelFor,
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
import { paidControlPlaneReadiness } from "@/lib/server/ledger";
import {
  IdempotencyKeyConflictError,
  imageGenerationRequestSchema,
  resolveIdempotencyKey,
  videoGenerationRequestSchema,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 10;

const approvalRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), input: z.unknown() }).strict(),
  z.object({ kind: z.literal("video"), input: z.unknown() }).strict(),
]);

function readinessError(requestId: string): Response | null {
  const readiness = paidControlPlaneReadiness();
  return readiness.ready
    ? null
    : apiError(503, readiness.code, readiness.message, false, requestId);
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
      "A signed studio session is required for paid media approval.",
      false,
      requestId,
    );
  }
  const controlPlaneError = readinessError(requestId);
  if (controlPlaneError) return controlPlaneError;

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
  const requestBody = approvalRequestSchema.safeParse(body);
  if (!requestBody.success) {
    return apiError(
      400,
      "invalid_approval_request",
      "A valid image or video paid-input request is required.",
      false,
      requestId,
    );
  }

  const kind = requestBody.data.kind;
  const parsed =
    kind === "image"
      ? imageGenerationRequestSchema.safeParse(requestBody.data.input)
      : videoGenerationRequestSchema.safeParse(requestBody.data.input);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_approval_input",
      "The exact media input is invalid.",
      false,
      requestId,
    );
  }

  const canonicalInput =
    kind === "image"
      ? canonicalImageApprovalInput(
          parsed.data as z.infer<typeof imageGenerationRequestSchema>,
        )
      : canonicalVideoApprovalInput(
          parsed.data as z.infer<typeof videoGenerationRequestSchema>,
        );
  let idempotencyKey: string;
  try {
    idempotencyKey = resolveIdempotencyKey(
      request,
      kind,
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
  const providerModel = providerModelFor(kind);
  const approval = issueMediaApproval({
    sessionIdentity,
    kind,
    inputSignature,
    providerModel,
    idempotencyKey,
  });
  if (!approval) {
    return apiError(
      503,
      "approval_signing_unavailable",
      "Paid media approval signing is unavailable.",
      false,
      requestId,
    );
  }

  return jsonResponse({
    requestId,
    approvalToken: approval.token,
    kind,
    inputSignature,
    idempotencyKey,
    providerModel,
    adapterVersion: approval.claims.adapterVersion,
    expiresAt: new Date(approval.claims.expiresAt * 1_000).toISOString(),
  });
}
