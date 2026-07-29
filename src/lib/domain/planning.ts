import { z } from "zod";

import {
  CreativeBriefSchema,
  type Clock,
  type CreativeBrief,
  type ExecutionPlan,
  ExecutionPlanSchema,
  type IdFactory,
  IntakeSchema,
  type Intake,
  type JsonValue,
  JsonValueSchema,
  type Persona,
  PersonaSchema,
  type PlanItem,
  type PlanItemRuntime,
  PlanItemRuntimeSchema,
  type PlanStage,
  ProductFactSchema,
  type ProductFact,
  defaultIdFactory,
  systemClock,
} from "./contracts";
import {
  ApprovalRequiredError,
  InvalidTransitionError,
  RevisionConflictError,
} from "./errors";
import { exactInputSignature } from "./signature";

export const CreateExecutionPlanInputSchema = z
  .object({
    campaignId: z.string().min(3).max(160),
    intake: IntakeSchema,
    productFacts: z.array(ProductFactSchema).min(1),
    personas: z.array(PersonaSchema).min(1),
    brief: CreativeBriefSchema,
  })
  .strict();

export interface CreateExecutionPlanInput {
  campaignId: string;
  intake: Intake;
  productFacts: ProductFact[];
  personas: Persona[];
  brief: CreativeBrief;
}

const PlanItemPlannerPatchSchema = z
  .object({
    itemId: z.string().min(3).max(160),
    title: z.string().trim().min(1).max(180).optional(),
    instructions: z.string().trim().min(1).max(4_000).optional(),
    paid: z.boolean().optional(),
    exactInput: z.record(z.string(), JsonValueSchema).optional(),
    dependsOn: z.array(z.string().min(3).max(160)).optional(),
  })
  .strict();

const PlanStagePlannerPatchSchema = z
  .object({
    stageId: z.string().min(3).max(160),
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().min(1).max(1_000).optional(),
    order: z.number().int().min(0).optional(),
    itemPatches: z.array(PlanItemPlannerPatchSchema).optional(),
  })
  .strict();

export const PlanPlannerRevisionSchema = z
  .object({
    objective: z.string().trim().min(1).max(2_000).optional(),
    selectedHookRouteId: z.string().min(3).max(160).optional(),
    personaId: z.string().min(3).max(160).optional(),
    stagePatches: z.array(PlanStagePlannerPatchSchema).optional(),
  })
  .strict();

export type PlanPlannerRevision = z.infer<typeof PlanPlannerRevisionSchema>;

export const PlanItemRuntimePatchSchema = PlanItemRuntimeSchema.partial().strict();
export type PlanItemRuntimePatch = z.infer<typeof PlanItemRuntimePatchSchema>;

function assertRevision(
  resource: string,
  actual: number,
  expected: number,
): void {
  if (actual !== expected) {
    throw new RevisionConflictError(resource, expected, actual);
  }
}

function planSignaturePayload(plan: ExecutionPlan): Record<string, JsonValue> {
  return {
    route: plan.planner.route,
    briefId: plan.planner.briefId,
    objective: plan.planner.objective,
    selectedHookRouteId: plan.planner.selectedHookRouteId,
    personaId: plan.planner.personaId,
    stages: plan.stages.map((stage) => ({
      id: stage.id,
      title: stage.planner.title,
      description: stage.planner.description,
      order: stage.planner.order,
      items: stage.items.map((item) => ({
        id: item.id,
        kind: item.planner.kind,
        title: item.planner.title,
        instructions: item.planner.instructions,
        paid: item.planner.paid,
        exactInput: item.planner.exactInput,
        dependsOn: item.planner.dependsOn,
      })),
    })),
  };
}

export function computePlanInputSignature(plan: ExecutionPlan): string {
  return exactInputSignature(planSignaturePayload(plan));
}

function createRuntime(status: "ready" | "blocked"): PlanItemRuntime {
  return {
    status,
    attempt: 0,
    jobIds: [],
    resultRefs: [],
    error: null,
    startedAt: null,
    finishedAt: null,
  };
}

