import { z } from "zod";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const TimestampSchema = z.string().datetime({ offset: true });
export const DomainIdSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9_-]*$/i, "IDs may only contain letters, numbers, _ and -");

export const EvidenceSourceSchema = z
  .object({
    kind: z.enum(["user_input", "uploaded_reference", "linked_reference"]),
    reference: z.string().trim().min(1).max(500),
    locator: z.string().trim().min(1).max(500).nullable(),
    capturedAt: TimestampSchema.nullable(),
  })
  .strict();

export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const ProductFactSchema = z
  .object({
    id: DomainIdSchema,
    field: z.string().trim().min(1).max(120),
    value: z.string().trim().min(1).max(2_000),
    kind: z.enum([
      "identity",
      "price",
      "specification",
      "ingredient",
      "efficacy",
      "availability",
      "other",
    ]),
    isClaim: z.boolean(),
    source: EvidenceSourceSchema.nullable(),
  })
  .strict()
  .superRefine((fact, context) => {
    if (fact.isClaim && fact.source === null) {
      context.addIssue({
        code: "custom",
        message: "A product claim must cite user input or a supplied reference.",
        path: ["source"],
      });
    }
  });

export type ProductFact = z.infer<typeof ProductFactSchema>;

export const IntakeSchema = z
  .object({
    id: DomainIdSchema,
    productName: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(160),
    goal: z.string().trim().min(1).max(1_000),
    audiences: z.array(z.string().trim().min(1).max(240)).min(1).max(12),
    platforms: z
      .array(
        z.enum([
          "douyin",
          "xiaohongshu",
          "bilibili",
          "kuaishou",
          "instagram",
          "tiktok",
          "youtube",
          "other",
        ]),
      )
      .min(1)
      .max(8),
    tones: z.array(z.string().trim().min(1).max(120)).max(12),
    constraints: z.array(z.string().trim().min(1).max(500)).max(24),
    sourceAssetRefs: z.array(z.string().trim().min(1).max(500)).max(40),
    requestedOutputs: z
      .object({
        images: z.number().int().min(0).max(100),
        videos: z.number().int().min(0).max(100),
      })
      .strict()
      .refine((outputs) => outputs.images + outputs.videos > 0, {
        message: "At least one output must be requested.",
      }),
  })
  .strict();

export type Intake = z.infer<typeof IntakeSchema>;

export const PersonaSchema = z
  .object({
    id: DomainIdSchema,
    name: z.string().trim().min(1).max(120),
    archetype: z.string().trim().min(1).max(160),
    audienceFit: z.string().trim().min(1).max(600),
    voiceTraits: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
    guardrails: z.array(z.string().trim().min(1).max(300)).max(20),
  })
  .strict();

export type Persona = z.infer<typeof PersonaSchema>;

export const GroundedClaimSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    factId: DomainIdSchema,
  })
  .strict();

export type GroundedClaim = z.infer<typeof GroundedClaimSchema>;

export const HookRouteSchema = z
  .object({
    id: DomainIdSchema,
    name: z.string().trim().min(1).max(100),
    angle: z.string().trim().min(1).max(300),
    opening: z.string().trim().min(1).max(500),
    format: z.string().trim().min(1).max(160),
    claims: z.array(GroundedClaimSchema).max(12),
    personaId: DomainIdSchema.nullable(),
    status: z.enum(["draft", "shortlisted", "selected", "rejected"]),
  })
  .strict();

export type HookRoute = z.infer<typeof HookRouteSchema>;

export const BriefDecisionSchema = z
  .object({
    status: z.enum(["pending", "approved"]),
    decidedAt: TimestampSchema.nullable(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.status === "approved" && decision.decidedAt === null) {
      context.addIssue({
        code: "custom",
        message: "An approved decision requires a timestamp.",
        path: ["decidedAt"],
      });
    }
  });

