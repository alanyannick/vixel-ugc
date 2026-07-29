import { z } from "zod";

import {
  type Campaign,
  CampaignExportEnvelopeSchema,
  CampaignSchema,
  type Clock,
  type IdFactory,
  type Intake,
  IntakeSchema,
  defaultIdFactory,
  systemClock,
} from "./contracts";
import { computePlanInputSignature } from "./planning";
import { exactInputSignature } from "./signature";

export const CreateCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    intake: IntakeSchema,
  })
  .strict();

export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export const CreateIntakeInputSchema = IntakeSchema.omit({ id: true });
export type CreateIntakeInput = z.infer<typeof CreateIntakeInputSchema>;

export class CampaignImportError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "CampaignImportError";
    this.cause = cause;
  }
}

function assertCampaignInputSignatures(campaign: Campaign): void {
  for (const plan of campaign.plans) {
    if (computePlanInputSignature(plan) !== plan.planner.inputSignature) {
      throw new CampaignImportError(
        `Plan ${plan.id} has an invalid exact-input signature.`,
      );
    }
  }
  for (const job of campaign.jobs) {
    if (exactInputSignature(job.input) !== job.inputSignature) {
      throw new CampaignImportError(
        `Generation job ${job.id} has an invalid exact-input signature.`,
      );
    }
  }
}

export function createIntake(
  unsafeInput: CreateIntakeInput,
  idFactory: IdFactory = defaultIdFactory,
): Intake {
  return IntakeSchema.parse({
    ...CreateIntakeInputSchema.parse(unsafeInput),
    id: idFactory("intake"),
  });
}

export function createCampaign(
  unsafeInput: CreateCampaignInput,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = systemClock,
): Campaign {
  const input = CreateCampaignInputSchema.parse(unsafeInput);
  const now = clock();
  return CampaignSchema.parse({
    schemaVersion: 1,
    id: idFactory("campaign"),
    revision: 0,
    name: input.name,
    status: "draft",
    intake: input.intake,
    productFacts: [],
    personas: [],
    briefs: [],
    selectedBriefId: null,
    plans: [],
    jobs: [],
    candidates: [],
    receipts: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function exportCampaign(
  unsafeCampaign: Campaign,
  clock: Clock = systemClock,
): string {
  const campaign = CampaignSchema.parse(unsafeCampaign);
  assertCampaignInputSignatures(campaign);
  const envelope = CampaignExportEnvelopeSchema.parse({
    format: "vixel-koc-campaign",
    version: 1,
    exportedAt: clock(),
    campaign,
  });
  return JSON.stringify(envelope, null, 2);
}

export function importCampaign(payload: string | unknown): Campaign {
  let parsed: unknown;
  try {
    parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch (error) {
    throw new CampaignImportError("Campaign export is not valid JSON.", error);
  }

  try {
    const campaign = CampaignExportEnvelopeSchema.parse(parsed).campaign;
    assertCampaignInputSignatures(campaign);
    return campaign;
  } catch (error) {
    if (error instanceof CampaignImportError) {
      throw error;
    }
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "version" in parsed &&
      (parsed as { version?: unknown }).version !== 1
    ) {
      throw new CampaignImportError(
        `Unsupported campaign export version ${String(
          (parsed as { version?: unknown }).version,
        )}.`,
        error,
      );
    }
    throw new CampaignImportError(
      "Campaign export failed schema or reference validation.",
      error,
    );
  }
}
