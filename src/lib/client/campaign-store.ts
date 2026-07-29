"use client";

import { del, get, set } from "idb-keyval";
import { z } from "zod";

import {
  ExecutionPlanSchema,
  type ExecutionPlan,
} from "@/lib/domain/contracts";

const CAMPAIGN_KEY = "vixel-koc:campaign:v1";

export type Platform = "TikTok" | "Instagram Reels" | "YouTube Shorts" | "小红书";

export type CampaignInput = {
  productName: string;
  category: string;
  facts: string[];
  audience: string;
  platform: Platform;
  goal: string;
  language: string;
  durationSec: number;
  format: string;
  creatorDescription?: string;
  productImageDataUrl?: string;
  creatorImageDataUrl?: string;
};

export type CreativeHook = {
  id: string;
  label: string;
  script: string;
  why: string;
  claims?: Array<{
    text: string;
    factId: string;
  }>;
};

export type CreatorPersona = {
  id: string;
  label: string;
  description: string;
  voice: string;
};

export type CreativeBrief = {
  summary: string;
  productTruth: string[];
  hooks: CreativeHook[];
  personas: CreatorPersona[];
  recommendedHookId: string;
  recommendedPersonaId: string;
  guardrails: string[];
  shotDirection?: string;
};

export type Candidate = {
  id: string;
  kind: "image" | "video";
  url: string;
  label: string;
  prompt: string;
  createdAt: string;
  provider: string;
  status: "candidate" | "adopted" | "protected";
  ledgerEntryId?: string;
  providerTaskId?: string;
  inputSignature?: string;
  model?: string;
};

export type GenerationJob = {
  id: string;
  kind: "video";
  status: "queued" | "processing" | "succeeded" | "failed";
  prompt: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  progress: number | null;
  url: string | null;
  error: string | null;
  ledgerEntryId?: string;
  idempotencyKey?: string;
  inputSignature?: string;
  model?: string;
};

export type CampaignState = {
  id: string;
  revision: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  input: CampaignInput;
  brief: CreativeBrief | null;
  selectedHookId: string | null;
  selectedPersonaId: string | null;
  executionPlan: ExecutionPlan | null;
  jobs: GenerationJob[];
  candidates: Candidate[];
  receipts: Array<{
    id: string;
    action: string;
    at: string;
    detail: string;
  }>;
};

const CampaignStateSchema: z.ZodType<CampaignState> = z.object({
  id: z.string().min(1).max(180),
  revision: z.number().int().min(1),
  name: z.string().min(1).max(240),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  input: z.object({
    productName: z.string().max(160),
    category: z.string().max(160),
    facts: z.array(z.string().max(2_000)).max(24),
    audience: z.string().max(1_000),
    platform: z.enum([
      "TikTok",
      "Instagram Reels",
      "YouTube Shorts",
      "小红书",
    ]),
    goal: z.string().max(1_000),
    language: z.string().max(80),
    durationSec: z.number().int().min(3).max(180),
    format: z.string().max(160),
    creatorDescription: z.string().max(1_000).optional(),
    productImageDataUrl: z
      .string()
      .max(3_000_000)
      .startsWith("data:image/")
      .optional(),
    creatorImageDataUrl: z
      .string()
      .max(3_000_000)
      .startsWith("data:image/")
      .optional(),
  }),
  brief: z
    .object({
      summary: z.string().min(1).max(2_000),
      productTruth: z.array(z.string().max(2_000)).max(24),
      hooks: z
        .array(
          z.object({
            id: z.string().min(1).max(180),
            label: z.string().min(1).max(240),
            script: z.string().min(1).max(2_000),
            why: z.string().min(1).max(1_000),
            claims: z
              .array(
                z.object({
                  text: z.string().min(1).max(500),
                  factId: z.string().min(3).max(160),
                }),
              )
              .max(12)
              .optional(),
          }),
        )
        .length(5),
      personas: z
        .array(
          z.object({
            id: z.string().min(1).max(180),
            label: z.string().min(1).max(240),
            description: z.string().min(1).max(1_000),
            voice: z.string().min(1).max(600),
          }),
        )
        .length(3),
      recommendedHookId: z.string().min(1).max(180),
      recommendedPersonaId: z.string().min(1).max(180),
      guardrails: z.array(z.string().max(1_000)).max(20),
      shotDirection: z.string().max(2_000).optional(),
    })
    .nullable(),
  selectedHookId: z.string().max(180).nullable(),
  selectedPersonaId: z.string().max(180).nullable(),
  executionPlan: ExecutionPlanSchema.nullable().default(null),
  jobs: z.array(
    z.object({
      id: z.string().min(1).max(180),
      kind: z.literal("video"),
      status: z.enum(["queued", "processing", "succeeded", "failed"]),
      prompt: z.string().max(12_000),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      provider: z.string().min(1).max(160),
      progress: z.number().min(0).max(100).nullable(),
      url: z.string().max(32_000).nullable(),
      error: z.string().max(2_000).nullable(),
      ledgerEntryId: z.string().uuid().optional(),
      idempotencyKey: z.string().min(8).max(128).optional(),
      inputSignature: z.string().min(8).max(160).optional(),
      model: z.string().min(1).max(240).optional(),
    }),
  ),
  candidates: z.array(
    z.object({
      id: z.string().min(1).max(180),
      kind: z.enum(["image", "video"]),
      url: z.string().min(1).max(32_000_000),
      label: z.string().min(1).max(240),
      prompt: z.string().max(12_000),
      createdAt: z.string().datetime(),
      provider: z.string().min(1).max(160),
      status: z.enum(["candidate", "adopted", "protected"]),
      ledgerEntryId: z.string().uuid().optional(),
      providerTaskId: z.string().max(180).optional(),
      inputSignature: z.string().min(8).max(160).optional(),
      model: z.string().min(1).max(240).optional(),
    }),
  ),
  receipts: z.array(
    z.object({
      id: z.string().min(1).max(180),
      action: z.string().min(1).max(240),
      at: z.string().datetime(),
      detail: z.string().min(1).max(2_000),
    }),
  ),
});

