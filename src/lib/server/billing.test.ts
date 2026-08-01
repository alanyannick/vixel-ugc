import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeAccount } from "./accounts";
import { installStripeClientForTests, BillingError } from "./billing";
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
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "turnstile_site_safe");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret_safe");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_safe");
  vi.stubEnv("STRIPE_PRICE_UGC_BETA", "price_safe");
}

function verifiedStripePrice(overrides: Record<string, unknown> = {}) {
  return {
    id: "price_safe",
    active: true,
    livemode: false,
    type: "recurring",
    unit_amount: 3_900,
    currency: "usd",
    metadata: { product: "vixel-ugc" },
    product: {
      id: "prod_safe",
      active: true,
      livemode: false,
      metadata: { product: "vixel-ugc" },
    },
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
    ...overrides,
  };
}

function verifiedStripePriceInMode(livemode: boolean) {
  return verifiedStripePrice({
    livemode,
    product: {
      id: "prod_safe",
      active: true,
      livemode,
      metadata: { product: "vixel-ugc" },
    },
  });
}

function installVerifiedWebhookPrice(
  price: ReturnType<typeof verifiedStripePrice> = verifiedStripePrice(),
) {
  const priceRetrieve = vi.fn().mockResolvedValue(price);
  installStripeClientForTests({
    prices: { retrieve: priceRetrieve },
  } as never);
  return priceRetrieve;
}

function openCheckoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_safe",
    status: "open",
    mode: "subscription",
    url: "https://checkout.stripe.com/c/pay/cs_test_safe",
    expires_at: Math.floor(Date.now() / 1000) + 1_800,
    customer: "cus_safe",
    client_reference_id: USER_ID,
    metadata: {
      product: "vixel-ugc",
      vixel_user_id: USER_ID,
      price_id: "price_safe",
    },
    line_items: {
      data: [
        {
          price: { id: "price_safe" },
          quantity: 1,
        },
      ],
    },
    ...overrides,
  };
}

type TestSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

function stripeSubscription(
  status: TestSubscriptionStatus,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "sub_safe",
    customer: "cus_safe",
    status,
    metadata: {
      product: "vixel-ugc",
      vixel_user_id: USER_ID,
    },
    items: {
      data: [
        {
          price: { id: "price_safe" },
          quantity: 1,
          current_period_end: 1788134400,
        },
      ],
    },
    cancel_at_period_end: status === "canceled",
    ...overrides,
  };
}

function subscriptionEvent(input: {
  id: string;
  type:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted";
  status: TestSubscriptionStatus;
  created: number;
}) {
  return {
    id: input.id,
    type: input.type,
    created: input.created,
    livemode: false,
    data: { object: stripeSubscription(input.status) },
  } as never;
}

