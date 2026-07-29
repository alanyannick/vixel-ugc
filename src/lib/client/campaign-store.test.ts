import { describe, expect, it } from "vitest";

import {
  demoCampaign,
  parseCampaignExport,
} from "@/lib/client/campaign-store";

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
  });

  it("rejects a file with the wrong envelope", () => {
    expect(() =>
      parseCampaignExport(
        JSON.stringify({
          format: "another-product",
          version: 1,
          campaign: demoCampaign,
        }),
      ),
    ).toThrow("not a valid Vixel KOC campaign export");
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
    ).toThrow("not a valid Vixel KOC campaign export");
  });

  it("rejects malformed JSON without leaking parser details", () => {
    expect(() => parseCampaignExport("{not-json")).toThrow(
      "Choose a valid Vixel campaign JSON file",
    );
  });
});