export const CreativeBriefSchema = z
  .object({
    id: DomainIdSchema,
    campaignId: DomainIdSchema,
    title: z.string().trim().min(1).max(200),
    productFactIds: z.array(DomainIdSchema).min(1),
    personaIds: z.array(DomainIdSchema).min(1).max(12),
    hookRoutes: z.array(HookRouteSchema).length(5),
    selectedHookRouteId: DomainIdSchema.nullable(),
    selectedPersonaId: DomainIdSchema.nullable(),
    decision: BriefDecisionSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((brief, context) => {
    const hookIds = new Set(brief.hookRoutes.map((hook) => hook.id));
    const hookOpenings = new Set(
      brief.hookRoutes.map((hook) => hook.opening.trim().toLocaleLowerCase()),
    );
    const hookAngles = new Set(
      brief.hookRoutes.map((hook) => hook.angle.trim().toLocaleLowerCase()),
    );

    if (hookIds.size !== 5) {
      context.addIssue({
        code: "custom",
        message: "All five hook routes need independent IDs.",
        path: ["hookRoutes"],
      });
    }
    if (hookOpenings.size !== 5) {
      context.addIssue({
        code: "custom",
        message: "All five hook routes need distinct openings.",
        path: ["hookRoutes"],
      });
    }
    if (hookAngles.size !== 5) {
      context.addIssue({
        code: "custom",
        message: "All five hook routes need distinct angles.",
        path: ["hookRoutes"],
      });
    }
    if (
      brief.selectedHookRouteId !== null &&
      !hookIds.has(brief.selectedHookRouteId)
    ) {
      context.addIssue({
        code: "custom",
        message: "The selected hook must belong to this brief.",
        path: ["selectedHookRouteId"],
      });
    }
    if (
      brief.selectedPersonaId !== null &&
      !brief.personaIds.includes(brief.selectedPersonaId)
    ) {
      context.addIssue({
        code: "custom",
        message: "The selected persona must belong to this brief.",
        path: ["selectedPersonaId"],
      });
    }
    if (
      brief.decision.status === "approved" &&
      (brief.selectedHookRouteId === null || brief.selectedPersonaId === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Brief approval requires both a hook and a persona decision.",
        path: ["decision"],
      });
    }
  });

export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

export const PlanItemPlannerSchema = z
  .object({
    kind: z.enum(["analysis", "image", "video", "review", "export"]),
    title: z.string().trim().min(1).max(180),
    instructions: z.string().trim().min(1).max(4_000),
    paid: z.boolean(),
    exactInput: z.record(z.string(), JsonValueSchema),
    dependsOn: z.array(DomainIdSchema),
  })
  .strict();

export type PlanItemPlanner = z.infer<typeof PlanItemPlannerSchema>;

export const PlanItemRuntimeSchema = z
  .object({
    status: z.enum([
      "pending",
      "ready",
      "running",
      "succeeded",
      "failed",
      "blocked",
      "cancelled",
    ]),
    attempt: z.number().int().min(0),
    jobIds: z.array(DomainIdSchema),
    resultRefs: z.array(z.string().trim().min(1).max(2_000)),
    error: z.string().trim().min(1).max(2_000).nullable(),
    startedAt: TimestampSchema.nullable(),
    finishedAt: TimestampSchema.nullable(),
  })
  .strict();

export type PlanItemRuntime = z.infer<typeof PlanItemRuntimeSchema>;

export const PlanItemSchema = z
  .object({
    id: DomainIdSchema,
    planner: PlanItemPlannerSchema,
    runtime: PlanItemRuntimeSchema,
  })
  .strict();

export type PlanItem = z.infer<typeof PlanItemSchema>;

export const PlanStagePlannerSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(1_000),
    order: z.number().int().min(0),
  })
  .strict();

export const PlanStageRuntimeSchema = z
  .object({
    status: z.enum([
      "pending",
      "ready",
      "running",
      "succeeded",
      "failed",
      "blocked",
      "cancelled",
    ]),
    startedAt: TimestampSchema.nullable(),
    finishedAt: TimestampSchema.nullable(),
  })
  .strict();

