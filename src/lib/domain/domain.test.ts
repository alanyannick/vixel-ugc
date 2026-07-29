import { describe, expect, it } from "vitest";

import {
  ApprovalRequiredError,
  CampaignImportError,
  ProductFactSchema,
  RevisionConflictError,
  acceptArtifactCandidate,
  approveCreativeBriefDecision,
  approveExecutionPlan,
  approveGenerationInput,
  cancelGenerationJob,
  changeGenerationInput,
  createCampaign,
  createCreativeBrief,
  createExecutionPlan,
  createGenerationJob,
  createIntake,
  createSequenceIdFactory,
  exactInputSignature,
  exportCampaign,
  fixedClock,
  importCampaign,
  isExecutionPlanApprovalValid,
  isGenerationApprovalValid,
  materializeGenerationResult,
  recordMaterializationFailure,
  recordProviderResult,
  retryFailedPlanItems,
  retryGenerationJob,
  reviseExecutionPlanPlanner,
  routeCreativeWork,
  submitGenerationJob,
  type CreativeBrief,
  type ExecutionPlan,
  type GenerationInput,
  type GenerationJob,
  type Intake,
  type Persona,
  type ProductFact,
} from "./index";

const NOW = "2026-07-30T08:00:00.000Z";
const LATER = "2026-07-30T08:05:00.000Z";
const clock = fixedClock(NOW);
const laterClock = fixedClock(LATER);

function productFacts(): ProductFact[] {
  return [
    ProductFactSchema.parse({
      id: "fact_material",
      field: "material",
      value: "Recycled aluminum shell",
      kind: "specification",
      isClaim: true,
      source: {
        kind: "uploaded_reference",
        reference: "product-spec.pdf",
        locator: "page 2",
        capturedAt: NOW,
      },
    }),
    ProductFactSchema.parse({
      id: "fact_color",
      field: "color",
      value: "Graphite",
      kind: "identity",
      isClaim: false,
      source: null,
    }),
  ];
}

function personas(): Persona[] {
  return [
    {
      id: "persona_creator",
      name: "Lin",
      archetype: "Practical design reviewer",
      audienceFit: "Design-aware commuters",
      voiceTraits: ["observant", "plainspoken"],
      guardrails: ["Do not invent performance claims"],
    },
  ];
}

function intake(): Intake {
  return createIntake(
    {
      productName: "Orbit Bottle",
      category: "Drinkware",
      goal: "Show why the product fits a design-conscious daily routine.",
      audiences: ["Design-aware commuters"],
      platforms: ["xiaohongshu"],
      tones: ["observational"],
      constraints: ["Use only supplied product facts"],
      sourceAssetRefs: ["asset_product_front"],
      requestedOutputs: {
        images: 1,
        videos: 1,
      },
    },
    createSequenceIdFactory("intake"),
  );
}

function pendingBrief(): CreativeBrief {
  const facts = productFacts();
  const [persona] = personas();
  return createCreativeBrief(
    {
      campaignId: "campaign_demo",
      title: "Orbit launch brief",
      productFacts: facts,
      personas: [persona],
      hooks: [
        {
          name: "Routine reveal",
          angle: "Start inside a rushed morning routine.",
          opening: "The one object I stopped leaving by the door.",
          format: "day-in-the-life",
          claims: [],
          personaId: persona.id,
        },
        {
          name: "Material close-up",
          angle: "Let the surface detail create the first question.",
          opening: "This finish made me look twice.",
          format: "macro reveal",
          claims: [
            {
              text: "The shell uses recycled aluminum.",
              factId: facts[0].id,
            },
          ],
          personaId: persona.id,
        },
        {
          name: "Desk audit",
          angle: "Compare visual clutter before and after.",
          opening: "A tiny desk reset with one unexpected keeper.",
          format: "before-and-after",
          claims: [],
          personaId: persona.id,
        },
        {
          name: "Color story",
          angle: "Build the scene around the graphite palette.",
          opening: "Everything in my bag accidentally matches now.",
          format: "visual diary",
          claims: [],
          personaId: persona.id,
        },
        {
          name: "Friend question",
          angle: "Open on a natural question from off camera.",
          opening: "Wait, where did you find that bottle?",
          format: "casual dialogue",
          claims: [],
          personaId: persona.id,
        },
      ],
    },
    createSequenceIdFactory("brief"),
    clock,
  );
}

