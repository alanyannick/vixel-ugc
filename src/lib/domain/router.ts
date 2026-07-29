import { z } from "zod";

export const CreativeRouteSchema = z.enum(["direct", "guided", "planned"]);
export type CreativeRoute = z.infer<typeof CreativeRouteSchema>;

export const CreativeRouterInputSchema = z
  .object({
    intent: z.enum(["single_asset", "explore_hooks", "campaign"]),
    deliverableCount: z.number().int().min(1).max(200),
    stageCount: z.number().int().min(1).max(30),
    groundedFactCount: z.number().int().min(0).max(500),
    unresolvedDecisionCount: z.number().int().min(0).max(100),
    hasApprovedBrief: z.boolean(),
    requiresPaidMedia: z.boolean(),
  })
  .strict();

export type CreativeRouterInput = z.infer<typeof CreativeRouterInputSchema>;

export interface CreativeRouteDecision {
  route: CreativeRoute;
  reasons: string[];
  requiresDurablePlan: boolean;
}

export function explainCreativeRoute(
  unsafeInput: CreativeRouterInput,
): CreativeRouteDecision {
  const input = CreativeRouterInputSchema.parse(unsafeInput);
  const planReasons: string[] = [];

  if (input.intent === "campaign") {
    planReasons.push("campaign_scope");
  }
  if (input.deliverableCount > 1) {
    planReasons.push("multiple_deliverables");
  }
  if (input.stageCount > 1) {
    planReasons.push("multi_stage");
  }
  if (input.requiresPaidMedia) {
    planReasons.push("paid_media");
  }

  if (planReasons.length > 0) {
    return {
      route: "planned",
      reasons: planReasons,
      requiresDurablePlan: true,
    };
  }

  const guideReasons: string[] = [];
  if (input.groundedFactCount === 0) {
    guideReasons.push("missing_grounded_facts");
  }
  if (input.unresolvedDecisionCount > 0) {
    guideReasons.push("unresolved_decisions");
  }
  if (!input.hasApprovedBrief && input.intent === "explore_hooks") {
    guideReasons.push("brief_not_approved");
  }

  if (guideReasons.length > 0) {
    return {
      route: "guided",
      reasons: guideReasons,
      requiresDurablePlan: false,
    };
  }

  return {
    route: "direct",
    reasons: ["single_grounded_ready_action"],
    requiresDurablePlan: false,
  };
}

export function routeCreativeWork(input: CreativeRouterInput): CreativeRoute {
  return explainCreativeRoute(input).route;
}

