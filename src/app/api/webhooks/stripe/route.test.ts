import { beforeEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => {
  class MockBillingError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "BillingError";
    }
  }

  return {
    BillingError: MockBillingError,
    constructStripeEvent: vi.fn(),
    projectStripeEvent: vi.fn(),
  };
});

vi.mock("@/lib/server/billing", () => billingMocks);

import { POST } from "./route";

describe("Stripe webhook route", () => {
  beforeEach(() => {
    billingMocks.constructStripeEvent.mockReset();
    billingMocks.projectStripeEvent.mockReset();
  });

  it("returns retryable 503 when provider Price verification is unavailable", async () => {
    billingMocks.constructStripeEvent.mockResolvedValueOnce({
      id: "evt_price_retry",
    });
    billingMocks.projectStripeEvent.mockRejectedValueOnce(
      new billingMocks.BillingError("billing_price_invalid"),
    );

    const response = await POST(
      new Request("https://ugc.vixelai.com/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=safe" },
        body: '{"id":"evt_price_retry"}',
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "stripe_webhook_unavailable",
        retryable: true,
      },
    });
  });
});
