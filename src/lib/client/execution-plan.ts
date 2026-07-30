"use client";

import type { CampaignState } from "./campaign-store";
import {
  approveExecutionPlan,
  createExecutionPlan,
  exactInputSignature,
  type ExecutionPlan,
  type IdFactory,
  type Intake,
  type Persona,
  type ProductFact,
  updatePlanItemRuntime,
} from "@/lib/domain";

export type PlanEvent =
  | "image_candidate"
  | "image_adopted"
  | "video_submitted"
  | "video_succeeded"
  | "video_failed"
  | "video_adopted"
  | "delivery_exported";

function safeId(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  const candidate = normalized.length >= 3 ? normalized : `${fallback}-item`;
  return /^[a-z]/.test(candidate) ? candidate : `${fallback}-${candidate}`;
}

function platformFor(
  platform: CampaignState["input"]["platform"],
): Intake["platforms"][number] {
  if (platform === "TikTok") return "tiktok";
  if (platform === "Instagram Reels") return "instagram";
  if (platform === "YouTube Shorts") return "youtube";
  return "xiaohongshu";
}

function deterministicIdFactory(seed: unknown): IdFactory {
  const digest = exactInputSignature(seed).slice(-14);
  const counts = new Map<string, number>();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}-${digest}-${count}`;
  };
}

function transitionItem(
  plan: ExecutionPlan,
  itemId: string,
  target: "ready" | "running" | "succeeded" | "failed",
): ExecutionPlan {
  let next = plan;
  const status = () =>
    next.stages
      .flatMap((stage) => stage.items)
      .find((item) => item.id === itemId)?.runtime.status;

  if (status() === target || status() === "succeeded") return next;
  if (status() === "blocked") {
    next = updatePlanItemRuntime(next, next.revision, itemId, {
      status: "ready",
    });
  }
  if (
    status() === "ready" &&
    (target === "running" || target === "succeeded" || target === "failed")
  ) {
    next = updatePlanItemRuntime(next, next.revision, itemId, {
      status: "running",
      attempt:
        (next.stages
          .flatMap((stage) => stage.items)
          .find((item) => item.id === itemId)?.runtime.attempt ?? 0) + 1,
    });
  }
  if (status() === "running" && target !== "running") {
    next = updatePlanItemRuntime(next, next.revision, itemId, {
      status: target,
      error: target === "failed" ? "Provider job failed." : null,
    });
  }
  return next;
}

function itemId(
  plan: ExecutionPlan,
  kind: "analysis" | "image" | "video" | "review" | "export",
  occurrence = 0,
): string | null {
  return (
    plan.stages
      .flatMap((stage) => stage.items)
      .filter((item) => item.planner.kind === kind)[occurrence]?.id ?? null
  );
}

function itemStatus(
  plan: ExecutionPlan,
  targetItemId: string,
): ExecutionPlan["stages"][number]["items"][number]["runtime"]["status"] | null {
  return (
    plan.stages
      .flatMap((stage) => stage.items)
      .find((item) => item.id === targetItemId)?.runtime.status ?? null
  );
}

export function advanceExecutionPlan(
  plan: ExecutionPlan | null | undefined,
  event: PlanEvent,
): ExecutionPlan | null {
  if (!plan) return null;
  let next = plan;
  const image = itemId(next, "image");
  const video = itemId(next, "video");
  const review = itemId(next, "review");
  const delivery = itemId(next, "export");

  if ((event === "image_candidate" || event === "image_adopted") && image) {
    next = transitionItem(next, image, "succeeded");
  }
  if (event === "image_adopted" && video) {
    next = transitionItem(next, video, "ready");
  }
  if (event === "video_submitted" && video) {
    next = transitionItem(next, video, "running");
  }
  if (event === "video_succeeded" && video) {
    next = transitionItem(next, video, "succeeded");
    if (review) next = transitionItem(next, review, "ready");
  }
  if (event === "video_failed" && video) {
    next = transitionItem(next, video, "failed");
  }
  if (event === "video_adopted") {
    if (video) next = transitionItem(next, video, "succeeded");
    if (review) next = transitionItem(next, review, "succeeded");
    if (delivery) next = transitionItem(next, delivery, "ready");
  }
  if (event === "delivery_exported" && delivery) {
    const status = itemStatus(next, delivery);
    if (status === "ready" || status === "running") {
      next = transitionItem(next, delivery, "succeeded");
    }
  }
  return next;
}

export function buildExecutionPlanForCampaign(
  campaign: CampaignState,
): ExecutionPlan | null {
  if (
    !campaign.brief ||
    !campaign.selectedHookId ||
    !campaign.selectedPersonaId
  ) {
    return null;
  }

  const factValues = campaign.input.facts
    .map((fact) => fact.trim())
    .filter(Boolean);
  if (!factValues.length) return null;
  const campaignId = safeId(campaign.id, "campaign");
  const capturedAt = campaign.updatedAt;
  const facts: ProductFact[] = factValues.map((value, index) => ({
    id: `fact-${index + 1}`,
    field: `supplied_fact_${index + 1}`,
    value,
    kind: "other",
    isClaim: true,
    source: {
      kind: "user_input",
      reference: `Campaign product fact ${index + 1}`,
      locator: null,
      capturedAt,
    },
  }));
  const personaIds = campaign.brief.personas.map((persona, index) =>
    safeId(persona.id, `persona-${index + 1}`),
  );
  const personas: Persona[] = campaign.brief.personas.map((persona, index) => ({
    id: personaIds[index],
    name: persona.label,
    archetype: persona.description,
    audienceFit: campaign.input.audience,
    voiceTraits: [persona.voice],
    guardrails: campaign.brief?.guardrails.slice(0, 20) ?? [],
  }));
  const hookIds = campaign.brief.hooks.map((hook, index) =>
    safeId(hook.id, `hook-${index + 1}`),
  );
  const selectedHookIndex = campaign.brief.hooks.findIndex(
    (hook) => hook.id === campaign.selectedHookId,
  );
  const selectedPersonaIndex = campaign.brief.personas.findIndex(
    (persona) => persona.id === campaign.selectedPersonaId,
  );
  if (selectedHookIndex < 0 || selectedPersonaIndex < 0) return null;

  const selectedHookId = hookIds[selectedHookIndex];
  const selectedPersonaId = personaIds[selectedPersonaIndex];
  const now = new Date().toISOString();
  const brief = {
    id: safeId(`brief-${campaignId}`, "brief"),
    campaignId,
    title: campaign.brief.summary.slice(0, 200),
    productFactIds: facts.map((fact) => fact.id),
    personaIds,
    hookRoutes: campaign.brief.hooks.map((hook, index) => {
      const groundedClaims = (hook.claims ?? [])
        .map((claim) => {
          const fact = facts.find((candidate) => candidate.id === claim.factId);
          return fact && fact.value === claim.text
            ? { text: fact.value, factId: fact.id }
            : null;
        })
        .filter((claim): claim is { text: string; factId: string } =>
          Boolean(claim),
        )
        .slice(0, 12);
      return {
        id: hookIds[index],
        name: hook.label,
        angle: hook.why,
        opening: hook.script,
        format: campaign.input.format,
        claims:
          groundedClaims.length > 0
            ? groundedClaims
            : facts.slice(0, 12).map((fact) => ({
                text: fact.value,
                factId: fact.id,
              })),
        personaId: null,
        status:
          index === selectedHookIndex
            ? ("selected" as const)
            : ("rejected" as const),
      };
    }),
    selectedHookRouteId: selectedHookId,
    selectedPersonaId,
    decision: {
      status: "approved" as const,
      decidedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
  const intake: Intake = {
    id: safeId(`intake-${campaignId}`, "intake"),
    productName: campaign.input.productName,
    category: campaign.input.category.trim() || "Product",
    goal: campaign.input.goal,
    audiences: [campaign.input.audience],
    platforms: [platformFor(campaign.input.platform)],
    tones: [campaign.brief.personas[selectedPersonaIndex].voice],
    constraints: campaign.brief.guardrails.slice(0, 24),
    sourceAssetRefs: [
      campaign.input.productImageDataUrl ? "browser-product-reference" : "",
      campaign.input.creatorImageDataUrl ? "browser-creator-reference" : "",
    ].filter(Boolean),
    requestedOutputs: { images: 1, videos: 1 },
  };
  const seed = {
    campaignId,
    selectedHookId,
    selectedPersonaId,
    facts: factValues,
  };
  const clock = () => now;
  let plan = createExecutionPlan(
    {
      campaignId,
      intake,
      productFacts: facts,
      personas,
      brief,
    },
    deterministicIdFactory(seed),
    clock,
  );
  plan = approveExecutionPlan(plan, plan.revision, "studio-user", clock);

  for (const analysisItem of plan.stages
    .flatMap((stage) => stage.items)
    .filter((item) => item.planner.kind === "analysis")) {
    plan = transitionItem(plan, analysisItem.id, "succeeded");
  }
  const image = itemId(plan, "image");
  if (image) plan = transitionItem(plan, image, "ready");
  if (
    campaign.candidates.some(
      (candidate) => candidate.kind === "image" && candidate.status === "adopted",
    )
  ) {
    plan = advanceExecutionPlan(plan, "image_adopted") ?? plan;
  }
  if (
    campaign.candidates.some(
      (candidate) => candidate.kind === "video" && candidate.status === "adopted",
    )
  ) {
    plan = advanceExecutionPlan(plan, "video_adopted") ?? plan;
  }
  return plan;
}

export function ensureExecutionPlan(campaign: CampaignState): CampaignState {
  if (campaign.executionPlan) return campaign;
  return {
    ...campaign,
    executionPlan: buildExecutionPlanForCampaign(campaign),
  };
}
