import { z } from "zod";

import {
  type ArtifactCandidate,
  ArtifactCandidateSchema,
  type Clock,
  type GenerationInput,
  GenerationInputSchema,
  type GenerationJob,
  GenerationJobSchema,
  type IdFactory,
  type Receipt,
  ReceiptSchema,
  defaultIdFactory,
  systemClock,
} from "./contracts";
import {
  ApprovalRequiredError,
  InvalidTransitionError,
  RevisionConflictError,
} from "./errors";
import { exactInputSignature } from "./signature";

export const CreateGenerationJobInputSchema = z
  .object({
    planId: z.string().min(3).max(160),
    itemId: z.string().min(3).max(160),
    input: GenerationInputSchema,
    idempotencyKey: z.string().trim().min(8).max(240).optional(),
  })
  .strict();

export type CreateGenerationJobInput = z.infer<
  typeof CreateGenerationJobInputSchema
>;

function assertJobRevision(job: GenerationJob, expectedRevision: number): void {
  if (job.revision !== expectedRevision) {
    throw new RevisionConflictError(
      "generation job",
      expectedRevision,
      job.revision,
    );
  }
}

function bump(
  job: GenerationJob,
  patch: Partial<GenerationJob>,
  clock: Clock,
): GenerationJob {
  return GenerationJobSchema.parse({
    ...job,
    ...patch,
    revision: job.revision + 1,
    updatedAt: clock(),
  });
}

export function createGenerationJob(
  unsafeInput: CreateGenerationJobInput,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = systemClock,
): GenerationJob {
  const input = CreateGenerationJobInputSchema.parse(unsafeInput);
  const now = clock();
  const id = idFactory("job");
  const inputSignature = exactInputSignature(input.input);

  return GenerationJobSchema.parse({
    schemaVersion: 1,
    id,
    planId: input.planId,
    itemId: input.itemId,
    revision: 0,
    status: "draft",
    input: input.input,
    inputSignature,
    approval: null,
    idempotencyKey:
      input.idempotencyKey ??
      `idem_${id}_${inputSignature.slice("sig_v1_".length, 23)}`,
    providerRequestId: null,
    providerResult: null,
    candidateId: null,
    attempts: 0,
    lastError: null,
    cancellation: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function isGenerationApprovalValid(job: GenerationJob): boolean {
  return (
    job.approval !== null &&
    job.approval.inputSignature === job.inputSignature
  );
}

export function approveGenerationInput(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  approvedBy: string,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (!["draft", "provider_failed"].includes(job.status)) {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "approved",
    );
  }
  const approver = z.string().trim().min(1).max(160).parse(approvedBy);
  const now = clock();
  return bump(
    job,
    {
      approval: {
        inputSignature: job.inputSignature,
        approvedAt: now,
        approvedBy: approver,
      },
    },
    () => now,
  );
}

export function changeGenerationInput(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  unsafeInput: GenerationInput,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (!["draft", "provider_failed"].includes(job.status)) {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "draft",
    );
  }
  const input = GenerationInputSchema.parse(unsafeInput);
  const signature = exactInputSignature(input);
  return bump(
    job,
    {
      status: "draft",
      input,
      inputSignature: signature,
      approval:
        signature === job.inputSignature ? job.approval : null,
      providerRequestId: null,
      providerResult: null,
      candidateId: null,
      lastError: null,
    },
    clock,
  );
}

export function submitGenerationJob(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (!["draft", "provider_failed"].includes(job.status)) {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "provider_pending",
    );
  }
  if (!isGenerationApprovalValid(job)) {
    throw new ApprovalRequiredError(
      "Paid generation is blocked until the current exact input is approved.",
    );
  }
  return bump(
    job,
    {
      status: "provider_pending",
      attempts: job.attempts + 1,
      lastError: null,
    },
    clock,
  );
}

export function recordProviderRequest(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  providerRequestId: string,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (job.status !== "provider_pending") {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "provider_pending",
    );
  }
  return bump(
    job,
    {
      providerRequestId: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .parse(providerRequestId),
    },
    clock,
  );
}

export function recordProviderFailure(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  error: string,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (job.status !== "provider_pending") {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "provider_failed",
    );
  }
  return bump(
    job,
    {
      status: "provider_failed",
      lastError: z.string().trim().min(1).max(2_000).parse(error),
    },
    clock,
  );
}

export interface ProviderResultInput {
  providerRequestId: string;
  remoteUrl: string;
  mimeType: string;
}

export interface ProviderResultTransition {
  job: GenerationJob;
  candidate: ArtifactCandidate | null;
}

export function recordProviderResult(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  unsafeResult: ProviderResultInput,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = systemClock,
): ProviderResultTransition {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (!["provider_pending", "cancelled"].includes(job.status)) {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "materialization_pending",
    );
  }
  const now = clock();
  const result = {
    providerRequestId: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .parse(unsafeResult.providerRequestId),
    remoteUrl: z.string().trim().url().max(4_000).parse(unsafeResult.remoteUrl),
    mimeType: z.string().trim().min(1).max(200).parse(unsafeResult.mimeType),
    receivedAt: now,
  };

  if (job.status === "cancelled") {
    const candidateId = idFactory("candidate");
    const candidate = ArtifactCandidateSchema.parse({
      schemaVersion: 1,
      id: candidateId,
      jobId: job.id,
      planId: job.planId,
      itemId: job.itemId,
      kind: job.input.kind,
      status: "protected",
      assetUrl: result.remoteUrl,
      mimeType: result.mimeType,
      width: null,
      height: null,
      inputSignature: job.inputSignature,
      providerRequestId: result.providerRequestId,
      protectedReason: "Provider result arrived after the cancellation tombstone.",
      receiptId: null,
      createdAt: now,
      updatedAt: now,
    });
    return {
      job: bump(
        job,
        {
          status: "protected_late_result",
          providerRequestId: result.providerRequestId,
          providerResult: result,
          candidateId,
        },
        () => now,
      ),
      candidate,
    };
  }

  return {
    job: bump(
      job,
      {
        status: "materialization_pending",
        providerRequestId: result.providerRequestId,
        providerResult: result,
        lastError: null,
      },
      () => now,
    ),
    candidate: null,
  };
}

