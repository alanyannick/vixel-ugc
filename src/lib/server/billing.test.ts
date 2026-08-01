import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeAccount } from "./accounts";
import {
  installStripeClientForTests,
  BillingError,
} from "./billing";
import { productQuery, withProductTransaction } from "./product-db";

vi.mock("./accounts", () => ({
  authorizeAccount: vi.fn(),
}));

vi.mock("./product-db", () => ({
  productQuery: vi.fn(),
  withProductTransaction: vi.fn(),
}));

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

function activeRow(
  status: "active" | "trialing" | "past_due" = "active",
  overrides: Record<string, unknown> = {},
) {
  const now = Date.now();
  return {
    user_id: USER_ID,
    stripe_customer_id: "cus_safe",
    stripe_subscription_id: "sub_safe",
    stripe_price_id: "price_safe",
    status,
    current_period_end: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancel_at_period_end: false,
    last_provider_event_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function enableBillingEnvironment() {
  vi.stubEnv("ENABLE_ACCOUNT_AUTH", "true");
  vi.stubEnv("ENABLE_BILLING", "true");
  vi.stubEnv("DATABASE_APP_URL", "postgres://runtime.test/vixel");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ugc.vixelai.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_safe");
  vi.stubEnv("STRIPE_PRICE_UGC_BETA", "price_safe");
}

describe("subscription billing", () => {
  afterEach(() => {
    installStripeClientForTests(null);
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("fails closed before Checkout when the recurring price is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ugc.vixelai.com");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
    const { createCheckoutSession } = await import("./billing");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-safe",
      }),
    ).rejects.toMatchObject({
      code: "billing_price_not_configured",
    } satisfies Partial<BillingError>);
    expect(withProductTransaction).not.toHaveBeenCalled();
  });

  it("keeps Checkout disabled until the billing release switch is on", async () => {
    enableBillingEnvironment();
    vi.stubEnv("ENABLE_BILLING", "false");
    const { createCheckoutSession } = await import("./billing");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-safe",
      }),
    ).rejects.toMatchObject({
      code: "billing_not_configured",
    } satisfies Partial<BillingError>);
    expect(withProductTransaction).not.toHaveBeenCalled();
  });

  it("rejects a configured Stripe price whose commercial terms drift", async () => {
    enableBillingEnvironment();
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      type: "recurring",
      unit_amount: 2_900,
      currency: "usd",
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
    });
    installStripeClientForTests({
      prices: { retrieve },
    } as never);
    const { createCheckoutSession } = await import("./billing");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-safe",
      }),
    ).rejects.toMatchObject({
      code: "billing_price_invalid",
    } satisfies Partial<BillingError>);
    expect(retrieve).toHaveBeenCalledWith("price_safe");
    expect(withProductTransaction).not.toHaveBeenCalled();
  });

  it("creates Checkout only for the verified $39 monthly licensed price", async () => {
    enableBillingEnvironment();
    const checkoutCreate = vi.fn().mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_test_safe",
    });
    installStripeClientForTests({
      prices: {
        retrieve: vi.fn().mockResolvedValue({
          active: true,
          type: "recurring",
          unit_amount: 3_900,
          currency: "usd",
          recurring: {
            interval: "month",
            interval_count: 1,
            usage_type: "licensed",
          },
        }),
      },
      checkout: { sessions: { create: checkoutCreate } },
    } as never);
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) =>
        operation({
          query: vi.fn().mockResolvedValue({
            rows: [{ stripe_customer_id: "cus_safe" }],
          }),
        } as never),
    );
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [
        {
          ...activeRow(),
          stripe_subscription_id: null,
          status: "checkout_pending",
        },
      ],
    } as never);

    const { createCheckoutSession } = await import("./billing");
    const result = await createCheckoutSession({
      userId: USER_ID,
      email: "creator@example.com",
      requestKey: "request-safe",
    });

    expect(result.url).toContain("checkout.stripe.com");
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_safe",
        line_items: [{ price: "price_safe", quantity: 1 }],
      }),
      expect.objectContaining({
        idempotencyKey: `vixel-ugc/checkout/${USER_ID}/request-safe`,
      }),
    );
    const pendingProjectionSql = String(
      vi.mocked(productQuery).mock.calls[0]?.[0],
    );
    expect(pendingProjectionSql).not.toContain("stripe_price_id =");
    expect(vi.mocked(productQuery).mock.calls[0]?.[1]).toEqual([USER_ID]);
  });

  it("treats a repeated Stripe event as a replay-safe no-op", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_repeat",
        type: "customer.subscription.updated",
        created: 1785456000,
      } as never,
      rawBody: '{"id":"evt_repeat"}',
    });
    expect(result).toEqual({ replayed: true, projected: false });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain(
      "ON CONFLICT (provider, provider_event_id) DO NOTHING",
    );
  });

  it("projects active subscription state only when the provider event is current", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_active",
        type: "customer.subscription.updated",
        created: 1785456000,
        data: {
          object: {
            id: "sub_safe",
            customer: "cus_safe",
            status: "active",
            metadata: { vixel_user_id: USER_ID },
            items: {
              data: [
                {
                  price: { id: "price_safe" },
                  current_period_end: 1788134400,
                },
              ],
            },
            cancel_at_period_end: false,
          },
        },
      } as never,
      rawBody: '{"id":"evt_active"}',
    });
    expect(result).toEqual({ replayed: false, projected: true });
    const projectionSql = String(query.mock.calls[1][0]);
    expect(projectionSql).toContain("last_provider_event_at <= $8");
    expect(projectionSql).toContain("stripe_price_id = $4");
    expect(projectionSql).not.toContain("COALESCE($4, stripe_price_id)");
    expect(query.mock.calls[1][1]?.[4]).toBe("active");
  });

  it("does not treat Checkout completion as a fresh entitlement projection", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_checkout",
        type: "checkout.session.completed",
        created: 1785456000,
        data: {
          object: {
            customer: "cus_safe",
            subscription: "sub_safe",
            client_reference_id: USER_ID,
            metadata: { vixel_user_id: USER_ID },
          },
        },
      } as never,
      rawBody: '{"id":"evt_checkout"}',
    });

    expect(result).toEqual({ replayed: false, projected: true });
    const projectionSql = String(query.mock.calls[1][0]);
    expect(projectionSql).not.toContain("last_provider_event_at");
    expect(projectionSql).not.toContain("status =");
    expect(query.mock.calls[1][1]).toEqual([
      USER_ID,
      "cus_safe",
      "sub_safe",
    ]);
  });

  it("rejects a forged Stripe signature before database projection", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_safe");
    const { constructStripeEvent } = await import("./billing");
    await expect(
      constructStripeEvent('{"id":"evt_forged"}', "t=1,v1=forged"),
    ).rejects.toMatchObject({
      code: "billing_event_invalid",
    } satisfies Partial<BillingError>);
    expect(withProductTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["active", null],
    ["trialing", null],
    ["past_due", 402],
  ] as const)(
    "allows paid generation only for an entitled %s subscription",
    async (status, expectedStatus) => {
      enableBillingEnvironment();
      vi.mocked(authorizeAccount).mockResolvedValueOnce({
        allowed: true,
        session: {} as never,
        account: {
          userId: USER_ID,
          email: "creator@example.com",
        } as never,
      });
      vi.mocked(productQuery).mockResolvedValueOnce({
        rows: [activeRow(status)],
      } as never);
      const { requirePaidGenerationAccess } = await import("./billing");
      const response = await requirePaidGenerationAccess(
        new Request("https://ugc.vixelai.com/api/media/image"),
        "request-entitlement",
      );
      expect(response?.status ?? null).toBe(expectedStatus);
    },
  );

  it.each([
    ["a different Stripe price", { stripe_price_id: "price_legacy" }],
    [
      "an expired billing period",
      { current_period_end: new Date(Date.now() - 1_000).toISOString() },
    ],
    ["a missing billing period", { current_period_end: null }],
    [
      "a stale provider projection",
      {
        last_provider_event_at: new Date(
          Date.now() - 46 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    ],
    ["a missing provider projection", { last_provider_event_at: null }],
    [
      "a provider projection too far in the future",
      {
        last_provider_event_at: new Date(
          Date.now() + 6 * 60 * 1000,
        ).toISOString(),
      },
    ],
    ["a missing Stripe subscription", { stripe_subscription_id: null }],
  ])("rejects paid generation for %s", async (_reason, overrides) => {
    enableBillingEnvironment();
    vi.mocked(authorizeAccount).mockResolvedValueOnce({
      allowed: true,
      session: {} as never,
      account: {
        userId: USER_ID,
        email: "creator@example.com",
      } as never,
    });
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [activeRow("active", overrides)],
    } as never);

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/image"),
      "request-invalid-entitlement",
    );

    expect(response?.status).toBe(402);
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: "subscription_required",
        retryable: false,
      },
    });
  });

  it("returns a retryable 503 when account authorization cannot be queried", async () => {
    enableBillingEnvironment();
    vi.mocked(authorizeAccount).mockRejectedValueOnce(
      new Error("account database unavailable"),
    );

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/image"),
      "request-account-query-failed",
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: "entitlement_check_unavailable",
        retryable: true,
      },
    });
    expect(productQuery).not.toHaveBeenCalled();
  });

  it("returns a retryable 503 when the subscription projection cannot be queried", async () => {
    enableBillingEnvironment();
    vi.mocked(authorizeAccount).mockResolvedValueOnce({
      allowed: true,
      session: {} as never,
      account: {
        userId: USER_ID,
        email: "creator@example.com",
      } as never,
    });
    vi.mocked(productQuery).mockRejectedValueOnce(
      new Error("subscription database unavailable"),
    );

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/video"),
      "request-subscription-query-failed",
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: "entitlement_check_unavailable",
        retryable: true,
      },
    });
  });

  it("fails closed when account authorization is disabled", async () => {
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("ENABLE_ACCOUNT_AUTH", "false");

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/image"),
      "request-account-auth-disabled",
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: "account_auth_not_ready",
      },
    });
    expect(authorizeAccount).not.toHaveBeenCalled();
  });

  it("fails closed when billing is disabled", async () => {
    enableBillingEnvironment();
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("ENABLE_BILLING", "false");
    vi.mocked(authorizeAccount).mockResolvedValueOnce({
      allowed: true,
      session: {} as never,
      account: {
        userId: USER_ID,
        email: "creator@example.com",
      } as never,
    });

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/video"),
      "request-billing-disabled",
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: "billing_not_ready",
      },
    });
    expect(productQuery).not.toHaveBeenCalled();
  });

  it("fails closed when the current product price is not configured", async () => {
    enableBillingEnvironment();
    vi.stubEnv("STRIPE_PRICE_UGC_BETA", "");
    vi.mocked(authorizeAccount).mockResolvedValueOnce({
      allowed: true,
      session: {} as never,
      account: {
        userId: USER_ID,
        email: "creator@example.com",
      } as never,
    });

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/video"),
      "request-price-missing",
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: "billing_not_ready",
      },
    });
    expect(productQuery).not.toHaveBeenCalled();
  });
});