function approvedBrief(): CreativeBrief {
  const brief = pendingBrief();
  return approveCreativeBriefDecision(
    brief,
    brief.hookRoutes[0].id,
    brief.personaIds[0],
    clock,
  );
}

function executionPlan(seed = "plan"): ExecutionPlan {
  return createExecutionPlan(
    {
      campaignId: "campaign_demo",
      intake: intake(),
      productFacts: productFacts(),
      personas: personas(),
      brief: approvedBrief(),
    },
    createSequenceIdFactory(seed),
    clock,
  );
}

function generationInput(prompt = "Creator holds the graphite bottle."): GenerationInput {
  return {
    kind: "image",
    provider: "newapi",
    model: "image-model",
    prompt,
    aspectRatio: "4:5",
    durationSeconds: null,
    referenceArtifactIds: [],
    parameters: {
      quality: "high",
    },
  };
}

function submittedJob(seed = "job"): GenerationJob {
  const draft = createGenerationJob(
    {
      planId: "plan_demo",
      itemId: "item_image",
      input: generationInput(),
    },
    createSequenceIdFactory(seed),
    clock,
  );
  const approved = approveGenerationInput(draft, draft.revision, "director", clock);
  return submitGenerationJob(approved, approved.revision, clock);
}

describe("deterministic creative router", () => {
  it("routes one grounded ready action directly", () => {
    expect(
      routeCreativeWork({
        intent: "single_asset",
        deliverableCount: 1,
        stageCount: 1,
        groundedFactCount: 2,
        unresolvedDecisionCount: 0,
        hasApprovedBrief: true,
        requiresPaidMedia: false,
      }),
    ).toBe("direct");
  });

  it("routes incomplete exploration through guidance", () => {
    expect(
      routeCreativeWork({
        intent: "explore_hooks",
        deliverableCount: 1,
        stageCount: 1,
        groundedFactCount: 0,
        unresolvedDecisionCount: 2,
        hasApprovedBrief: false,
        requiresPaidMedia: false,
      }),
    ).toBe("guided");
  });

  it("routes paid or multi-output work to a durable plan", () => {
    const base = {
      intent: "single_asset" as const,
      deliverableCount: 1,
      stageCount: 1,
      groundedFactCount: 2,
      unresolvedDecisionCount: 0,
      hasApprovedBrief: true,
    };
    expect(
      routeCreativeWork({
        ...base,
        requiresPaidMedia: true,
      }),
    ).toBe("planned");
    expect(
      routeCreativeWork({
        ...base,
        deliverableCount: 2,
        requiresPaidMedia: false,
      }),
    ).toBe("planned");
  });
});

describe("grounded briefs", () => {
  it("blocks a product claim without source evidence", () => {
    expect(() =>
      ProductFactSchema.parse({
        id: "fact_unsourced",
        field: "efficacy",
        value: "Keeps drinks cold all day",
        kind: "efficacy",
        isClaim: true,
        source: null,
      }),
    ).toThrow(/must cite/i);
  });

  it("blocks hook claim copy that points at an unsourced identity fact", () => {
    const facts = productFacts();
    const [persona] = personas();
    expect(() =>
      createCreativeBrief(
        {
          campaignId: "campaign_demo",
          title: "Unsafe brief",
          productFacts: facts,
          personas: [persona],
          hooks: Array.from({ length: 5 }, (_, index) => ({
            name: `Route ${index + 1}`,
            angle: `Distinct angle ${index + 1}`,
            opening: `Distinct opening ${index + 1}`,
            format: "demonstration",
            claims:
              index === 0
                ? [
                    {
                      text: "The product is graphite.",
                      factId: "fact_color",
                    },
                  ]
                : [],
            personaId: persona.id,
          })),
        },
        createSequenceIdFactory("unsafe"),
        clock,
      ),
    ).toThrow(/unsourced/i);
  });

  it("requires five distinct independent hook routes", () => {
    const brief = pendingBrief();
    expect(brief.hookRoutes).toHaveLength(5);
    expect(new Set(brief.hookRoutes.map((hook) => hook.id))).toHaveLength(5);
    expect(new Set(brief.hookRoutes.map((hook) => hook.opening))).toHaveLength(5);
    expect(brief.hookRoutes[0].claims).not.toBe(brief.hookRoutes[1].claims);
    expect(brief.hookRoutes[0]).not.toBe(brief.hookRoutes[1]);
  });

  it("selects one hook without overwriting the other four", () => {
    const brief = pendingBrief();
    const snapshots = brief.hookRoutes.slice(1).map((hook) => ({
      id: hook.id,
      opening: hook.opening,
      angle: hook.angle,
    }));
    const approved = approveCreativeBriefDecision(
      brief,
      brief.hookRoutes[0].id,
      brief.personaIds[0],
      clock,
    );

    expect(
      approved.hookRoutes.slice(1).map((hook) => ({
        id: hook.id,
        opening: hook.opening,
        angle: hook.angle,
      })),
    ).toEqual(snapshots);
    expect(approved.hookRoutes.filter((hook) => hook.status === "selected")).toHaveLength(
      1,
    );
  });
});