export const PlanStageSchema = z
  .object({
    id: DomainIdSchema,
    planner: PlanStagePlannerSchema,
    runtime: PlanStageRuntimeSchema,
    items: z.array(PlanItemSchema).min(1),
  })
  .strict();

export type PlanStage = z.infer<typeof PlanStageSchema>;

export const PlanApprovalSchema = z
  .object({
    inputSignature: z.string().min(8).max(160),
    approvedAt: TimestampSchema,
    approvedBy: z.string().trim().min(1).max(160),
  })
  .strict();

export type PlanApproval = z.infer<typeof PlanApprovalSchema>;

export const PlanPlannerSchema = z
  .object({
    route: z.literal("planned"),
    briefId: DomainIdSchema,
    objective: z.string().trim().min(1).max(2_000),
    selectedHookRouteId: DomainIdSchema,
    personaId: DomainIdSchema,
    inputSignature: z.string().min(8).max(160),
  })
  .strict();

export const PlanRuntimeSchema = z
  .object({
    status: z.enum([
      "draft",
      "approved",
      "running",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    approval: PlanApprovalSchema.nullable(),
    lastEventAt: TimestampSchema,
  })
  .strict();

export const ExecutionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: DomainIdSchema,
    campaignId: DomainIdSchema,
    revision: z.number().int().min(0),
    planner: PlanPlannerSchema,
    runtime: PlanRuntimeSchema,
    stages: z.array(PlanStageSchema).min(1),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const stageIds = plan.stages.map((stage) => stage.id);
    if (new Set(stageIds).size !== stageIds.length) {
      context.addIssue({
        code: "custom",
        message: "Stage IDs must be unique.",
        path: ["stages"],
      });
    }

    const items = plan.stages.flatMap((stage) => stage.items);
    const itemIds = items.map((item) => item.id);
    const knownItemIds = new Set(itemIds);
    if (knownItemIds.size !== itemIds.length) {
      context.addIssue({
        code: "custom",
        message: "Plan item IDs must be unique.",
        path: ["stages"],
      });
    }

    for (const [itemIndex, item] of items.entries()) {
      for (const dependencyId of item.planner.dependsOn) {
        if (!knownItemIds.has(dependencyId) || dependencyId === item.id) {
          context.addIssue({
            code: "custom",
            message: "Plan dependencies must point to another item in the plan.",
            path: ["items", itemIndex, "planner", "dependsOn"],
          });
        }
      }
    }

    if (
      plan.runtime.approval !== null &&
      plan.runtime.approval.inputSignature !== plan.planner.inputSignature
    ) {
      context.addIssue({
        code: "custom",
        message: "Plan approval does not match the current exact input.",
        path: ["runtime", "approval"],
      });
    }
  });

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const GenerationInputSchema = z
  .object({
    kind: z.enum(["image", "video"]),
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(240),
    prompt: z.string().trim().min(1).max(20_000),
    aspectRatio: z.string().trim().min(1).max(40),
    durationSeconds: z.number().positive().max(600).nullable(),
    referenceArtifactIds: z.array(DomainIdSchema).max(20),
    parameters: z.record(z.string(), JsonValueSchema),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === "image" && input.durationSeconds !== null) {
      context.addIssue({
        code: "custom",
        message: "Image jobs cannot have a duration.",
        path: ["durationSeconds"],
      });
    }
    if (input.kind === "video" && input.durationSeconds === null) {
      context.addIssue({
        code: "custom",
        message: "Video jobs require a duration.",
        path: ["durationSeconds"],
      });
    }
  });

export type GenerationInput = z.infer<typeof GenerationInputSchema>;

