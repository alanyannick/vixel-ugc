import { z } from "zod";

export const DirectorViewSchema = z.enum([
  "board",
  "sources",
  "routes",
  "candidates",
  "receipts",
]);

const DirectorHookSchema = z.object({
  id: z.string().min(1).max(180),
  label: z.string().min(1).max(240),
  script: z.string().min(1).max(2_000),
  why: z.string().min(1).max(1_000),
});

const DirectorPersonaSchema = z.object({
  id: z.string().min(1).max(180),
  label: z.string().min(1).max(240),
  description: z.string().min(1).max(1_000),
  voice: z.string().min(1).max(600),
});

export const DirectorTurnRequestSchema = z.object({
  message: z.string().trim().min(2).max(1_000),
  campaign: z.object({
    id: z.string().min(1).max(180),
    revision: z.number().int().min(1),
    productName: z.string().min(1).max(160),
    facts: z.array(z.string().min(1).max(2_000)).min(1).max(24),
    audience: z.string().max(1_000),
    goal: z.string().max(1_000),
    platform: z.string().min(1).max(80),
    language: z.string().min(1).max(80),
    hooks: z.array(DirectorHookSchema).length(5),
    personas: z.array(DirectorPersonaSchema).length(3),
    selectedHookId: z.string().max(180).nullable(),
    selectedPersonaId: z.string().max(180).nullable(),
    hasAcceptedImage: z.boolean(),
    hasAcceptedVideo: z.boolean(),
  }),
});

export const DirectorRecommendationSchema = z.object({
  hookId: z.string().min(1).max(180),
  personaId: z.string().min(1).max(180),
  rationale: z.string().min(1).max(800),
});

export const DirectorNextViewSchema = z.object({
  view: DirectorViewSchema,
  reason: z.string().min(1).max(500),
});

export const DirectorTurnResponseSchema = z.object({
  provider: z.literal("live"),
  message: z.string().min(1).max(2_000),
  recommendation: DirectorRecommendationSchema.nullable(),
  nextView: DirectorNextViewSchema.nullable(),
  campaignRevision: z.number().int().min(1),
  requestId: z.string().min(1).max(180),
});

export type DirectorTurnRequest = z.infer<typeof DirectorTurnRequestSchema>;
export type DirectorTurnResponse = z.infer<typeof DirectorTurnResponseSchema>;
export type DirectorRecommendation = z.infer<
  typeof DirectorRecommendationSchema
>;
