import { z } from "zod";

import {
  CreativeBriefSchema,
  type Clock,
  type CreativeBrief,
  type IdFactory,
  type Persona,
  PersonaSchema,
  type ProductFact,
  ProductFactSchema,
  defaultIdFactory,
  systemClock,
} from "./contracts";

const HookDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    angle: z.string().trim().min(1).max(300),
    opening: z.string().trim().min(1).max(500),
    format: z.string().trim().min(1).max(160),
    claims: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(500),
            factId: z.string().min(3).max(160),
          })
          .strict(),
      )
      .max(12),
    personaId: z.string().min(3).max(160).nullable(),
  })
  .strict();

export const CreateCreativeBriefInputSchema = z
  .object({
    campaignId: z.string().min(3).max(160),
    title: z.string().trim().min(1).max(200),
    productFacts: z.array(ProductFactSchema).min(1),
    personas: z.array(PersonaSchema).min(1).max(12),
    hooks: z.array(HookDraftSchema).length(5),
  })
  .strict();

export type CreateCreativeBriefInput = z.infer<
  typeof CreateCreativeBriefInputSchema
>;

function assertHookReferences(
  hooks: CreateCreativeBriefInput["hooks"],
  facts: ProductFact[],
  personas: Persona[],
): void {
  const factIds = new Set(facts.map((fact) => fact.id));
  const personaIds = new Set(personas.map((persona) => persona.id));

  for (const hook of hooks) {
    for (const claim of hook.claims) {
      if (!factIds.has(claim.factId)) {
        throw new GroundingError(
          `Hook claim "${claim.text}" references unknown fact ${claim.factId}.`,
        );
      }
      const fact = facts.find((candidate) => candidate.id === claim.factId);
      if (fact?.source === null) {
        throw new GroundingError(
          `Hook claim "${claim.text}" references an unsourced product claim.`,
        );
      }
    }
    if (hook.personaId !== null && !personaIds.has(hook.personaId)) {
      throw new GroundingError(
        `Hook "${hook.name}" references unknown persona ${hook.personaId}.`,
      );
    }
  }
}

export class GroundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroundingError";
  }
}

export function assertGroundedClaim(
  claim: { text: string; factId: string },
  facts: ProductFact[],
): ProductFact {
  const fact = facts.find((candidate) => candidate.id === claim.factId);
  if (!fact) {
    throw new GroundingError(
      `Claim "${claim.text}" references unknown fact ${claim.factId}.`,
    );
  }
  if (fact.source === null) {
    throw new GroundingError(
      `Claim "${claim.text}" is blocked because its fact has no source.`,
    );
  }
  return fact;
}

export function createCreativeBrief(
  unsafeInput: CreateCreativeBriefInput,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = systemClock,
): CreativeBrief {
  const input = CreateCreativeBriefInputSchema.parse(unsafeInput);
  assertHookReferences(input.hooks, input.productFacts, input.personas);
  const now = clock();

  return CreativeBriefSchema.parse({
    id: idFactory("brief"),
    campaignId: input.campaignId,
    title: input.title,
    productFactIds: input.productFacts.map((fact) => fact.id),
    personaIds: input.personas.map((persona) => persona.id),
    hookRoutes: input.hooks.map((hook) => ({
      id: idFactory("hook"),
      name: hook.name,
      angle: hook.angle,
      opening: hook.opening,
      format: hook.format,
      claims: hook.claims.map((claim) => ({ ...claim })),
      personaId: hook.personaId,
      status: "draft" as const,
    })),
    selectedHookRouteId: null,
    selectedPersonaId: null,
    decision: {
      status: "pending",
      decidedAt: null,
    },
    createdAt: now,
    updatedAt: now,
  });
}

export function approveCreativeBriefDecision(
  unsafeBrief: CreativeBrief,
  hookRouteId: string,
  personaId: string,
  clock: Clock = systemClock,
): CreativeBrief {
  const brief = CreativeBriefSchema.parse(unsafeBrief);
  if (!brief.hookRoutes.some((hook) => hook.id === hookRouteId)) {
    throw new RangeError(`Unknown hook route ${hookRouteId}.`);
  }
  if (!brief.personaIds.includes(personaId)) {
    throw new RangeError(`Unknown persona ${personaId}.`);
  }
  const now = clock();

  return CreativeBriefSchema.parse({
    ...brief,
    hookRoutes: brief.hookRoutes.map((hook) => ({
      ...hook,
      claims: hook.claims.map((claim) => ({ ...claim })),
      status: hook.id === hookRouteId ? "selected" : "rejected",
    })),
    selectedHookRouteId: hookRouteId,
    selectedPersonaId: personaId,
    decision: {
      status: "approved",
      decidedAt: now,
    },
    updatedAt: now,
  });
}
