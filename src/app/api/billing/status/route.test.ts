import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeBillingManagement: vi.fn(),
  getBillingState: vi.fn(),
  getServerRuntimeConfig: vi.fn(),
}));

vi.mock("@/lib/server/accounts", () => ({
  authorizeBillingManagement: mocks.authorizeBillingManagement,
}));

vi.mock("@/lib/server/billing", () => ({
  getBillingState: mocks.getBillingState,
}));

vi.mock("@/lib/server/env", () => ({
  getServerRuntimeConfig: mocks.getServerRuntimeConfig,
}));

import { GET } from "./route";

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

describe("billing status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerRuntimeConfig.mockReturnValue({
      product: {
        stripe: { configured: true },
        features: {
          billing: { enabled: true, ready: true },
        },
      },
    });
    mocks.getBillingState.mockResolvedValue({
      status: "active",
      customerConfigured: true,
      subscriptionConfigured: true,
      priceId: "price_safe",
      currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      entitled: true,
    });
  });

  it.each(["pending", "suspended"] as const)(
    "lets a verified %s subscriber read billing state",
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

      const response = await GET(
        new Request("https://ugc.vixelai.com/api/billing/status", {
          headers: { "x-request-id": `request-status-${accountStatus}` },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        enabled: true,
        ready: true,
        state: {
          status: "active",
          subscriptionConfigured: true,
          entitled: true,
        },
      });
      expect(mocks.getBillingState).toHaveBeenCalledWith(USER_ID);
    },
  );

  it("keeps cancellation management available when new billing is disabled", async () => {
    mocks.authorizeBillingManagement.mockResolvedValueOnce({
      allowed: true,
      session: {},
      account: {
        userId: USER_ID,
        email: "creator@example.com",
        accountStatus: "suspended",
        appRole: "user",
      },
    });
    mocks.getServerRuntimeConfig.mockReturnValueOnce({
      product: {
        stripe: { configured: true },
        features: {
          billing: { enabled: false, ready: false },
        },
      },
    });

    const response = await GET(
      new Request("https://ugc.vixelai.com/api/billing/status"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      enabled: true,
      ready: true,
      state: { status: "active", subscriptionConfigured: true },
    });
  });
});