function selectedEntities(input: CreateExecutionPlanInput): {
  brief: CreativeBrief;
  hook: CreativeBrief["hookRoutes"][number];
  persona: Persona;
  facts: ProductFact[];
} {
  const brief = input.brief;
  if (
    brief.decision.status !== "approved" ||
    brief.selectedHookRouteId === null ||
    brief.selectedPersonaId === null
  ) {
    throw new ApprovalRequiredError(
      "The creative brief needs an approved hook and persona decision before planning.",
    );
  }
  const hook = brief.hookRoutes.find(
    (candidate) => candidate.id === brief.selectedHookRouteId,
  );
  const persona = input.personas.find(
    (candidate) => candidate.id === brief.selectedPersonaId,
  );
  if (!hook || !persona) {
    throw new RangeError("The approved brief references an unavailable hook or persona.");
  }
  const factIds = new Set(input.productFacts.map((fact) => fact.id));
  for (const claim of hook.claims) {
    if (!factIds.has(claim.factId)) {
      throw new RangeError(`Hook claim references unavailable fact ${claim.factId}.`);
    }
  }
  return {
    brief,
    hook,
    persona,
    facts: input.productFacts.filter((fact) =>
      brief.productFactIds.includes(fact.id),
    ),
  };
}

export function createExecutionPlan(
  unsafeInput: CreateExecutionPlanInput,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = systemClock,
): ExecutionPlan {
  const input = CreateExecutionPlanInputSchema.parse(unsafeInput);
  if (input.brief.campaignId !== input.campaignId) {
    throw new RangeError("The brief does not belong to the requested campaign.");
  }
  const { brief, hook, persona, facts } = selectedEntities(input);
  const now = clock();
  const planId = idFactory("plan");
  const foundationStageId = idFactory("stage");
  const productionStageId = idFactory("stage");
  const deliveryStageId = idFactory("stage");
  const anchorItemId = idFactory("item");
  const shotPlanItemId = idFactory("item");
  const imageItemId =
    input.intake.requestedOutputs.images > 0 ? idFactory("item") : null;
  const videoItemId =
    input.intake.requestedOutputs.videos > 0 ? idFactory("item") : null;
  const reviewItemId = idFactory("item");
  const exportItemId = idFactory("item");
  const factSnapshot = facts.map((fact) => ({
    factId: fact.id,
    field: fact.field,
    value: fact.value,
  }));
  const personaSnapshot = {
    personaId: persona.id,
    name: persona.name,
    archetype: persona.archetype,
    voiceTraits: [...persona.voiceTraits],
    guardrails: [...persona.guardrails],
  };
  const hookSnapshot = {
    hookRouteId: hook.id,
    name: hook.name,
    angle: hook.angle,
    opening: hook.opening,
    format: hook.format,
    claims: hook.claims.map((claim) => ({ ...claim })),
  };
  const productionItems: PlanItem[] = [];
  if (imageItemId !== null) {
    productionItems.push({
      id: imageItemId,
      planner: {
        kind: "image",
        title: "Generate key visual candidate",
        instructions:
          "Generate a creator-led key visual that follows the approved anchor and shot plan.",
        paid: true,
        exactInput: {
          productName: input.intake.productName,
          persona: personaSnapshot,
          hook: hookSnapshot,
          sourceAssetRefs: input.intake.sourceAssetRefs,
          outputCount: input.intake.requestedOutputs.images,
        },
        dependsOn: [anchorItemId, shotPlanItemId],
      },
      runtime: createRuntime("blocked"),
    });
  }
  if (videoItemId !== null) {
    productionItems.push({
      id: videoItemId,
      planner: {
        kind: "video",
        title: "Generate motion candidate",
        instructions:
          "Generate a short creator performance using the approved hook and grounded dialogue.",
        paid: true,
        exactInput: {
          productName: input.intake.productName,
          hook: hookSnapshot,
          persona: personaSnapshot,
          platform: input.intake.platforms,
          outputCount: input.intake.requestedOutputs.videos,
        },
        dependsOn:
          imageItemId === null
            ? [anchorItemId, shotPlanItemId]
            : [imageItemId],
      },
      runtime: createRuntime("blocked"),
    });
  }
  const productionItemIds = productionItems.map((item) => item.id);

  const stages: PlanStage[] = [
    {
      id: foundationStageId,
      planner: {
        title: "Creative foundation",
        description: "Lock the creator anchor and production-ready shot logic.",
        order: 0,
      },
      runtime: {
        status: "ready",
        startedAt: null,
        finishedAt: null,
      },
      items: [
        {
          id: anchorItemId,
          planner: {
            kind: "analysis",
            title: "Lock creator anchor",
            instructions:
              "Turn the approved persona into a consistent on-camera anchor without adding product claims.",
            paid: false,
            exactInput: {
              persona: personaSnapshot,
              platform: input.intake.platforms,
              constraints: input.intake.constraints,
            },
            dependsOn: [],
          },
          runtime: createRuntime("ready"),
        },
        {
          id: shotPlanItemId,
          planner: {
            kind: "analysis",
            title: "Build the shot and dialogue plan",
            instructions:
              "Translate the selected hook into observable beats and source-grounded dialogue.",
            paid: false,
            exactInput: {
              hook: hookSnapshot,
              facts: factSnapshot,
              goal: input.intake.goal,
            },
            dependsOn: [anchorItemId],
          },
          runtime: createRuntime("blocked"),
        },
      ],
    },
    {
      id: productionStageId,
      planner: {
        title: "Asset production",
        description: "Generate reviewable image and motion candidates.",
        order: 1,
      },
      runtime: {
        status: "blocked",
        startedAt: null,
        finishedAt: null,
      },
      items: productionItems,
    },
    {
      id: deliveryStageId,
      planner: {
        title: "Review and delivery",
        description: "Review candidates and export only explicitly accepted work.",
        order: 2,
      },
      runtime: {
        status: "blocked",
        startedAt: null,
        finishedAt: null,
      },
      items: [
        {
          id: reviewItemId,
          planner: {
            kind: "review",
            title: "Review generated candidates",
            instructions:
              "Check source grounding, creator consistency, platform fit, and visible defects.",
            paid: false,
            exactInput: {
              constraints: input.intake.constraints,
              requiredFactIds: brief.productFactIds,
            },
            dependsOn: productionItemIds,
          },
          runtime: createRuntime("blocked"),
        },
        {
          id: exportItemId,
          planner: {
            kind: "export",
            title: "Export accepted campaign package",
            instructions:
              "Package accepted assets with their receipts and source-grounding metadata.",
            paid: false,
            exactInput: {
              campaignId: input.campaignId,
              briefId: brief.id,
            },
            dependsOn: [reviewItemId],
          },
          runtime: createRuntime("blocked"),
        },
      ],
    },
  ];

  const unsignedPlan: ExecutionPlan = {
    schemaVersion: 1,
    id: planId,
    campaignId: input.campaignId,
    revision: 0,
    planner: {
      route: "planned",
      briefId: brief.id,
      objective: input.intake.goal,
      selectedHookRouteId: hook.id,
      personaId: persona.id,
      inputSignature: "sig_pending",
    },
    runtime: {
      status: "draft",
      approval: null,
      lastEventAt: now,
    },
    stages,
    createdAt: now,
    updatedAt: now,
  };
  const plan: ExecutionPlan = {
    ...unsignedPlan,
    planner: {
      ...unsignedPlan.planner,
      inputSignature: computePlanInputSignature(unsignedPlan),
    },
  };
  return ExecutionPlanSchema.parse(plan);
}