const demoBrief: CreativeBrief = {
  summary:
    "A quiet, evidence-first skincare demo: one creator shows the serum texture, applies two drops, and names only the visible product facts.",
  productTruth: [
    "Lightweight gel-serum texture",
    "Fragrance-free formula",
    "30 ml recyclable glass bottle",
  ],
  hooks: [
    {
      id: "hook-texture",
      label: "The texture check",
      script:
        "If sticky serums make you quit after day one, look at this lightweight gel-serum texture.",
      why: "Starts with a recognizable friction and proves the answer on camera.",
      claims: [
        {
          text: "Lightweight gel-serum texture",
          factId: "fact-1",
        },
      ],
    },
    {
      id: "hook-desk",
      label: "Desk-drawer reset",
      script:
        "The lightweight gel-serum texture is why this stays in my desk drawer.",
      why: "Places the product in a believable daily context without inventing efficacy.",
      claims: [
        {
          text: "Lightweight gel-serum texture",
          factId: "fact-1",
        },
      ],
    },
    {
      id: "hook-two-drops",
      label: "Two-drop routine",
      script:
        "Two drops, a fragrance-free formula, and I can get on with my morning.",
      why: "Specific product action gives the first seconds a useful visual beat.",
      claims: [{ text: "Fragrance-free formula", factId: "fact-2" }],
    },
    {
      id: "hook-label",
      label: "Read the label",
      script:
        "The 30 ml recyclable glass bottle is the first detail I checked.",
      why: "Turns product packaging into the proof instead of making a broad claim.",
      claims: [
        {
          text: "30 ml recyclable glass bottle",
          factId: "fact-3",
        },
      ],
    },
    {
      id: "hook-finish",
      label: "No-filter finish",
      script:
        "No filter—this is the lightweight gel-serum texture in daylight.",
      why: "Uses a native creator convention while keeping the claim observable.",
      claims: [
        {
          text: "Lightweight gel-serum texture",
          factId: "fact-1",
        },
      ],
    },
  ],
  personas: [
    {
      id: "persona-editor",
      label: "The precise editor",
      description: "Calm 28–35 creator filming a considered bathroom-shelf review.",
      voice: "Measured, specific, no hype.",
    },
    {
      id: "persona-founder",
      label: "The candid founder",
      description: "Product-literate founder explaining why the formula stayed simple.",
      voice: "Direct, warm, quietly confident.",
    },
    {
      id: "persona-routine",
      label: "The routine realist",
      description: "Busy professional filming a daylight get-ready-with-me.",
      voice: "Conversational, quick, lightly self-aware.",
    },
  ],
  recommendedHookId: "hook-texture",
  recommendedPersonaId: "persona-editor",
  guardrails: [
    "Do not claim clinical outcomes without a supplied source.",
    "Keep the bottle label readable and the texture physically plausible.",
    "Use one continuous clip for the 12-second production unless continuity fails.",
  ],
  shotDirection:
    "Handheld front camera, window light, product enters frame before second two, macro texture insert only if it can remain one continuous take.",
};

