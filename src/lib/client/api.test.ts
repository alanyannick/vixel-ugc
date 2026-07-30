import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCreativeBrief,
  createImageCandidate,
  pollVideoCandidate,
  StudioApiError,
  submitVideoCandidate,
  type MediaLedgerJob,
} from "./api";
import type { CampaignInput } from "./campaign-store";

const input: CampaignInput = {
  productName: "Pulse Mini Blender",
  category: "Kitchen appliance",
  facts: ["Includes two 450 ml cups"],
  audience: "Morning commuters",
  platform: "TikTok",
  goal: "Drive qualified product-page visits",
  language: "English",
  durationSec: 8,
  format: "9:16 creator demo",
  creatorDescription: "Natural kitchen light",
  productImageDataUrl: "data:image/png;base64,cHJvZHVjdA==",
  creatorImageDataUrl: "data:image/png;base64,Y3JlYXRvcg==",
};

function ledgerJob(
  overrides: Partial<MediaLedgerJob> = {},
): MediaLedgerJob {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "video",
    status: "submitting",
    provider: "newapi",
    model: "veo-3.1-fast-generate-preview",
    inputSignature: "a".repeat(64),
    idempotencyKey: "video:test:duplicate",
    taskId: null,
    hasResult: false,
    error: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:01.000Z",
    ...overrides,
  };
}

describe("creative brief client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps reference image bytes in the browser during route planning", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          brief: {},
          provider: "fallback",
          requestId: "req-test",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await createCreativeBrief(input);

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe("/api/creative/brief");
    const body = JSON.parse(String(request?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body.productImageDataUrl).toBeUndefined();
    expect(body.creatorImageDataUrl).toBeUndefined();
    expect(body.productImageAttached).toBe(true);
    expect(body.creatorImageAttached).toBe(true);
  });
});

describe("paid media replay client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recovers a duplicate in-progress image claim without reading a null result", async () => {
    const pending = ledgerJob({
      kind: "image",
      idempotencyKey: "image:test:duplicate",
    });
    const succeeded = ledgerJob({
      ...pending,
      status: "succeeded",
      hasResult: true,
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            replayed: true,
            job: pending,
            submission: {
              state: "in_progress",
              entryId: pending.id,
              status: pending.status,
              taskId: null,
              providerRetryAllowed: false,
            },
            result: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job: succeeded,
            result: { url: "https://cdn.example.test/recovered.png" },
          }),
          { status: 200 },
        ),
      );

    await expect(
      createImageCandidate({
        prompt: "A creator product frame.",
        aspectRatio: "9:16",
        idempotencyKey: pending.idempotencyKey,
        approvalToken: "signed-approval",
      }),
    ).resolves.toMatchObject({
      url: "https://cdn.example.test/recovered.png",
      job: { status: "succeeded" },
    });
  });

  it("turns a duplicate in-progress video claim into a controlled pending error", async () => {
    const pending = ledgerJob();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          replayed: true,
          job: pending,
          submission: {
            state: "in_progress",
            entryId: pending.id,
            status: pending.status,
            taskId: null,
            providerRetryAllowed: false,
          },
          result: null,
        }),
        { status: 202 },
      ),
    );

    const error = await submitVideoCandidate({
      prompt: "A creator product demo.",
      imageDataUrl: "data:image/png;base64,aGVsbG8=",
      durationSec: 4,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: true,
      idempotencyKey: pending.idempotencyKey,
      approvalToken: "signed-approval",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StudioApiError);
    expect(error).toMatchObject({
      code: "VIDEO_SUBMISSION_PENDING",
      retryable: true,
    });
  });

  it("turns a cancelled terminal poll with no result into a controlled error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          replayed: true,
          job: ledgerJob({
            status: "cancelled",
            taskId: "task_cancelled_123",
          }),
          result: null,
        }),
        { status: 200 },
      ),
    );

    const error = await pollVideoCandidate("task_cancelled_123").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(StudioApiError);
    expect(error).toMatchObject({
      code: "VIDEO_JOB_CANCELLED",
      retryable: false,
    });
  });

  it("preserves a failed video replay as failure rather than reconciliation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          replayed: true,
          job: ledgerJob({
            status: "failed",
            error: {
              code: "provider_rejected",
              message: "The provider rejected the input.",
            },
          }),
          submission: {
            state: "terminal",
            entryId: "11111111-1111-4111-8111-111111111111",
            status: "failed",
            taskId: null,
            providerRetryAllowed: false,
          },
          result: null,
        }),
        { status: 200 },
      ),
    );

    const error = await submitVideoCandidate({
      prompt: "A creator product demo.",
      imageDataUrl: "data:image/png;base64,aGVsbG8=",
      durationSec: 4,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: true,
      idempotencyKey: "video:failed-replay",
      approvalToken: "signed-approval",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StudioApiError);
    expect(error).toMatchObject({
      code: "provider_rejected",
      message: "The provider rejected the input.",
      retryable: false,
    });
  });

  it("preserves a failed image replay error instead of reporting a missing result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          replayed: true,
          job: ledgerJob({
            kind: "image",
            status: "failed",
            error: {
              code: "image_policy_rejected",
              message: "The image request was rejected.",
            },
          }),
          submission: {
            state: "terminal",
            entryId: "11111111-1111-4111-8111-111111111111",
            status: "failed",
            taskId: null,
            providerRetryAllowed: false,
          },
          result: null,
        }),
        { status: 200 },
      ),
    );

    const error = await createImageCandidate({
      prompt: "A creator product frame.",
      aspectRatio: "9:16",
      idempotencyKey: "image:failed-replay",
      approvalToken: "signed-approval",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StudioApiError);
    expect(error).toMatchObject({
      code: "image_policy_rejected",
      message: "The image request was rejected.",
      retryable: false,
    });
  });

  it("preserves a failed terminal poll as a non-retryable job failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          replayed: true,
          job: ledgerJob({
            status: "failed",
            taskId: "task_failed_123",
            error: {
              code: "provider_failed",
              message: "The provider marked the job as failed.",
            },
          }),
          result: null,
        }),
        { status: 200 },
      ),
    );

    const error = await pollVideoCandidate("task_failed_123").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(StudioApiError);
    expect(error).toMatchObject({
      code: "provider_failed",
      retryable: false,
    });
  });
});