describe("execution plan invariants", () => {
  it("creates stable plan, stage, and item IDs with an injected factory", () => {
    const first = executionPlan("stable");
    const second = executionPlan("stable");
    expect(second.id).toBe(first.id);
    expect(second.stages.map((stage) => stage.id)).toEqual(
      first.stages.map((stage) => stage.id),
    );
    expect(
      second.stages.flatMap((stage) => stage.items.map((item) => item.id)),
    ).toEqual(first.stages.flatMap((stage) => stage.items.map((item) => item.id)));
  });

  it("plans only the media kinds requested by intake", () => {
    const videoOnlyIntake = {
      ...intake(),
      requestedOutputs: {
        images: 0,
        videos: 2,
      },
    };
    const plan = createExecutionPlan(
      {
        campaignId: "campaign_demo",
        intake: videoOnlyIntake,
        productFacts: productFacts(),
        personas: personas(),
        brief: approvedBrief(),
      },
      createSequenceIdFactory("video_only"),
      clock,
    );
    const productionKinds = plan.stages[1].items.map(
      (item) => item.planner.kind,
    );
    expect(productionKinds).toEqual(["video"]);
    expect(plan.stages[1].items[0].planner.dependsOn).not.toContain(null);
  });

  it("rejects a stale compare-and-swap revision", () => {
    const plan = executionPlan();
    const approved = approveExecutionPlan(plan, 0, "director", clock);

    expect(() =>
      reviseExecutionPlanPlanner(approved, 0, { objective: "Stale edit" }, clock),
    ).toThrow(RevisionConflictError);
  });

  it("does not let planner updates overwrite runtime-owned fields", () => {
    const plan = executionPlan();
    const firstItem = plan.stages[0].items[0];

    expect(() =>
      reviseExecutionPlanPlanner(
        plan,
        plan.revision,
        {
          stagePatches: [
            {
              stageId: plan.stages[0].id,
              itemPatches: [
                {
                  itemId: firstItem.id,
                  runtime: {
                    status: "succeeded",
                    resultRefs: ["forged"],
                  },
                },
              ],
            },
          ],
        },
        clock,
      ),
    ).toThrow();
    expect(firstItem.runtime.status).toBe("ready");
  });

  it("invalidates exact-input approval after a planner input changes", () => {
    const plan = executionPlan();
    const approved = approveExecutionPlan(plan, plan.revision, "director", clock);
    expect(isExecutionPlanApprovalValid(approved)).toBe(true);

    const revised = reviseExecutionPlanPlanner(
      approved,
      approved.revision,
      { objective: "A materially different campaign goal." },
      laterClock,
    );
    expect(revised.planner.inputSignature).not.toBe(
      approved.planner.inputSignature,
    );
    expect(revised.runtime.approval).toBeNull();
    expect(revised.runtime.status).toBe("draft");
  });

  it("preserves approval for a no-op planner revision", () => {
    const plan = executionPlan();
    const approved = approveExecutionPlan(plan, plan.revision, "director", clock);
    const revised = reviseExecutionPlanPlanner(
      approved,
      approved.revision,
      {},
      laterClock,
    );
    expect(revised.runtime.approval).toEqual(approved.runtime.approval);
    expect(isExecutionPlanApprovalValid(revised)).toBe(true);
  });

  it("retries failed items only and preserves successful result references", () => {
    const plan = executionPlan();
    const successItem = plan.stages[0].items[0];
    const failedItem = plan.stages[0].items[1];
    const prepared: ExecutionPlan = {
      ...plan,
      stages: plan.stages.map((stage) => ({
        ...stage,
        items: stage.items.map((item) => {
          if (item.id === successItem.id) {
            return {
              ...item,
              runtime: {
                ...item.runtime,
                status: "succeeded",
                attempt: 1,
                resultRefs: ["artifact://anchor/success"],
                finishedAt: NOW,
              },
            };
          }
          if (item.id === failedItem.id) {
            return {
              ...item,
              runtime: {
                ...item.runtime,
                status: "failed",
                attempt: 1,
                error: "Temporary failure",
                finishedAt: NOW,
              },
            };
          }
          return item;
        }),
      })),
    };

    const retried = retryFailedPlanItems(prepared, prepared.revision, laterClock);
    const retriedSuccess = retried.stages
      .flatMap((stage) => stage.items)
      .find((item) => item.id === successItem.id);
    const retriedFailure = retried.stages
      .flatMap((stage) => stage.items)
      .find((item) => item.id === failedItem.id);

    expect(retriedSuccess?.runtime.status).toBe("succeeded");
    expect(retriedSuccess?.runtime.resultRefs).toEqual([
      "artifact://anchor/success",
    ]);
    expect(retriedSuccess?.runtime.attempt).toBe(1);
    expect(retriedFailure?.runtime.status).toBe("ready");
    expect(retriedFailure?.runtime.attempt).toBe(2);
    expect(retriedFailure?.runtime.error).toBeNull();
  });
});

