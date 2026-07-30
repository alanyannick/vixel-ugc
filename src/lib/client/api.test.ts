import { afterEach, describe, expect, it, vi } from "vitest";

import { createCreativeBrief } from "./api";
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