export interface MaterializedAssetInput {
  assetUrl: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
}

export interface CandidateTransition {
  job: GenerationJob;
  candidate: ArtifactCandidate;
}

export function materializeGenerationResult(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  unsafeAsset: MaterializedAssetInput,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = systemClock,
): CandidateTransition {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (job.status !== "materialization_pending" || job.providerResult === null) {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "candidate",
    );
  }
  const now = clock();
  const candidateId = idFactory("candidate");
  const candidate = ArtifactCandidateSchema.parse({
    schemaVersion: 1,
    id: candidateId,
    jobId: job.id,
    planId: job.planId,
    itemId: job.itemId,
    kind: job.input.kind,
    status: "reviewable",
    assetUrl: z.string().trim().url().max(4_000).parse(unsafeAsset.assetUrl),
    mimeType: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .parse(unsafeAsset.mimeType),
    width: z.number().int().positive().nullable().parse(unsafeAsset.width ?? null),
    height: z
      .number()
      .int()
      .positive()
      .nullable()
      .parse(unsafeAsset.height ?? null),
    inputSignature: job.inputSignature,
    providerRequestId: job.providerResult.providerRequestId,
    protectedReason: null,
    receiptId: null,
    createdAt: now,
    updatedAt: now,
  });
  return {
    job: bump(
      job,
      {
        status: "candidate",
        candidateId,
        lastError: null,
      },
      () => now,
    ),
    candidate,
  };
}

export function recordMaterializationFailure(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  error: string,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (job.status !== "materialization_pending") {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "materialization_failed",
    );
  }
  return bump(
    job,
    {
      status: "materialization_failed",
      lastError: z.string().trim().min(1).max(2_000).parse(error),
    },
    clock,
  );
}

export function retryGenerationJob(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (job.status === "provider_failed") {
    if (!isGenerationApprovalValid(job)) {
      throw new ApprovalRequiredError();
    }
    return bump(
      job,
      {
        status: "provider_pending",
        attempts: job.attempts + 1,
        lastError: null,
      },
      clock,
    );
  }
  if (job.status === "materialization_failed") {
    return bump(
      job,
      {
        status: "materialization_pending",
        lastError: null,
      },
      clock,
    );
  }
  throw new InvalidTransitionError(
    `generation job ${job.id}`,
    job.status,
    "retry",
  );
}

export function cancelGenerationJob(
  unsafeJob: GenerationJob,
  expectedRevision: number,
  reason: string,
  clock: Clock = systemClock,
): GenerationJob {
  const job = GenerationJobSchema.parse(unsafeJob);
  assertJobRevision(job, expectedRevision);
  if (
    ["candidate", "accepted", "protected_late_result", "cancelled"].includes(
      job.status,
    )
  ) {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "cancelled",
    );
  }
  const now = clock();
  return bump(
    job,
    {
      status: "cancelled",
      cancellation: {
        cancelledAt: now,
        reason: z.string().trim().min(1).max(500).parse(reason),
      },
    },
    () => now,
  );
}

export interface AcceptedCandidateTransition {
  job: GenerationJob;
  candidate: ArtifactCandidate;
  receipt: Receipt;
}

export function acceptArtifactCandidate(
  unsafeJob: GenerationJob,
  expectedJobRevision: number,
  unsafeCandidate: ArtifactCandidate,
  campaignId: string,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = systemClock,
): AcceptedCandidateTransition {
  const job = GenerationJobSchema.parse(unsafeJob);
  const candidate = ArtifactCandidateSchema.parse(unsafeCandidate);
  assertJobRevision(job, expectedJobRevision);
  if (
    !["candidate", "protected_late_result"].includes(job.status) ||
    !["reviewable", "protected"].includes(candidate.status)
  ) {
    throw new InvalidTransitionError(
      `generation job ${job.id}`,
      job.status,
      "accepted",
    );
  }
  if (
    candidate.jobId !== job.id ||
    candidate.id !== job.candidateId ||
    candidate.inputSignature !== job.inputSignature
  ) {
    throw new RangeError("Candidate provenance does not match the generation job.");
  }
  const now = clock();
  const receiptId = idFactory("receipt");
  const receipt = ReceiptSchema.parse({
    schemaVersion: 1,
    id: receiptId,
    campaignId,
    planId: job.planId,
    itemId: job.itemId,
    jobId: job.id,
    candidateId: candidate.id,
    action: "candidate_accepted",
    inputSignature: job.inputSignature,
    resultRef: candidate.assetUrl,
    createdAt: now,
  });
  return {
    job: bump(
      job,
      {
        status: "accepted",
      },
      () => now,
    ),
    candidate: ArtifactCandidateSchema.parse({
      ...candidate,
      status: "accepted",
      receiptId,
      updatedAt: now,
    }),
    receipt,
  };
}

