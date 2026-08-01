import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeBillingManagement: vi.fn(),
  createBillingPortalSession: vi.fn(),
}));

vi.mock("@/lib/server/accounts", () => ({
  authorizeBillingManagement: mocks.authorizeBillingManagement,
}));

vi.mock("@/lib/server/billing", () => ({
  BillingError: class MockBillingError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "BillingError";
    }
  },
  createBillingPortalSession: mocks.createBillingPortalSession,
}));

import { POST } from "./route";

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

describe("billing portal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeBillingManagement.mockResolvedValue({
      allowed: true,
      session: {},
      account: {
        userId: USER_ID,
        email: "creator@example.com",
        accountStatus: "suspended",
        appRole: "user",
      },
    });
    mocks.createBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/p/session/test_safe",
    });
  });

  it.each(["pending", "suspended"] as const)(
    "lets a verified %s subscriber open Stripe to cancel billing",
    async (accountStatus) => {
      mocks.authorizeBillingManagement.mockResolvedValueOnce({
        allowed: true,
        session: {},
        account: {
          userId: USER_ID,
          email: "creator@example.com",
          accountStatus,
          appRole: "user",
        },
      });
      const response = await POST(
        new Request("https://ugc.vixelai.com/api/billing/portal", {
          method: "POST",
          headers: {
            origin: "https://ugc.vixelai.com",
            "x-request-id": "request-suspended-portal",
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        requestId: "request-suspended-portal",
        url: "https://billing.stripe.com/p/session/test_safe",
      });
      expect(mocks.authorizeBillingManagement).toHaveBeenCalledTimes(1);
      expect(mocks.createBillingPortalSession).toHaveBeenCalledWith({
        userId: USER_ID,
      });
    },
  );
});