function installWebhookProjectionStore(
  canonicalSubscription: ReturnType<typeof stripeSubscription>,
) {
  const state: {
    subscriptionId: string | null;
    priceId: string | null;
    lastProviderEventAt: Date | null;
    status: string | null;
  } = {
    subscriptionId: null,
    priceId: null,
    lastProviderEventAt: null,
    status: null,
  };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("provider_webhook_events")) {
      return { rows: [{ id: "recorded" }], rowCount: 1 };
    }
    if (
      sql.includes("WHERE stripe_customer_id = $1") &&
      sql.includes("stripe_subscription_id = $2")
    ) {
      if (state.subscriptionId !== values?.[1]) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [
          {
            user_id: USER_ID,
            stripe_subscription_id: state.subscriptionId,
            last_provider_event_at: state.lastProviderEventAt,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("FOR UPDATE")) {
      return {
        rows: [
          {
            user_id: USER_ID,
            stripe_subscription_id: state.subscriptionId,
            last_provider_event_at: state.lastProviderEventAt,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE vixel_ugc.subscriptions")) {
      state.subscriptionId = values?.[2] as string;
      if (sql.includes("stripe_price_id = NULL")) {
        state.priceId = null;
        state.status = values?.[3] as string;
        state.lastProviderEventAt = values?.[6] as Date;
      } else {
        state.priceId = values?.[3] as string;
        state.status = values?.[4] as string;
        state.lastProviderEventAt = values?.[7] as Date;
      }
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const retrieve = vi.fn().mockResolvedValue(canonicalSubscription);
  const priceRetrieve = vi.fn().mockResolvedValue(verifiedStripePrice());
  installStripeClientForTests({
    prices: { retrieve: priceRetrieve },
    subscriptions: { retrieve },
  } as never);
  vi.mocked(withProductTransaction).mockImplementation(async (operation) =>
    operation({ query } as never),
  );
  return { priceRetrieve, query, retrieve, state };
}

async function entitlementFromProjection(state: {
  priceId: string | null;
  status: string | null;
}) {
  vi.mocked(productQuery).mockResolvedValueOnce({
    rows: [
      {
        ...activeRow(),
        stripe_price_id: state.priceId,
        status: state.status ?? "none",
      },
    ],
  } as never);
  const { getBillingState } = await import("./billing");
  return getBillingState(USER_ID);
}

describe("subscription billing", () => {
  afterEach(() => {
    installStripeClientForTests(null);
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ["price_safe", true],
    ["price_legacy", false],
  ] as const)(
    "reports active entitlement only for the configured price (%s)",
    async (rowPriceId, entitled) => {
      enableBillingEnvironment();
      vi.mocked(productQuery).mockResolvedValueOnce({
        rows: [
          {
            ...activeRow(),
            stripe_price_id: rowPriceId,
          },
        ],
      } as never);

      const { getBillingState } = await import("./billing");
      await expect(getBillingState(USER_ID)).resolves.toMatchObject({
        status: "active",
        priceId: rowPriceId,
        entitled,
      });
    },
  );

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

  it.each([
    ["Vercel Production", "production", "sk_test_safe"],
    ["Vercel Preview", "preview", "sk_live_safe"],
  ] as const)(
    "rejects a mismatched Stripe key in %s",
    async (_label, vercelEnvironment, secretKey) => {
      enableBillingEnvironment();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", vercelEnvironment);
      vi.stubEnv("STRIPE_SECRET_KEY", secretKey);

      const { createCheckoutSession } = await import("./billing");
      await expect(
        createCheckoutSession({
          userId: USER_ID,
          email: "creator@example.com",
          requestKey: `request-${vercelEnvironment}-key`,
        }),
      ).rejects.toMatchObject({
        code: "billing_not_configured",
      } satisfies Partial<BillingError>);
      expect(withProductTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Vercel Production", "production", "sk_live_safe", false],
    ["Vercel Preview", "preview", "sk_test_safe", true],
  ] as const)(
    "rejects a Stripe Price from the other mode in %s",
    async (_label, vercelEnvironment, secretKey, priceLiveMode) => {
      enableBillingEnvironment();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", vercelEnvironment);
      vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
      const retrieve = vi
        .fn()
        .mockResolvedValue(verifiedStripePriceInMode(priceLiveMode));
      installStripeClientForTests({ prices: { retrieve } } as never);

      const { createCheckoutSession } = await import("./billing");
      await expect(
        createCheckoutSession({
          userId: USER_ID,
          email: "creator@example.com",
          requestKey: `request-${vercelEnvironment}-price`,
        }),
      ).rejects.toMatchObject({
        code: "billing_price_invalid",
      } satisfies Partial<BillingError>);
      expect(withProductTransaction).not.toHaveBeenCalled();
    },
  );

  it("keeps a non-Vercel local production build in Stripe test mode", async () => {
    enableBillingEnvironment();
    vi.stubEnv("NODE_ENV", "production");
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "recorded" }],
      rowCount: 1,
    });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );

    const { projectStripeEvent } = await import("./billing");
    await expect(
      projectStripeEvent({
        event: {
          id: "evt_local_production_test",
          livemode: false,
          type: "invoice.created",
          created: 1785456000,
          data: { object: {} },
        } as never,
        rawBody: '{"id":"evt_local_production_test"}',
      }),
    ).resolves.toEqual({ replayed: false, projected: false });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects a configured Stripe price whose commercial terms drift", async () => {
    enableBillingEnvironment();
    const retrieve = vi
      .fn()
      .mockResolvedValue(verifiedStripePrice({ unit_amount: 2_900 }));
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
    expect(retrieve).toHaveBeenCalledWith("price_safe", {
      expand: ["product"],
    });
    expect(withProductTransaction).not.toHaveBeenCalled();
  });

  it("rejects a price that is not bound to the Vixel UGC product", async () => {
    enableBillingEnvironment();
    const retrieve = vi.fn().mockResolvedValue(
      verifiedStripePrice({
        metadata: { product: "another-product" },
      }),
    );
    installStripeClientForTests({ prices: { retrieve } } as never);

    const { createCheckoutSession } = await import("./billing");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-product-mismatch",
      }),
    ).rejects.toMatchObject({
      code: "billing_price_invalid",
    } satisfies Partial<BillingError>);
    expect(withProductTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["Vercel Preview test mode", "preview", "sk_test_safe", false],
    ["Vercel Production live mode", "production", "sk_live_safe", true],
  ] as const)(
    "creates Checkout for the verified $39 price in %s",
    async (_label, vercelEnvironment, secretKey, priceLiveMode) => {
      enableBillingEnvironment();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", vercelEnvironment);
      vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
      const checkoutCreate = vi.fn().mockResolvedValue({
        url: "https://checkout.stripe.com/c/pay/cs_test_safe",
      });
      const checkoutList = vi.fn().mockResolvedValue({ data: [] });
      installStripeClientForTests({
        prices: {
          retrieve: vi
            .fn()
            .mockResolvedValue(verifiedStripePriceInMode(priceLiveMode)),
        },
        checkout: {
          sessions: { create: checkoutCreate, list: checkoutList },
        },
        subscriptions: {
          list: vi.fn().mockResolvedValue({ data: [] }),
        },
      } as never);
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              stripe_customer_id: "cus_safe",
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              ...activeRow(),
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        });
      vi.mocked(withProductTransaction).mockImplementationOnce(
        async (operation) => operation({ query } as never),
      );

      const { createCheckoutSession } = await import("./billing");
      const requestKey = `request-${vercelEnvironment}`;
      const result = await createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey,
      });

      expect(result.url).toContain("checkout.stripe.com");
      expect(checkoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "subscription",
          customer: "cus_safe",
          line_items: [{ price: "price_safe", quantity: 1 }],
        }),
        expect.objectContaining({
          idempotencyKey: `vixel-ugc/checkout/${USER_ID}/${requestKey}`,
        }),
      );
      expect(checkoutList).toHaveBeenCalledWith({
        customer: "cus_safe",
        limit: 100,
        expand: ["data.line_items"],
      });
      expect(String(query.mock.calls[0][0])).toContain("pg_advisory_xact_lock");
      expect(String(query.mock.calls[1][0])).toContain("FOR UPDATE");
      expect(checkoutCreate.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          expires_at: expect.any(Number),
        }),
      );
      const pendingProjectionSql = String(query.mock.calls[2][0]);
      expect(pendingProjectionSql).toContain("stripe_subscription_id = NULL");
      expect(pendingProjectionSql).toContain("stripe_price_id = NULL");
      expect(pendingProjectionSql).not.toContain("stripe_price_id = $2");
      expect(query.mock.calls[2][1]).toEqual([USER_ID]);
    },
  );

  it("reuses one open Checkout across different requests while checkout is pending", async () => {
    enableBillingEnvironment();
    const createdSession = openCheckoutSession();
    const checkoutCreate = vi.fn().mockResolvedValue(createdSession);
    const checkoutList = vi
      .fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [createdSession] });
    installStripeClientForTests({
      prices: {
        retrieve: vi.fn().mockResolvedValue(verifiedStripePrice()),
      },
      checkout: {
        sessions: { create: checkoutCreate, list: checkoutList },
      },
      subscriptions: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as never);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT stripe_customer_id")) {
        return {
          rows: [
            {
              stripe_customer_id: "cus_safe",
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE vixel_ugc.subscriptions")) {
        return {
          rows: [
            {
              ...activeRow(),
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    vi.mocked(withProductTransaction).mockImplementation(async (operation) =>
      operation({ query } as never),
    );

    const { createCheckoutSession } = await import("./billing");
    const first = await createCheckoutSession({
      userId: USER_ID,
      email: "creator@example.com",
      requestKey: "request-first",
    });
    const second = await createCheckoutSession({
      userId: USER_ID,
      email: "creator@example.com",
      requestKey: "request-second",
    });

    expect(first.url).toBe(createdSession.url);
    expect(second.url).toBe(createdSession.url);
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
    expect(checkoutList).toHaveBeenCalledTimes(2);
  });

  it("recovers the provider Checkout when the local transaction outcome is ambiguous", async () => {
    enableBillingEnvironment();
    const createdSession = openCheckoutSession();
    const checkoutCreate = vi.fn().mockResolvedValue(createdSession);
    const checkoutList = vi
      .fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [createdSession] });
    installStripeClientForTests({
      prices: {
        retrieve: vi.fn().mockResolvedValue(verifiedStripePrice()),
      },
      checkout: {
        sessions: { create: checkoutCreate, list: checkoutList },
      },
      subscriptions: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as never);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT stripe_customer_id")) {
        return {
          rows: [
            {
              stripe_customer_id: "cus_safe",
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE vixel_ugc.subscriptions")) {
        return {
          rows: [
            {
              ...activeRow(),
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    vi.mocked(withProductTransaction)
      .mockImplementationOnce(async (operation) => {
        await operation({ query } as never);
        throw new Error("commit outcome unknown");
      })
      .mockImplementationOnce(async (operation) =>
        operation({ query } as never),
      );

    const { createCheckoutSession } = await import("./billing");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-ambiguous-first",
      }),
    ).rejects.toThrow("commit outcome unknown");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-ambiguous-retry",
      }),
    ).resolves.toMatchObject({ url: createdSession.url });
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it("blocks a second Checkout when a completed session is ahead of the webhook projection", async () => {
    enableBillingEnvironment();
    const checkoutCreate = vi.fn();
    const retrieve = vi
      .fn()
      .mockResolvedValue(stripeSubscription("active", { id: "sub_recent" }));
    installStripeClientForTests({
      prices: {
        retrieve: vi.fn().mockResolvedValue(verifiedStripePrice()),
      },
      checkout: {
        sessions: {
          create: checkoutCreate,
          list: vi.fn().mockResolvedValue({
            data: [
              openCheckoutSession({
                status: "complete",
                subscription: "sub_recent",
              }),
            ],
          }),
        },
      },
      subscriptions: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        retrieve,
      },
    } as never);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            stripe_customer_id: "cus_safe",
            stripe_subscription_id: null,
            status: "checkout_pending",
          },
        ],
        rowCount: 1,
      });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );

    const { createCheckoutSession } = await import("./billing");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-after-completion",
      }),
    ).rejects.toMatchObject({
      code: "billing_subscription_exists",
    } satisfies Partial<BillingError>);
    expect(retrieve).toHaveBeenCalledWith("sub_recent");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("creates a recoverable new Checkout after the provider session expires", async () => {
    enableBillingEnvironment();
    const checkoutCreate = vi
      .fn()
      .mockResolvedValue(openCheckoutSession({ id: "cs_test_recovered" }));
    installStripeClientForTests({
      prices: {
        retrieve: vi.fn().mockResolvedValue(verifiedStripePrice()),
      },
      checkout: {
        sessions: {
          create: checkoutCreate,
          list: vi.fn().mockResolvedValue({
            data: [
              openCheckoutSession({
                expires_at: Math.floor(Date.now() / 1000) - 1,
              }),
            ],
          }),
        },
      },
      subscriptions: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as never);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT stripe_customer_id")) {
        return {
          rows: [
            {
              stripe_customer_id: "cus_safe",
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE vixel_ugc.subscriptions")) {
        return {
          rows: [
            {
              ...activeRow(),
              stripe_subscription_id: null,
              status: "checkout_pending",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );

    const { createCheckoutSession } = await import("./billing");
    await expect(
      createCheckoutSession({
        userId: USER_ID,
        email: "creator@example.com",
        requestKey: "request-recovered",
      }),
    ).resolves.toMatchObject({
      url: "https://checkout.stripe.com/c/pay/cs_test_safe",
    });
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it.each(["active", "trialing", "past_due"] as const)(
    "blocks duplicate Checkout for an existing %s subscription",
    async (status) => {
      enableBillingEnvironment();
      const checkoutCreate = vi.fn();
      const customerCreate = vi.fn();
      installStripeClientForTests({
        prices: {
          retrieve: vi.fn().mockResolvedValue(verifiedStripePrice()),
        },
        customers: { create: customerCreate },
        checkout: {
          sessions: {
            create: checkoutCreate,
            list: vi.fn().mockResolvedValue({ data: [] }),
          },
        },
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            data: [stripeSubscription(status)],
          }),
        },
      } as never);
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              stripe_customer_id: "cus_safe",
              stripe_subscription_id:
                status === "active" || status === "trialing"
                  ? null
                  : "sub_safe",
              status,
            },
          ],
          rowCount: 1,
        });
      vi.mocked(withProductTransaction).mockImplementationOnce(
        async (operation) => operation({ query } as never),
      );

      const { createCheckoutSession } = await import("./billing");
      await expect(
        createCheckoutSession({
          userId: USER_ID,
          email: "creator@example.com",
          requestKey: `request-existing-${status}`,
        }),
      ).rejects.toMatchObject({
        code: "billing_subscription_exists",
      } satisfies Partial<BillingError>);
      expect(checkoutCreate).not.toHaveBeenCalled();
      expect(customerCreate).not.toHaveBeenCalled();
    },
  );

  it("treats a repeated Stripe event as a replay-safe no-op", async () => {
    enableBillingEnvironment();
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_repeat",
        livemode: false,
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

  it("revokes a bound cancellation even when price configuration is missing", async () => {
    enableBillingEnvironment();
    vi.stubEnv("STRIPE_PRICE_UGC_BETA", "");
    const event = subscriptionEvent({
      id: "evt_cancel_retry_after_config",
      type: "customer.subscription.deleted",
      status: "canceled",
      created: 1785456000,
    });
    const rawBody = JSON.stringify(event);
    const { projectStripeEvent } = await import("./billing");
    let recorded = false;
    let projectedStatus: string | null = null;
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("provider_webhook_events")) {
        if (recorded) return { rows: [], rowCount: 0 };
        recorded = true;
        return { rows: [{ id: "recorded" }], rowCount: 1 };
      }
      if (sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              user_id: USER_ID,
              stripe_subscription_id: "sub_safe",
              last_provider_event_at: "2026-07-30T00:00:00.000Z",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE vixel_ugc.subscriptions")) {
        projectedStatus = values?.[3] as string;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    vi.mocked(withProductTransaction).mockImplementation(async (operation) =>
      operation({ query } as never),
    );

    await expect(projectStripeEvent({ event, rawBody })).resolves.toEqual({
      replayed: false,
      projected: true,
    });
    expect(projectedStatus).toBe("canceled");
    expect(String(query.mock.calls.at(-1)?.[0])).toContain(
      "stripe_price_id = NULL",
    );
    await expect(projectStripeEvent({ event, rawBody })).resolves.toEqual({
      replayed: true,
      projected: false,
    });
  });

  it.each([
    [
      "Price product metadata",
      () =>
        verifiedStripePrice({
          metadata: { product: "another-product" },
        }),
    ],
    [
      "expanded Product metadata",
      () =>
        verifiedStripePrice({
          product: {
            id: "prod_safe",
            active: true,
            livemode: false,
            metadata: { product: "another-product" },
          },
        }),
    ],
    [
      "licensed usage type",
      () =>
        verifiedStripePrice({
          recurring: {
            interval: "month",
            interval_count: 1,
            usage_type: "metered",
          },
        }),
    ],
  ] as const)(
    "rejects a targeted webhook before dedupe when %s drifts",
    async (_label, driftedPrice) => {
      enableBillingEnvironment();
      const priceRetrieve = installVerifiedWebhookPrice(driftedPrice());
      const event = subscriptionEvent({
        id: `evt_contract_drift_${_label.replaceAll(" ", "_")}`,
        type: "customer.subscription.created",
        status: "active",
        created: 1785456000,
      });

      const { projectStripeEvent } = await import("./billing");
      await expect(
        projectStripeEvent({ event, rawBody: JSON.stringify(event) }),
      ).rejects.toMatchObject({
        code: "billing_price_invalid",
      } satisfies Partial<BillingError>);
      expect(priceRetrieve).toHaveBeenCalledWith("price_safe", {
        expand: ["product"],
      });
      expect(withProductTransaction).not.toHaveBeenCalled();
    },
  );

  it("keeps a targeted webhook retryable when Price verification is temporarily unavailable", async () => {
    enableBillingEnvironment();
    const priceRetrieve = vi
      .fn()
      .mockRejectedValueOnce(new Error("Stripe temporarily unavailable"))
      .mockResolvedValue(verifiedStripePrice());
    installStripeClientForTests({
      prices: { retrieve: priceRetrieve },
    } as never);
    const event = subscriptionEvent({
      id: "evt_price_retry",
      type: "customer.subscription.created",
      status: "active",
      created: 1785456000,
    });
    const rawBody = JSON.stringify(event);
    const { projectStripeEvent } = await import("./billing");

    await expect(projectStripeEvent({ event, rawBody })).rejects.toMatchObject({
      code: "billing_price_invalid",
    } satisfies Partial<BillingError>);
    expect(withProductTransaction).not.toHaveBeenCalled();

    let recorded = false;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("provider_webhook_events")) {
        if (recorded) return { rows: [], rowCount: 0 };
        recorded = true;
        return { rows: [{ id: "recorded" }], rowCount: 1 };
      }
      if (sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              stripe_subscription_id: null,
              last_provider_event_at: "2026-07-30T00:00:00.000Z",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE vixel_ugc.subscriptions")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    vi.mocked(withProductTransaction).mockImplementation(async (operation) =>
      operation({ query } as never),
    );

    await expect(projectStripeEvent({ event, rawBody })).resolves.toEqual({
      replayed: false,
      projected: true,
    });
    await expect(projectStripeEvent({ event, rawBody })).resolves.toEqual({
      replayed: true,
      projected: false,
    });
    expect(priceRetrieve).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      "a different price",
      (subscription: ReturnType<typeof stripeSubscription>) => {
        subscription.items.data[0].price.id = "price_other";
      },
    ],
    [
      "quantity drift",
      (subscription: ReturnType<typeof stripeSubscription>) => {
        subscription.items.data[0].quantity = 2;
      },
    ],
    [
      "product metadata loss",
      (subscription: ReturnType<typeof stripeSubscription>) => {
        subscription.metadata.product = "";
      },
    ],
  ] as const)(
    "revokes an existing entitlement after %s and restores it on a later valid event",
    async (_label, driftSubscription) => {
      enableBillingEnvironment();
      const store = installWebhookProjectionStore(stripeSubscription("active"));
      store.state.subscriptionId = "sub_safe";
      store.state.priceId = "price_safe";
      store.state.status = "active";
      store.state.lastProviderEventAt = new Date("2026-07-30T00:00:00.000Z");
      const drifted = subscriptionEvent({
        id: `evt_bound_drift_${_label.replaceAll(" ", "_")}`,
        type: "customer.subscription.updated",
        status: "active",
        created: 1785456000,
      });
      driftSubscription(
        (
          drifted as unknown as {
            data: { object: ReturnType<typeof stripeSubscription> };
          }
        ).data.object,
      );
      const { projectStripeEvent } = await import("./billing");

      await expect(
        projectStripeEvent({
          event: drifted,
          rawBody: JSON.stringify(drifted),
        }),
      ).resolves.toEqual({ replayed: false, projected: true });
      expect(store.state.priceId).toBeNull();
      await expect(
        entitlementFromProjection(store.state),
      ).resolves.toMatchObject({ entitled: false });

      const restored = subscriptionEvent({
        id: `evt_bound_restore_${_label.replaceAll(" ", "_")}`,
        type: "customer.subscription.updated",
        status: "active",
        created: 1785456001,
      });
      await expect(
        projectStripeEvent({
          event: restored,
          rawBody: JSON.stringify(restored),
        }),
      ).resolves.toEqual({ replayed: false, projected: true });
      expect(store.state.priceId).toBe("price_safe");
      await expect(
        entitlementFromProjection(store.state),
      ).resolves.toMatchObject({ entitled: true });
    },
  );

  it.each([
    ["past_due", "customer.subscription.updated", "past_due"],
    ["canceled", "customer.subscription.updated", "canceled"],
    ["deleted", "customer.subscription.deleted", "canceled"],
  ] as const)(
    "revokes an existing entitlement for a %s event without requiring a healthy Price contract",
    async (_label, type, status) => {
      enableBillingEnvironment();
      const store = installWebhookProjectionStore(stripeSubscription(status));
      store.state.subscriptionId = "sub_safe";
      store.state.priceId = "price_safe";
      store.state.status = "active";
      store.state.lastProviderEventAt = new Date("2026-07-30T00:00:00.000Z");
      store.priceRetrieve.mockRejectedValue(
        new Error("Price contract unavailable"),
      );
      const event = subscriptionEvent({
        id: `evt_bound_${_label}`,
        type,
        status,
        created: 1785456000,
      });
      const { projectStripeEvent } = await import("./billing");

      await expect(
        projectStripeEvent({ event, rawBody: JSON.stringify(event) }),
      ).resolves.toEqual({ replayed: false, projected: true });
      expect(store.priceRetrieve).not.toHaveBeenCalled();
      expect(store.state.priceId).toBeNull();
      expect(store.state.status).toBe(status);
      await expect(
        entitlementFromProjection(store.state),
      ).resolves.toMatchObject({ entitled: false });
    },
  );

  it("records and ignores unrelated subscription events without billing price config", async () => {
    enableBillingEnvironment();
    vi.stubEnv("STRIPE_PRICE_UGC_BETA", "");
    const event = subscriptionEvent({
      id: "evt_unrelated_subscription",
      type: "customer.subscription.updated",
      status: "active",
      created: 1785456000,
    });
    (
      event as unknown as {
        data: { object: { metadata: { product: string } } };
      }
    ).data.object.metadata.product = "another-product";
    let recorded = false;
    const query = vi.fn(async (sql: string) => {
      if (!sql.includes("provider_webhook_events")) {
        return { rows: [], rowCount: 0 };
      }
      if (recorded) return { rows: [], rowCount: 0 };
      recorded = true;
      return { rows: [{ id: "recorded" }], rowCount: 1 };
    });
    vi.mocked(withProductTransaction).mockImplementation(async (operation) =>
      operation({ query } as never),
    );

    const { projectStripeEvent } = await import("./billing");
    await expect(
      projectStripeEvent({ event, rawBody: JSON.stringify(event) }),
    ).resolves.toEqual({ replayed: false, projected: false });
    await expect(
      projectStripeEvent({ event, rawBody: JSON.stringify(event) }),
    ).resolves.toEqual({ replayed: true, projected: false });
    expect(query).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["Vercel Production", "production", "sk_live_safe", false],
    ["Vercel Preview", "preview", "sk_test_safe", true],
  ] as const)(
    "rejects a webhook event from the other Stripe mode in %s",
    async (_label, vercelEnvironment, secretKey, eventLiveMode) => {
      enableBillingEnvironment();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", vercelEnvironment);
      vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
      const { projectStripeEvent } = await import("./billing");
      await expect(
        projectStripeEvent({
          event: {
            id: `evt_mode_mismatch_${vercelEnvironment}`,
            livemode: eventLiveMode,
            type: "customer.subscription.updated",
            created: 1785456000,
          } as never,
          rawBody: `{"id":"evt_mode_mismatch_${vercelEnvironment}"}`,
        }),
      ).rejects.toMatchObject({
        code: "billing_event_invalid",
      } satisfies Partial<BillingError>);
      expect(withProductTransaction).not.toHaveBeenCalled();
    },
  );

  it("projects active subscription state only when the provider event is current", async () => {
    enableBillingEnvironment();
    installVerifiedWebhookPrice();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: USER_ID,
            stripe_subscription_id: "sub_safe",
            last_provider_event_at: "2026-07-30T00:00:00.000Z",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_active",
        livemode: false,
        type: "customer.subscription.updated",
        created: 1785456000,
        data: {
          object: {
            id: "sub_safe",
            customer: "cus_safe",
            status: "active",
            metadata: {
              product: "vixel-ugc",
              vixel_user_id: USER_ID,
            },
            items: {
              data: [
                {
                  price: { id: "price_safe" },
                  quantity: 1,
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
    const projectionSql = String(query.mock.calls[2][0]);
    expect(projectionSql).toContain("AND stripe_customer_id = $2");
    expect(projectionSql).toContain("stripe_subscription_id IS NULL");
    expect(projectionSql).not.toContain("THEN 'unpaid'");
    expect(query.mock.calls[2][1]?.[4]).toBe("active");
    expect(query.mock.calls[2][1]?.[7]).toEqual(
      new Date("2026-07-31T00:00:00.000Z"),
    );
  });

  it("keeps same-second created and updated events active in either delivery order", async () => {
    enableBillingEnvironment();
    const created = subscriptionEvent({
      id: "evt_created_active",
      type: "customer.subscription.created",
      status: "active",
      created: 1785456000,
    });
    const updated = subscriptionEvent({
      id: "evt_updated_active",
      type: "customer.subscription.updated",
      status: "active",
      created: 1785456000,
    });
    const { projectStripeEvent } = await import("./billing");

    async function run(events: [typeof created, typeof updated]) {
      const store = installWebhookProjectionStore(stripeSubscription("active"));
      for (const event of events) {
        await projectStripeEvent({ event, rawBody: JSON.stringify(event) });
      }
      return store;
    }

    await expect(run([created, updated])).resolves.toMatchObject({
      state: { status: "active" },
    });
    await expect(run([updated, created])).resolves.toMatchObject({
      state: { status: "active" },
    });
  });

  it("reconciles ambiguous same-second updates against the provider", async () => {
    enableBillingEnvironment();
    const active = subscriptionEvent({
      id: "evt_updated_active_same_second",
      type: "customer.subscription.updated",
      status: "active",
      created: 1785456000,
    });
    const pastDue = subscriptionEvent({
      id: "evt_updated_past_due_same_second",
      type: "customer.subscription.updated",
      status: "past_due",
      created: 1785456000,
    });
    const { projectStripeEvent } = await import("./billing");

    async function run(
      events: [typeof active, typeof pastDue],
      canonicalStatus: "active" | "past_due",
    ) {
      const store = installWebhookProjectionStore(
        stripeSubscription(canonicalStatus),
      );
      store.state.subscriptionId = "sub_safe";
      for (const event of events) {
        await projectStripeEvent({ event, rawBody: JSON.stringify(event) });
      }
      return store.state.status;
    }

    await expect(run([active, pastDue], "past_due")).resolves.toBe("past_due");
    await expect(run([pastDue, active], "past_due")).resolves.toBe("past_due");
    await expect(run([active, pastDue], "active")).resolves.toBe("active");
    await expect(run([pastDue, active], "active")).resolves.toBe("active");
  });

  it("fails closed when same-second provider reconciliation is unavailable", async () => {
    enableBillingEnvironment();
    const first = subscriptionEvent({
      id: "evt_same_second_first",
      type: "customer.subscription.created",
      status: "active",
      created: 1785456000,
    });
    const second = subscriptionEvent({
      id: "evt_same_second_second",
      type: "customer.subscription.updated",
      status: "active",
      created: 1785456000,
    });
    const store = installWebhookProjectionStore(stripeSubscription("active"));
    store.retrieve.mockRejectedValueOnce(new Error("provider unavailable"));
    const { projectStripeEvent } = await import("./billing");
    await projectStripeEvent({ event: first, rawBody: JSON.stringify(first) });

    await expect(
      projectStripeEvent({ event: second, rawBody: JSON.stringify(second) }),
    ).rejects.toThrow("provider unavailable");
    expect(store.state.status).toBe("active");
  });

  it("does not let an obviously older event override a newer provider second", async () => {
    enableBillingEnvironment();
    const newer = subscriptionEvent({
      id: "evt_newer_active",
      type: "customer.subscription.updated",
      status: "active",
      created: 1785456001,
    });
    const older = subscriptionEvent({
      id: "evt_older_canceled",
      type: "customer.subscription.deleted",
      status: "canceled",
      created: 1785456000,
    });
    const store = installWebhookProjectionStore(stripeSubscription("active"));

    const { projectStripeEvent } = await import("./billing");
    await projectStripeEvent({ event: newer, rawBody: JSON.stringify(newer) });
    const result = await projectStripeEvent({
      event: older,
      rawBody: JSON.stringify(older),
    });

    expect(result).toEqual({ replayed: false, projected: false });
    expect(store.state.status).toBe("active");
    expect(store.retrieve).not.toHaveBeenCalled();
  });

  it("does not project subscription events for another price or product", async () => {
    enableBillingEnvironment();
    installVerifiedWebhookPrice();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_wrong_price",
        livemode: false,
        type: "customer.subscription.updated",
        created: 1785456000,
        data: {
          object: {
            id: "sub_wrong",
            customer: "cus_safe",
            status: "active",
            metadata: {
              product: "vixel-ugc",
              vixel_user_id: USER_ID,
            },
            items: {
              data: [
                {
                  price: { id: "price_another_product" },
                  quantity: 1,
                },
              ],
            },
            cancel_at_period_end: false,
          },
        },
      } as never,
      rawBody: '{"id":"evt_wrong_price"}',
    });

    expect(result).toEqual({ replayed: false, projected: false });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("fails closed when a subscription event customer does not match the account", async () => {
    enableBillingEnvironment();
    installVerifiedWebhookPrice();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_wrong_customer",
        livemode: false,
        type: "customer.subscription.updated",
        created: 1785456000,
        data: {
          object: {
            id: "sub_safe",
            customer: "cus_wrong",
            status: "active",
            metadata: {
              product: "vixel-ugc",
              vixel_user_id: USER_ID,
            },
            items: {
              data: [
                {
                  price: { id: "price_safe" },
                  quantity: 1,
                  current_period_end: 1788134400,
                },
              ],
            },
            cancel_at_period_end: false,
          },
        },
      } as never,
      rawBody: '{"id":"evt_wrong_customer"}',
    });

    expect(result).toEqual({ replayed: false, projected: false });
    expect(String(query.mock.calls[2][0])).toContain(
      "AND stripe_customer_id = $2",
    );
    expect(query.mock.calls[2][1]?.[1]).toBe("cus_wrong");
  });

  it("does not let a different subscription replace the account binding", async () => {
    enableBillingEnvironment();
    installVerifiedWebhookPrice();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            stripe_subscription_id: "sub_existing",
            last_provider_event_at: "2026-07-30T00:00:00.000Z",
          },
        ],
        rowCount: 1,
      });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );
    const event = subscriptionEvent({
      id: "evt_duplicate_subscription",
      type: "customer.subscription.created",
      status: "active",
      created: 1785456000,
    });
    (
      event as unknown as {
        data: { object: { id: string } };
      }
    ).data.object.id = "sub_duplicate";

    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event,
      rawBody: JSON.stringify(event),
    });

    expect(result).toEqual({ replayed: false, projected: false });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("does not treat Checkout completion as a fresh entitlement projection", async () => {
    enableBillingEnvironment();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    vi.mocked(withProductTransaction).mockImplementationOnce(
      async (operation) => operation({ query } as never),
    );
    const { projectStripeEvent } = await import("./billing");
    const result = await projectStripeEvent({
      event: {
        id: "evt_checkout",
        livemode: false,
        type: "checkout.session.completed",
        created: 1785456000,
        data: {
          object: {
            mode: "subscription",
            customer: "cus_safe",
            subscription: "sub_safe",
            client_reference_id: USER_ID,
            metadata: {
              product: "vixel-ugc",
              vixel_user_id: USER_ID,
            },
          },
        },
      } as never,
      rawBody: '{"id":"evt_checkout"}',
    });

    expect(result).toEqual({ replayed: false, projected: true });
    const projectionSql = String(query.mock.calls[1][0]);
    expect(projectionSql).not.toContain("last_provider_event_at =");
    expect(projectionSql).toContain("last_provider_event_at < $4");
    expect(projectionSql).not.toContain("status =");
    expect(query.mock.calls[1][1]).toEqual([
      USER_ID,
      "cus_safe",
      "sub_safe",
      new Date("2026-07-31T00:00:00.000Z"),
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

  it("keeps paid generation closed when account authentication is disabled", async () => {
    enableBillingEnvironment();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_ACCOUNT_AUTH", "false");

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/image"),
      "request-auth-disabled",
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "account_auth_not_ready" },
    });
    expect(authorizeAccount).not.toHaveBeenCalled();
    expect(productQuery).not.toHaveBeenCalled();
  });

  it("does not grant paid generation for an active subscription on another price", async () => {
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
      rows: [
        {
          ...activeRow(),
          stripe_price_id: "price_another_product",
        },
      ],
    } as never);

    const { requirePaidGenerationAccess } = await import("./billing");
    const response = await requirePaidGenerationAccess(
      new Request("https://ugc.vixelai.com/api/media/image"),
      "request-wrong-price",
    );

    expect(response?.status).toBe(402);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "subscription_required" },
    });
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