describe("generation recovery state machine", () => {
  it("blocks provider submission before exact-input approval", () => {
    const draft = createGenerationJob(
      {
        planId: "plan_demo",
        itemId: "item_image",
        input: generationInput(),
      },
      createSequenceIdFactory("approval"),
      clock,
    );
    expect(() => submitGenerationJob(draft, draft.revision, clock)).toThrow(
      ApprovalRequiredError,
    );
  });

  it("invalidates approval when any exact generation input changes", () => {
    const draft = createGenerationJob(
      {
        planId: "plan_demo",
        itemId: "item_image",
        input: generationInput(),
      },
      createSequenceIdFactory("input"),
      clock,
    );
    const approved = approveGenerationInput(draft, draft.revision, "director", clock);
    const changed = changeGenerationInput(
      approved,
      approved.revision,
      generationInput("A different exact prompt."),
      laterClock,
    );

    expect(isGenerationApprovalValid(approved)).toBe(true);
    expect(changed.inputSignature).not.toBe(approved.inputSignature);
    expect(changed.approval).toBeNull();
    expect(() => submitGenerationJob(changed, changed.revision, clock)).toThrow(
      ApprovalRequiredError,
    );
  });

  it("separates provider success from candidate materialization", () => {
    const submitted = submittedJob("separate");
    const provider = recordProviderResult(
      submitted,
      submitted.revision,
      {
        providerRequestId: "provider_request_1",
        remoteUrl: "https://media.example/provider-result.png",
        mimeType: "image/png",
      },
      createSequenceIdFactory("candidate"),
      clock,
    );
    expect(provider.job.status).toBe("materialization_pending");
    expect(provider.candidate).toBeNull();

    const materialized = materializeGenerationResult(
      provider.job,
      provider.job.revision,
      {
        assetUrl: "https://cdn.example/candidate.png",
        mimeType: "image/png",
        width: 1024,
        height: 1280,
      },
      createSequenceIdFactory("materialized"),
      laterClock,
    );
    expect(materialized.job.status).toBe("candidate");
    expect(materialized.candidate.status).toBe("reviewable");
  });

  it("retries failed materialization without another paid submission", () => {
    const submitted = submittedJob("materialization");
    const provider = recordProviderResult(
      submitted,
      submitted.revision,
      {
        providerRequestId: "provider_request_2",
        remoteUrl: "https://media.example/provider-result.png",
        mimeType: "image/png",
      },
      createSequenceIdFactory("unused"),
      clock,
    ).job;
    const failed = recordMaterializationFailure(
      provider,
      provider.revision,
      "Object store timeout",
      clock,
    );
    const retried = retryGenerationJob(failed, failed.revision, laterClock);

    expect(retried.status).toBe("materialization_pending");
    expect(retried.attempts).toBe(submitted.attempts);
    expect(retried.providerResult).toEqual(provider.providerResult);
    expect(retried.idempotencyKey).toBe(submitted.idempotencyKey);
  });

  it("turns a provider result arriving after cancellation into a protected candidate", () => {
    const submitted = submittedJob("late");
    const cancelled = cancelGenerationJob(
      submitted,
      submitted.revision,
      "User changed direction",
      clock,
    );
    const late = recordProviderResult(
      cancelled,
      cancelled.revision,
      {
        providerRequestId: "provider_request_late",
        remoteUrl: "https://media.example/late.png",
        mimeType: "image/png",
      },
      createSequenceIdFactory("late"),
      laterClock,
    );

    expect(late.job.status).toBe("protected_late_result");
    expect(late.job.cancellation).toEqual(cancelled.cancellation);
    expect(late.candidate?.status).toBe("protected");
    expect(late.candidate?.protectedReason).toMatch(/cancellation/i);
  });

  it("creates an immutable provenance receipt on explicit candidate acceptance", () => {
    const submitted = submittedJob("accept");
    const provider = recordProviderResult(
      submitted,
      submitted.revision,
      {
        providerRequestId: "provider_request_accept",
        remoteUrl: "https://media.example/provider.png",
        mimeType: "image/png",
      },
      createSequenceIdFactory("unused"),
      clock,
    ).job;
    const materialized = materializeGenerationResult(
      provider,
      provider.revision,
      {
        assetUrl: "https://cdn.example/accepted.png",
        mimeType: "image/png",
      },
      createSequenceIdFactory("accepted_candidate"),
      clock,
    );
    const accepted = acceptArtifactCandidate(
      materialized.job,
      materialized.job.revision,
      materialized.candidate,
      "campaign_demo",
      createSequenceIdFactory("receipt"),
      laterClock,
    );

    expect(accepted.job.status).toBe("accepted");
    expect(accepted.candidate.status).toBe("accepted");
    expect(accepted.candidate.receiptId).toBe(accepted.receipt.id);
    expect(accepted.receipt.resultRef).toBe(materialized.candidate.assetUrl);
    expect(accepted.receipt.inputSignature).toBe(submitted.inputSignature);
  });
});

