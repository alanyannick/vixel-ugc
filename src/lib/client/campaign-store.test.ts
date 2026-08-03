import { beforeEach, describe, expect, it, vi } from "vitest";

const { delMock, getMock, setMock } = vi.hoisted(() => ({
  delMock: vi.fn(),
  getMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock("idb-keyval", () => ({
  del: delMock,
  get: getMock,
  set: setMock,
}));

import {
  demoCampaign,
  loadCampaign,
  newCampaign,
  nextReplacementRevision,
  parseCampaignExport,
  resetCampaign,
  saveCampaign,
} from "@/lib/client/campaign-store";

beforeEach(() => {
  delMock.mockReset();
  getMock.mockReset();
  setMock.mockReset();
});

function exportPayload(campaign: typeof demoCampaign) {
  return JSON.stringify({
    format: "vixel-koc-campaign",
    version: 1,
    exportedAt: "2026-07-30T00:00:00.000Z",
    campaign,
  });
}

describe("campaign JSON recovery", () => {
  it("round-trips a valid campaign including jobs and receipts", () => {
    const parsed = parseCampaignExport(exportPayload(demoCampaign));

    expect(parsed.id).toBe(demoCampaign.id);
    expect(parsed.brief?.hooks).toHaveLength(5);
    expect(parsed.brief?.personas).toHaveLength(3);
    expect(parsed.jobs).toEqual([]);
    expect(parsed.receipts[0]?.action).toBe("Candidate adopted");
    expect(parsed.briefProvider).toBe("demo");
    expect(parsed.input.skillId).toBe("product-review");
    expect(parsed.referenceLineage).toEqual({ product: null, creator: null });
  });

  it("loads a legacy campaign without Creative Brief provenance", () => {
    type LegacyCampaign = Omit<
      typeof demoCampaign,
      "briefProvider" | "referenceLineage" | "input"
    > & {
      briefProvider?: typeof demoCampaign.briefProvider;
      referenceLineage?: typeof demoCampaign.referenceLineage;
      input: Omit<typeof demoCampaign.input, "skillId"> & {
        skillId?: typeof demoCampaign.input.skillId;
      };
    };
    const legacyCampaign = structuredClone(demoCampaign) as LegacyCampaign;
    delete legacyCampaign.briefProvider;
    delete legacyCampaign.referenceLineage;
    delete legacyCampaign.input.skillId;
    const parsed = parseCampaignExport(
      JSON.stringify({
        format: "vixel-koc-campaign",
        version: 1,
        exportedAt: "2026-07-30T00:00:00.000Z",
        campaign: legacyCampaign,
      }),
    );

    expect(parsed.briefProvider).toBeNull();
    expect(parsed.input.skillId).toBe("product-review");
    expect(parsed.referenceLineage).toEqual({ product: null, creator: null });
  });

  it("rejects an unknown campaign skill instead of silently changing direction", () => {
    expect(() =>
      parseCampaignExport(
        exportPayload({
          ...demoCampaign,
          input: {
            ...demoCampaign.input,
            skillId: "auto-growth-agent" as typeof demoCampaign.input.skillId,
          },
        }),
      ),
    ).toThrow("not a valid Vixel UGC export");
  });

  it("preserves candidate reference lineage in campaign exports", () => {
    const parsed = parseCampaignExport(
      exportPayload({
        ...demoCampaign,
        referenceLineage: {
          product: {
            candidateId: "candidate-serum-01",
            role: "product",
            provider: "Vixel demo set",
            model: null,
            inputSignature: null,
            reusedAt: "2026-08-03T10:00:00.000Z",
          },
          creator: null,
        },
      }),
    );

    expect(parsed.referenceLineage.product?.candidateId).toBe(
      "candidate-serum-01",
    );
  });

  it("uses Veo's canonical 8-second default for new campaigns", () => {
    expect(newCampaign().input.durationSec).toBe(8);
    expect(demoCampaign.input.durationSec).toBe(8);
    expect(newCampaign().input.skillId).toBe("product-review");
  });

  it.each([4, 6, 8])(
    "accepts the canonical %i-second Veo duration",
    (durationSec) => {
      const parsed = parseCampaignExport(
        exportPayload({
          ...demoCampaign,
          input: {
            ...demoCampaign.input,
            durationSec,
          },
        }),
      );

      expect(parsed.input.durationSec).toBe(durationSec);
    },
  );

  it.each([3, 5, 7, 9, 12, 15, 30])(
    "rejects the non-canonical %i-second Veo duration",
    (durationSec) => {
      expect(() =>
        parseCampaignExport(
          exportPayload({
            ...demoCampaign,
            input: {
              ...demoCampaign.input,
              durationSec,
            },
          }),
        ),
      ).toThrow("not a valid Vixel UGC export");
    },
  );

  it("rejects a file with the wrong envelope", () => {
    expect(() =>
      parseCampaignExport(
        JSON.stringify({
          format: "another-product",
          version: 1,
          campaign: demoCampaign,
        }),
      ),
    ).toThrow("not a valid Vixel UGC export");
  });

  it("rejects a creative brief that no longer has five routes", () => {
    const broken = {
      ...demoCampaign,
      brief: demoCampaign.brief
        ? {
            ...demoCampaign.brief,
            hooks: demoCampaign.brief.hooks.slice(0, 4),
          }
        : null,
    };

    expect(() =>
      parseCampaignExport(
        JSON.stringify({
          format: "vixel-koc-campaign",
          version: 1,
          campaign: broken,
        }),
      ),
    ).toThrow("not a valid Vixel UGC export");
  });

  it("rejects malformed JSON without leaking parser details", () => {
    expect(() => parseCampaignExport("{not-json")).toThrow(
      "Choose a valid Vixel campaign JSON file",
    );
  });
});

describe("account-scoped browser recovery", () => {
  it("stores each account under a separate IndexedDB key", async () => {
    await saveCampaign(demoCampaign, "account-111");
    await resetCampaign("account-222");

    expect(setMock).toHaveBeenCalledWith(
      "vixel-koc:campaign:v2:account-111",
      demoCampaign,
    );
    expect(delMock).toHaveBeenCalledWith(
      "vixel-koc:campaign:v2:account-222",
    );
  });

  it("does not expose the shared legacy campaign to an account scope", async () => {
    getMock.mockImplementation(async (key: string) =>
      key === "vixel-koc:campaign:v1" ? demoCampaign : undefined,
    );

    await expect(loadCampaign("account-222")).resolves.toBeNull();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).not.toHaveBeenCalledWith("vixel-koc:campaign:v1");
  });

  it("migrates the shared legacy campaign only into operator recovery", async () => {
    getMock.mockImplementation(async (key: string) =>
      key === "vixel-koc:campaign:v1" ? demoCampaign : undefined,
    );

    const recovered = await loadCampaign("operator-recovery", {
      allowLegacyMigration: true,
    });

    expect(recovered?.id).toBe(demoCampaign.id);
    expect(setMock).toHaveBeenCalledWith(
      "vixel-koc:campaign:v2:operator-recovery",
      expect.objectContaining({ id: demoCampaign.id }),
    );
  });
});

describe("whole-campaign replacement revisions", () => {
  it("uses the known cloud revision when restoring an existing campaign id", () => {
    expect(nextReplacementRevision(2, 7)).toBe(8);
  });

  it("advances the imported revision for a campaign id not known in cloud", () => {
    expect(nextReplacementRevision(4, null)).toBe(5);
  });
});