export const GenerationStatusSchema = z.enum([
  "draft",
  "provider_pending",
  "provider_failed",
  "materialization_pending",
  "materialization_failed",
  "candidate",
  "accepted",
  "cancelled",
  "protected_late_result",
]);

export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;

export const GenerationApprovalSchema = z
  .object({
    inputSignature: z.string().min(8).max(160),
    approvedAt: TimestampSchema,
    approvedBy: z.string().trim().min(1).max(160),
  })
  .strict();

export const ProviderResultSchema = z
  .object({
    providerRequestId: z.string().trim().min(1).max(500),
    remoteUrl: z.string().trim().url().max(4_000),
    mimeType: z.string().trim().min(1).max(200),
    receivedAt: TimestampSchema,
  })
  .strict();

export type ProviderResult = z.infer<typeof ProviderResultSchema>;

export const GenerationJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: DomainIdSchema,
    planId: DomainIdSchema,
    itemId: DomainIdSchema,
    revision: z.number().int().min(0),
    status: GenerationStatusSchema,
    input: GenerationInputSchema,
    inputSignature: z.string().min(8).max(160),
    approval: GenerationApprovalSchema.nullable(),
    idempotencyKey: z.string().trim().min(8).max(240),
    providerRequestId: z.string().trim().min(1).max(500).nullable(),
    providerResult: ProviderResultSchema.nullable(),
    candidateId: DomainIdSchema.nullable(),
    attempts: z.number().int().min(0),
    lastError: z.string().trim().min(1).max(2_000).nullable(),
    cancellation: z
      .object({
        cancelledAt: TimestampSchema,
        reason: z.string().trim().min(1).max(500),
      })
      .strict()
      .nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((job, context) => {
    if (
      job.approval !== null &&
      job.approval.inputSignature !== job.inputSignature
    ) {
      context.addIssue({
        code: "custom",
        message: "Generation approval does not match the exact input.",
        path: ["approval"],
      });
    }
    if (
      [
        "materialization_pending",
        "materialization_failed",
        "candidate",
        "accepted",
        "protected_late_result",
      ].includes(job.status) &&
      job.providerResult === null
    ) {
      context.addIssue({
        code: "custom",
        message: "This generation state requires a provider result.",
        path: ["providerResult"],
      });
    }
    if (
      ["candidate", "accepted", "protected_late_result"].includes(job.status) &&
      job.candidateId === null
    ) {
      context.addIssue({
        code: "custom",
        message: "This generation state requires a candidate.",
        path: ["candidateId"],
      });
    }
  });

export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export const ArtifactCandidateSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: DomainIdSchema,
    jobId: DomainIdSchema,
    planId: DomainIdSchema,
    itemId: DomainIdSchema,
    kind: z.enum(["image", "video"]),
    status: z.enum(["reviewable", "protected", "accepted", "rejected"]),
    assetUrl: z.string().trim().url().max(4_000),
    mimeType: z.string().trim().min(1).max(200),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    inputSignature: z.string().min(8).max(160),
    providerRequestId: z.string().trim().min(1).max(500),
    protectedReason: z.string().trim().min(1).max(500).nullable(),
    receiptId: DomainIdSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.status === "protected" &&
      candidate.protectedReason === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A protected candidate requires a reason.",
        path: ["protectedReason"],
      });
    }
    if (candidate.status === "accepted" && candidate.receiptId === null) {
      context.addIssue({
        code: "custom",
        message: "An accepted candidate requires a receipt.",
        path: ["receiptId"],
      });
    }
  });

export type ArtifactCandidate = z.infer<typeof ArtifactCandidateSchema>;

export const ReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: DomainIdSchema,
    campaignId: DomainIdSchema,
    planId: DomainIdSchema,
    itemId: DomainIdSchema,
    jobId: DomainIdSchema,
    candidateId: DomainIdSchema,
    action: z.literal("candidate_accepted"),
    inputSignature: z.string().min(8).max(160),
    resultRef: z.string().trim().url().max(4_000),
    createdAt: TimestampSchema,
  })
  .strict();