describe("versioned campaign portability", () => {
  it("round-trips a validated campaign export", () => {
    const createdIntake = intake();
    const campaign = createCampaign(
      {
        name: "Orbit launch",
        intake: createdIntake,
      },
      createSequenceIdFactory("campaign"),
      clock,
    );
    const exported = exportCampaign(campaign, laterClock);
    const imported = importCampaign(exported);

    expect(imported).toEqual(campaign);
    expect(JSON.parse(exported)).toMatchObject({
      format: "vixel-koc-campaign",
      version: 1,
      exportedAt: LATER,
    });
  });

  it("rejects an unsupported campaign export version", () => {
    const campaign = createCampaign(
      {
        name: "Orbit launch",
        intake: intake(),
      },
      createSequenceIdFactory("campaign"),
      clock,
    );
    const envelope = JSON.parse(exportCampaign(campaign, clock)) as Record<
      string,
      unknown
    >;
    envelope.version = 2;

    expect(() => importCampaign(envelope)).toThrow(CampaignImportError);
    expect(() => importCampaign(envelope)).toThrow(/unsupported/i);
  });

  it("rejects an export whose exact generation input was changed in transit", () => {
    const campaign = createCampaign(
      {
        name: "Orbit launch",
        intake: intake(),
      },
      () => "campaign_demo",
      clock,
    );
    const brief = approvedBrief();
    const plan = executionPlan("portable");
    const job = createGenerationJob(
      {
        planId: plan.id,
        itemId: plan.stages[1].items[0].id,
        input: generationInput(),
      },
      createSequenceIdFactory("portable_job"),
      clock,
    );
    const populated = {
      ...campaign,
      productFacts: productFacts(),
      personas: personas(),
      briefs: [brief],
      selectedBriefId: brief.id,
      plans: [plan],
      jobs: [job],
    };
    const envelope = JSON.parse(exportCampaign(populated, clock)) as {
      campaign: {
        jobs: Array<{
          input: { prompt: string };
        }>;
      };
    };
    envelope.campaign.jobs[0].input.prompt = "Tampered prompt";

    expect(() => importCampaign(envelope)).toThrow(/signature/i);
  });

  it("canonicalizes object key order for exact-input approval signatures", () => {
    expect(
      exactInputSignature({
        prompt: "same",
        nested: { b: 2, a: 1 },
      }),
    ).toBe(
      exactInputSignature({
        nested: { a: 1, b: 2 },
        prompt: "same",
      }),
    );
  });
});