function applyPlannerPatch(
  plan: ExecutionPlan,
  patch: PlanPlannerRevision,
): ExecutionPlan {
  const stagePatchMap = new Map(
    (patch.stagePatches ?? []).map((stagePatch) => [
      stagePatch.stageId,
      stagePatch,
    ]),
  );

  for (const stageId of stagePatchMap.keys()) {
    if (!plan.stages.some((stage) => stage.id === stageId)) {
      throw new RangeError(`Unknown plan stage ${stageId}.`);
    }
  }

  const stages = plan.stages.map((stage) => {
    const stagePatch = stagePatchMap.get(stage.id);
    if (!stagePatch) {
      return stage;
    }
    const itemPatchMap = new Map(
      (stagePatch.itemPatches ?? []).map((itemPatch) => [
        itemPatch.itemId,
        itemPatch,
      ]),
    );
    for (const itemId of itemPatchMap.keys()) {
      if (!stage.items.some((item) => item.id === itemId)) {
        throw new RangeError(`Unknown item ${itemId} in stage ${stage.id}.`);
      }
    }

    return {
      ...stage,
      planner: {
        ...stage.planner,
        ...(stagePatch.title === undefined ? {} : { title: stagePatch.title }),
        ...(stagePatch.description === undefined
          ? {}
          : { description: stagePatch.description }),
        ...(stagePatch.order === undefined ? {} : { order: stagePatch.order }),
      },
      items: stage.items.map((item) => {
        const itemPatch = itemPatchMap.get(item.id);
        if (!itemPatch) {
          return item;
        }
        return {
          ...item,
          planner: {
            ...item.planner,
            ...(itemPatch.title === undefined ? {} : { title: itemPatch.title }),
            ...(itemPatch.instructions === undefined
              ? {}
              : { instructions: itemPatch.instructions }),
            ...(itemPatch.paid === undefined ? {} : { paid: itemPatch.paid }),
            ...(itemPatch.exactInput === undefined
              ? {}
              : { exactInput: itemPatch.exactInput }),
            ...(itemPatch.dependsOn === undefined
              ? {}
              : { dependsOn: itemPatch.dependsOn }),
          },
        };
      }),
    };
  });

  return {
    ...plan,
    planner: {
      ...plan.planner,
      ...(patch.objective === undefined ? {} : { objective: patch.objective }),
      ...(patch.selectedHookRouteId === undefined
        ? {}
        : { selectedHookRouteId: patch.selectedHookRouteId }),
      ...(patch.personaId === undefined ? {} : { personaId: patch.personaId }),
    },
    stages,
  };
}

