import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockBillingError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "BillingError";
    }
  }

  return {
    authorizeAccount: vi.fn(),
    createCheckoutSession: vi.fn(),
    BillingError: MockBillingError,
  };
});

vi.mock("@/lib/server/accounts", () => ({
  authorizeAccount: mocks.authorizeAccount,
}));

vi.mock("@/lib/server/billing", () => ({
  BillingError: mocks.BillingError,
  createCheckoutSession: mocks.createCheckoutSession,
}));

import { POST } from "./route";

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeAccount.mockResolvedValue({
    allowed: true,
    session: {},
    account: {
      userId: USER_ID,
      email: "creator@example.com",
      accountStatus: "approved",
      appRole: "user",
    },
  });
});

describe("billing checkout route", () => {
  it("returns a non-retryable conflict when the account already has a subscription", async () => {
    mocks.createCheckoutSession.mockRejectedValue(
      new mocks.BillingError("billing_subscription_exists"),
    );
    const response = await POST(
      new Request("https://ugc.vixelai.com/api/billing/checkout", {
        method: "POST",
        headers: {
          origin: "https://ugc.vixelai.com",
          "x-idempotency-key": "checkout-request-safe",
          "x-request-id": "request-existing-subscription",
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "billing_subscription_exists",
        message:
          "This account already has a subscription. Open billing to manage it.",
        retryable: false,
        requestId: "request-existing-subscription",
      },
    });
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith({
      userId: USER_ID,
      email: "creator@example.com",
      requestKey: "checkout-request-safe",
    });
  });
});