export type Receipt = z.infer<typeof ReceiptSchema>;

export const CampaignSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: DomainIdSchema,
    revision: z.number().int().min(0),
    name: z.string().trim().min(1).max(200),
    status: z.enum(["draft", "active", "completed", "archived"]),
    intake: IntakeSchema,
    productFacts: z.array(ProductFactSchema),
    personas: z.array(PersonaSchema),
    briefs: z.array(CreativeBriefSchema),
    selectedBriefId: DomainIdSchema.nullable(),
    plans: z.array(ExecutionPlanSchema),
    jobs: z.array(GenerationJobSchema),
    candidates: z.array(ArtifactCandidateSchema),
    receipts: z.array(ReceiptSchema),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((campaign, context) => {
    const assertUnique = (
      ids: string[],
      path: (string | number)[],
      label: string,
    ): void => {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          message: `${label} IDs must be unique within a campaign.`,
          path,
        });
      }
    };
    assertUnique(
      campaign.productFacts.map((fact) => fact.id),
      ["productFacts"],
      "Product fact",
    );
    assertUnique(
      campaign.personas.map((persona) => persona.id),
      ["personas"],
      "Persona",
    );
    assertUnique(
      campaign.briefs.map((brief) => brief.id),
      ["briefs"],
      "Brief",
    );
    assertUnique(
      campaign.plans.map((plan) => plan.id),
      ["plans"],
      "Plan",
    );
    assertUnique(
      campaign.jobs.map((job) => job.id),
      ["jobs"],
      "Generation job",
    );
    assertUnique(
      campaign.candidates.map((candidate) => candidate.id),
      ["candidates"],
      "Candidate",
    );
    assertUnique(
      campaign.receipts.map((receipt) => receipt.id),
      ["receipts"],
      "Receipt",
    );

    const factIds = new Set(campaign.productFacts.map((fact) => fact.id));
    const personaIds = new Set(campaign.personas.map((persona) => persona.id));
    const briefIds = new Set(campaign.briefs.map((brief) => brief.id));
    const planIds = new Set(campaign.plans.map((plan) => plan.id));

    if (
      campaign.selectedBriefId !== null &&
      !briefIds.has(campaign.selectedBriefId)
    ) {
      context.addIssue({
        code: "custom",
        message: "The selected brief must belong to this campaign.",
        path: ["selectedBriefId"],
      });
    }

    campaign.briefs.forEach((brief, briefIndex) => {
      if (brief.campaignId !== campaign.id) {
        context.addIssue({
          code: "custom",
          message: "Brief campaign ID does not match its parent campaign.",
          path: ["briefs", briefIndex, "campaignId"],
        });
      }
      brief.productFactIds.forEach((factId) => {
        if (!factIds.has(factId)) {
          context.addIssue({
            code: "custom",
            message: "Brief references an unknown product fact.",
            path: ["briefs", briefIndex, "productFactIds"],
          });
        }
      });
      brief.personaIds.forEach((personaId) => {
        if (!personaIds.has(personaId)) {
          context.addIssue({
            code: "custom",
            message: "Brief references an unknown persona.",
            path: ["briefs", briefIndex, "personaIds"],
          });
        }
      });
      brief.hookRoutes.forEach((hook, hookIndex) => {
        hook.claims.forEach((claim) => {
          const fact = campaign.productFacts.find(
            (candidate) => candidate.id === claim.factId,
          );
          if (!fact) {
            context.addIssue({
              code: "custom",
              message: "Hook claim references an unknown product fact.",
              path: ["briefs", briefIndex, "hookRoutes", hookIndex, "claims"],
            });
          } else if (fact.source === null) {
            context.addIssue({
              code: "custom",
              message: "Hook claim references a product fact without evidence.",
              path: ["briefs", briefIndex, "hookRoutes", hookIndex, "claims"],
            });
          }
        });
      });
    });

    campaign.plans.forEach((plan, planIndex) => {
      if (plan.campaignId !== campaign.id || !briefIds.has(plan.planner.briefId)) {
        context.addIssue({
          code: "custom",
          message: "Plan references a campaign or brief outside this campaign.",
          path: ["plans", planIndex],
        });
      }
    });

    campaign.jobs.forEach((job, jobIndex) => {
      const plan = campaign.plans.find((candidate) => candidate.id === job.planId);
      if (!plan) {
        context.addIssue({
          code: "custom",
          message: "Generation job references an unknown plan.",
          path: ["jobs", jobIndex, "planId"],
        });
      } else if (
        !plan.stages.some((stage) =>
          stage.items.some((item) => item.id === job.itemId),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Generation job references an item outside its plan.",
          path: ["jobs", jobIndex, "itemId"],
        });
      }
    });

    campaign.candidates.forEach((candidate, candidateIndex) => {
      const job = campaign.jobs.find((entry) => entry.id === candidate.jobId);
      if (!job) {
        context.addIssue({
          code: "custom",
          message: "Candidate references an unknown generation job.",
          path: ["candidates", candidateIndex, "jobId"],
        });
      } else if (
        candidate.planId !== job.planId ||
        candidate.itemId !== job.itemId ||
        candidate.id !== job.candidateId ||
        candidate.inputSignature !== job.inputSignature
      ) {
        context.addIssue({
          code: "custom",
          message: "Candidate provenance does not match its generation job.",
          path: ["candidates", candidateIndex],
        });
      }
    });

    campaign.receipts.forEach((receipt, receiptIndex) => {
      const job = campaign.jobs.find((entry) => entry.id === receipt.jobId);
      const candidate = campaign.candidates.find(
        (entry) => entry.id === receipt.candidateId,
      );
      if (
        !planIds.has(receipt.planId) ||
        !job ||
        !candidate
      ) {
        context.addIssue({
          code: "custom",
          message: "Receipt references an unknown plan, job, or candidate.",
          path: ["receipts", receiptIndex],
        });
      } else if (
        receipt.campaignId !== campaign.id ||
        receipt.planId !== job.planId ||
        receipt.itemId !== job.itemId ||
        receipt.candidateId !== candidate.id ||
        receipt.inputSignature !== candidate.inputSignature ||
        receipt.resultRef !== candidate.assetUrl ||
        candidate.receiptId !== receipt.id
      ) {
        context.addIssue({
          code: "custom",
          message: "Receipt provenance does not match its accepted candidate.",
          path: ["receipts", receiptIndex],
        });
      }
    });
  });

export type Campaign = z.infer<typeof CampaignSchema>;

export const CampaignExportEnvelopeSchema = z
  .object({
    format: z.literal("vixel-koc-campaign"),
    version: z.literal(1),
    exportedAt: TimestampSchema,
    campaign: CampaignSchema,
  })
  .strict();

export type CampaignExportEnvelope = z.infer<
  typeof CampaignExportEnvelopeSchema
>;

export type DomainIdKind =
  | "campaign"
  | "intake"
  | "fact"
  | "persona"
  | "brief"
  | "hook"
  | "plan"
  | "stage"
  | "item"
  | "job"
  | "candidate"
  | "receipt";

export type IdFactory = (kind: DomainIdKind) => string;
export type Clock = () => string;

export const defaultIdFactory: IdFactory = (kind) =>
  `${kind}_${globalThis.crypto.randomUUID()}`;

export const systemClock: Clock = () => new Date().toISOString();

export function createSequenceIdFactory(seed = "test"): IdFactory {
  let sequence = 0;
  return (kind) => `${kind}_${seed}_${String(++sequence).padStart(4, "0")}`;
}

export function fixedClock(timestamp: string): Clock {
  const parsed = TimestampSchema.parse(timestamp);
  return () => parsed;
}