export function reviseExecutionPlanPlanner(
  unsafePlan: ExecutionPlan,
  expectedRevision: number,
  unsafePatch: unknown,
  clock: Clock = systemClock,
): ExecutionPlan {
  const plan = ExecutionPlanSchema.parse(unsafePlan);
  assertRevision("execution plan", plan.revision, expectedRevision);
  const patch = PlanPlannerRevisionSchema.parse(unsafePatch);
  const patched = applyPlannerPatch(plan, patch);
  const newSignature = computePlanInputSignature(patched);
  const approvalStillValid =
    plan.runtime.approval?.inputSignature === newSignature;
  const now = clock();

  return ExecutionPlanSchema.parse({
    ...patched,
    revision: plan.revision + 1,
    planner: {
      ...patched.planner,
      inputSignature: newSignature,
    },
    runtime: {
      ...plan.runtime,
      status:
        approvalStillValid || plan.runtime.status !== "approved"
          ? plan.runtime.status
          : "draft",
      approval: approvalStillValid ? plan.runtime.approval : null,
      lastEventAt: now,
    },
    updatedAt: now,
  });
}

export function approveExecutionPlan(
  unsafePlan: ExecutionPlan,
  expectedRevision: number,
  approvedBy: string,
  clock: Clock = systemClock,
): ExecutionPlan {
  const plan = ExecutionPlanSchema.parse(unsafePlan);
  assertRevision("execution plan", plan.revision, expectedRevision);
  const approver = z.string().trim().min(1).max(160).parse(approvedBy);
  const now = clock();

  return ExecutionPlanSchema.parse({
    ...plan,
    revision: plan.revision + 1,
    runtime: {
      ...plan.runtime,
      status: "approved",
      approval: {
        inputSignature: plan.planner.inputSignature,
        approvedAt: now,
        approvedBy: approver,
      },
      lastEventAt: now,
    },
    updatedAt: now,
  });
}

export function isExecutionPlanApprovalValid(plan: ExecutionPlan): boolean {
  return (
    plan.runtime.approval !== null &&
    plan.runtime.approval.inputSignature === plan.planner.inputSignature
  );
}

const ITEM_TRANSITIONS: Record<PlanItemRuntime["status"], Set<PlanItemRuntime["status"]>> =
  {
    pending: new Set(["ready", "blocked", "cancelled"]),
    ready: new Set(["running", "blocked", "cancelled"]),
    running: new Set(["succeeded", "failed", "cancelled"]),
    succeeded: new Set(),
    failed: new Set(["ready", "running", "cancelled"]),
    blocked: new Set(["ready", "cancelled"]),
    cancelled: new Set(),
  };

