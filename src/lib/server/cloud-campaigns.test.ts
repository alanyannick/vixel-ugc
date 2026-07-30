import { afterEach, describe, expect, it, vi } from "vitest";

import { withProductTransaction } from "./product-db";

vi.mock("./product-db", () => ({
  withProductTransaction: vi.fn(),
}));

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

function row(revision = 4, snapshot: unknown = { id: "campaign-safe" }) {
  return {
    campaign_key: "campaign-safe",
    title: "Safe campaign",
    snapshot,
    revision,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  };
}

describe("cloud campaign ownership and revisions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("scopes every list query to the immutable user ID", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()] });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { listCloudCampaigns } = await import("./cloud-campaigns");
    const campaigns = await listCloudCampaigns(USER_ID);
    expect(campaigns).toHaveLength(1);
    expect(String(query.mock.calls[0][0])).toContain("WHERE user_id = $1");
    expect(query.mock.calls[0][1]).toEqual([USER_ID]);
  });

  it("rejects a stale write without issuing an update", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [row(5)] });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { saveCloudCampaign, CloudCampaignError } = await import(
      "./cloud-campaigns"
    );
    await expect(
      saveCloudCampaign({
        userId: USER_ID,
        campaignKey: "campaign-safe",
        title: "Stale campaign",
        snapshot: { id: "campaign-safe", revision: 5 },
        revision: 5,
        expectedRevision: 4,
      }),
    ).rejects.toBeInstanceOf(CloudCampaignError);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("updates only the owned campaign at the expected revision", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row(4)] })
      .mockResolvedValueOnce({
        rows: [row(5, { id: "campaign-safe", revision: 5 })],
      });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { saveCloudCampaign } = await import("./cloud-campaigns");
    const saved = await saveCloudCampaign({
      userId: USER_ID,
      campaignKey: "campaign-safe",
      title: "Safe campaign",
      snapshot: { id: "campaign-safe", revision: 5 },
      revision: 5,
      expectedRevision: 4,
    });
    expect(saved.revision).toBe(5);
    const updateSql = String(query.mock.calls[1][0]);
    expect(updateSql).toContain("WHERE user_id = $1");
    expect(updateSql).toContain("AND campaign_key = $2");
    expect(updateSql).toContain("AND revision = $6");
  });
});