export const demoCampaign: CampaignState = {
  id: "campaign-demo-serum",
  revision: 4,
  name: "Dewdrop serum · launch routes",
  createdAt: "2026-07-30T02:12:00.000Z",
  updatedAt: "2026-07-30T03:06:00.000Z",
  input: {
    productName: "Dewdrop Barrier Serum",
    category: "Skincare",
    facts: [
      "Lightweight gel-serum texture",
      "Fragrance-free formula",
      "30 ml recyclable glass bottle",
    ],
    audience: "Ingredient-aware professionals with a short morning routine",
    platform: "TikTok",
    goal: "Earn qualified product-page visits",
    language: "English",
    durationSec: 12,
    format: "9:16 creator demo",
    creatorDescription: "Natural daylight, 28–35, precise and low-key delivery",
  },
  brief: demoBrief,
  selectedHookId: "hook-texture",
  selectedPersonaId: "persona-editor",
  executionPlan: null,
  jobs: [],
  candidates: [
    {
      id: "candidate-serum-01",
      kind: "image",
      url: "/media/koc-serum-creator.webp",
      label: "Creator + product anchor",
      prompt: "Natural daylight creator holding the Dewdrop serum near a bathroom mirror.",
      createdAt: "2026-07-30T02:54:00.000Z",
      provider: "Vixel demo set",
      status: "adopted",
    },
    {
      id: "candidate-serum-02",
      kind: "image",
      url: "/media/koc-earbuds-unboxing.webp",
      label: "Hands-first framing reference",
      prompt: "Hands-first creator framing with a clear, readable product action.",
      createdAt: "2026-07-30T02:58:00.000Z",
      provider: "Vixel demo set",
      status: "candidate",
    },
  ],
  receipts: [
    {
      id: "receipt-04",
      action: "Candidate adopted",
      at: "2026-07-30T03:06:00.000Z",
      detail: "Creator + product anchor became the accepted visual source.",
    },
    {
      id: "receipt-03",
      action: "Persona selected",
      at: "2026-07-30T02:47:00.000Z",
      detail: "The precise editor",
    },
    {
      id: "receipt-02",
      action: "Hook selected",
      at: "2026-07-30T02:45:00.000Z",
      detail: "The texture check",
    },
  ],
};

export async function loadCampaign(): Promise<CampaignState> {
  const stored = await get<CampaignState & { executionPlan?: ExecutionPlan | null }>(
    CAMPAIGN_KEY,
  );
  return stored
    ? {
        ...stored,
        executionPlan: stored.executionPlan ?? null,
        jobs: stored.jobs ?? [],
      }
    : demoCampaign;
}

export async function saveCampaign(campaign: CampaignState): Promise<void> {
  await set(CAMPAIGN_KEY, campaign);
}

export async function resetCampaign(): Promise<void> {
  await del(CAMPAIGN_KEY);
}

export function parseCampaignExport(raw: string): CampaignState {
  if (raw.length > 32 * 1024 * 1024) {
    throw new Error("The campaign export is larger than 32 MB.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("Choose a valid Vixel campaign JSON file.");
  }
  const envelope = z
    .object({
      format: z.literal("vixel-koc-campaign"),
      version: z.literal(1),
      campaign: CampaignStateSchema,
    })
    .safeParse(decoded);
  if (!envelope.success) {
    throw new Error("This file is not a valid Vixel KOC campaign export.");
  }
  return envelope.data.campaign;
}

export function newCampaign(): CampaignState {
  const now = new Date().toISOString();
  return {
    id: `campaign-${crypto.randomUUID()}`,
    revision: 1,
    name: "Untitled KOC campaign",
    createdAt: now,
    updatedAt: now,
    input: {
      productName: "",
      category: "",
      facts: [""],
      audience: "",
      platform: "TikTok",
      goal: "",
      language: "English",
      durationSec: 15,
      format: "9:16 creator demo",
    },
    brief: null,
    selectedHookId: null,
    selectedPersonaId: null,
    executionPlan: null,
    jobs: [],
    candidates: [],
    receipts: [],
  };
}