function stageStatus(items: PlanItem[]): PlanStage["runtime"]["status"] {
  const statuses = items.map((item) => item.runtime.status);
  if (statuses.every((status) => status === "succeeded")) return "succeeded";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "ready")) return "ready";
  if (statuses.every((status) => status === "blocked")) return "blocked";
  return "pending";
}

function planRuntimeStatus(
  plan: ExecutionPlan,
  stages: PlanStage[],
): ExecutionPlan["runtime"]["status"] {
  const statuses = stages.flatMap((stage) =>
    stage.items.map((item) => item.runtime.status),
  );
  if (statuses.every((status) => status === "succeeded")) return "succeeded";
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (plan.runtime.status === "cancelled") return "cancelled";
  return isExecutionPlanApprovalValid(plan) ? "approved" : "draft";
}

function withRecomputedRuntime(
  plan: ExecutionPlan,
  stages: PlanStage[],
  now: string,
): ExecutionPlan {
  const recomputedStages = stages.map((stage) => {
    const status = stageStatus(stage.items);
    return {
      ...stage,
      runtime: {
        ...stage.runtime,
        status,
        startedAt:
          stage.runtime.startedAt ??
          (status === "running" ? now : null),
        finishedAt:
          status === "succeeded" ||
          status === "failed" ||
          status === "cancelled"
            ? now
            : null,
      },
    };
  });
  return {
    ...plan,
    stages: recomputedStages,
    runtime: {
      ...plan.runtime,
      status: planRuntimeStatus(plan, recomputedStages),
      lastEventAt: now,
    },
  };
}

export function updatePlanItemRuntime(
  unsafePlan: ExecutionPlan,
  expectedRevision: number,
  itemId: string,
  unsafePatch: unknown,
  clock: Clock = systemClock,
): ExecutionPlan {
  const plan = ExecutionPlanSchema.parse(unsafePlan);
  assertRevision("execution plan", plan.revision, expectedRevision);
  const patch = PlanItemRuntimePatchSchema.parse(unsafePatch);
  const current = plan.stages
    .flatMap((stage) => stage.items)
    .find((item) => item.id === itemId);
  if (!current) {
    throw new RangeError(`Unknown plan item ${itemId}.`);
  }
  const nextStatus = patch.status ?? current.runtime.status;
  if (
    nextStatus !== current.runtime.status &&
    !ITEM_TRANSITIONS[current.runtime.status].has(nextStatus)
  ) {
    throw new InvalidTransitionError(
      `plan item ${itemId}`,
      current.runtime.status,
      nextStatus,
    );
  }
  const now = clock();
  const stages = plan.stages.map((stage) => ({
    ...stage,
    items: stage.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            runtime: {
              ...item.runtime,
              ...patch,
            },
          }
        : item,
    ),
  }));
  const recomputed = withRecomputedRuntime(plan, stages, now);
  return ExecutionPlanSchema.parse({
    ...recomputed,
    revision: plan.revision + 1,
    updatedAt: now,
  });
}

export function retryFailedPlanItems(
  unsafePlan: ExecutionPlan,
  expectedRevision: number,
  clock: Clock = systemClock,
): ExecutionPlan {
  const plan = ExecutionPlanSchema.parse(unsafePlan);
  assertRevision("execution plan", plan.revision, expectedRevision);
  const hasFailures = plan.stages.some((stage) =>
    stage.items.some((item) => item.runtime.status === "failed"),
  );
  if (!hasFailures) {
    return plan;
  }
  const now = clock();
  const stages = plan.stages.map((stage) => ({
    ...stage,
    items: stage.items.map((item) =>
      item.runtime.status === "failed"
        ? {
            ...item,
            runtime: {
              ...item.runtime,
              status: "ready" as const,
              attempt: item.runtime.attempt + 1,
              error: null,
              startedAt: null,
              finishedAt: null,
            },
          }
        : item,
    ),
  }));
  const recomputed = withRecomputedRuntime(plan, stages, now);
  return ExecutionPlanSchema.parse({
    ...recomputed,
    revision: plan.revision + 1,
    updatedAt: now,
  });
}
