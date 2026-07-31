import { createHash } from "node:crypto";

import Stripe from "stripe";
import type { PoolClient } from "pg";

import { FOUNDING_BETA_OFFER } from "@/lib/product-offer";

import { authorizeAccount } from "./accounts";
import { getServerRuntimeConfig } from "./env";
import {
  productQuery,
  withProductTransaction,
} from "./product-db";

export type BillingStatus =
  | "none"
  | "checkout_pending"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

export type BillingState = {
  status: BillingStatus;
  customerConfigured: boolean;
  subscriptionConfigured: boolean;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  entitled: boolean;
};

type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: BillingStatus;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean;
  last_provider_event_at: Date | string | null;
};

type StripeClient = Pick<
  Stripe,
  "customers" | "checkout" | "billingPortal" | "prices" | "webhooks"
>;

let testStripeClient: StripeClient | null = null;

function stripeClient(): StripeClient {
  if (testStripeClient) return testStripeClient;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new BillingError("billing_not_configured");
  return new Stripe(key, { maxNetworkRetries: 2 });
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function publicState(row: SubscriptionRow | null): BillingState {
  return {
    status: row?.status ?? "none",
    customerConfigured: Boolean(row?.stripe_customer_id),
    subscriptionConfigured: Boolean(row?.stripe_subscription_id),
    priceId: row?.stripe_price_id ?? null,
    currentPeriodEnd: iso(row?.current_period_end ?? null),
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    entitled: row?.status === "active" || row?.status === "trialing",
  };
}

function customerId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer,
): string {
  return typeof value === "string" ? value : value.id;
}

function subscriptionId(
  value: string | Stripe.Subscription | null,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function stripeStatus(value: Stripe.Subscription.Status): BillingStatus {
  switch (value) {
    case "incomplete":
    case "incomplete_expired":
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "paused":
      return value as BillingStatus;
    default:
      return "unpaid";
  }
}

function eventDigest(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function unixDate(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function subscriptionPeriodEnd(
  subscription: Stripe.Subscription,
): Date | null {
  const latest = subscription.items.data.reduce(
    (maximum, item) => Math.max(maximum, item.current_period_end ?? 0),
    0,
  );
  return unixDate(latest || null);
}

export class BillingError extends Error {
  constructor(
    readonly code:
      | "billing_not_configured"
      | "billing_webhook_not_configured"
      | "billing_price_not_configured"
      | "billing_price_invalid"
      | "billing_customer_missing"
      | "billing_event_invalid"
      | "subscription_required",
  ) {
    super(code);
    this.name = "BillingError";
  }
}

async function assertFoundingBetaPrice(priceId: string): Promise<void> {
  let price: Stripe.Price;
  try {
    price = await stripeClient().prices.retrieve(priceId);
  } catch {
    throw new BillingError("billing_price_invalid");
  }

  const recurring = price.recurring;
  if (
    !price.active ||
    price.type !== "recurring" ||
    price.unit_amount !== FOUNDING_BETA_OFFER.amountCents ||
    price.currency.toLowerCase() !== FOUNDING_BETA_OFFER.currency ||
    recurring?.interval !== FOUNDING_BETA_OFFER.interval ||
    recurring.interval_count !== FOUNDING_BETA_OFFER.intervalCount ||
    recurring.usage_type !== "licensed"
  ) {
    throw new BillingError("billing_price_invalid");
  }
}

export async function getBillingState(
  userId: string,
): Promise<BillingState> {
  const result = await productQuery<SubscriptionRow>(
    `
      SELECT
        user_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_end,
        cancel_at_period_end,
        last_provider_event_at
      FROM vixel_ugc.subscriptions
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );
  return publicState(result.rows[0] ?? null);
}

async function ensureStripeCustomer(input: {
  userId: string;
  email: string;
}): Promise<string> {
  return withProductTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`vixel-ugc-customer:${input.userId}`],
    );
    const existing = await client.query<{
      stripe_customer_id: string;
    }>(
      `
        SELECT stripe_customer_id
        FROM vixel_ugc.subscriptions
        WHERE user_id = $1
        LIMIT 1
      `,
      [input.userId],
    );
    if (existing.rows[0]) return existing.rows[0].stripe_customer_id;

    const created = await stripeClient().customers.create(
      {
        email: input.email,
        metadata: {
          product: "vixel-ugc",
          vixel_user_id: input.userId,
        },
      },
      {
        idempotencyKey: `vixel-ugc/customer/${input.userId}`,
      },
    );
    await client.query(
      `
        INSERT INTO vixel_ugc.subscriptions (
          user_id,
          stripe_customer_id,
          status
        )
        VALUES ($1, $2, 'none')
        ON CONFLICT (user_id) DO NOTHING
      `,
      [input.userId, created.id],
    );
    return created.id;
  });
}

export async function createCheckoutSession(input: {
  userId: string;
  email: string;
  requestKey: string;
}): Promise<{ url: string; state: BillingState }> {
  const config = getServerRuntimeConfig();
  if (!config.product.stripe.configured || !config.product.siteUrl) {
    throw new BillingError("billing_not_configured");
  }
  const priceId = process.env.STRIPE_PRICE_UGC_BETA?.trim();
  if (!priceId) throw new BillingError("billing_price_not_configured");
  if (!config.product.features.billing.ready) {
    throw new BillingError("billing_not_configured");
  }

  await assertFoundingBetaPrice(priceId);
  const customer = await ensureStripeCustomer(input);
  const checkout = await stripeClient().checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      client_reference_id: input.userId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${config.product.siteUrl}/studio?billing=success`,
      cancel_url: `${config.product.siteUrl}/pricing?billing=canceled`,
      metadata: {
        product: "vixel-ugc",
        vixel_user_id: input.userId,
      },
      subscription_data: {
        metadata: {
          product: "vixel-ugc",
          vixel_user_id: input.userId,
        },
      },
    },
    {
      idempotencyKey: `vixel-ugc/checkout/${input.userId}/${input.requestKey}`,
    },
  );
  if (!checkout.url) throw new BillingError("billing_not_configured");

  const result = await productQuery<SubscriptionRow>(
    `
      UPDATE vixel_ugc.subscriptions
      SET
        stripe_price_id = $2,
        status = CASE
          WHEN status IN ('active', 'trialing') THEN status
          ELSE 'checkout_pending'
        END
      WHERE user_id = $1
      RETURNING
        user_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_end,
        cancel_at_period_end,
        last_provider_event_at
    `,
    [input.userId, priceId],
  );
  return { url: checkout.url, state: publicState(result.rows[0] ?? null) };
}

export async function createBillingPortalSession(input: {
  userId: string;
}): Promise<{ url: string }> {
  const config = getServerRuntimeConfig();
  if (!config.product.stripe.configured || !config.product.siteUrl) {
    throw new BillingError("billing_not_configured");
  }
  const existing = await productQuery<{ stripe_customer_id: string }>(
    `
      SELECT stripe_customer_id
      FROM vixel_ugc.subscriptions
      WHERE user_id = $1
      LIMIT 1
    `,
    [input.userId],
  );
  const customer = existing.rows[0]?.stripe_customer_id;
  if (!customer) throw new BillingError("billing_customer_missing");
  const portal = await stripeClient().billingPortal.sessions.create({
    customer,
    return_url: `${config.product.siteUrl}/studio`,
  });
  return { url: portal.url };
}

export async function constructStripeEvent(
  rawBody: string,
  signature: string,
): Promise<Stripe.Event> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new BillingError("billing_webhook_not_configured");
  try {
    const fullClient =
      testStripeClient ??
      new Stripe(process.env.STRIPE_SECRET_KEY?.trim() || "sk_test_missing");
    return fullClient.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError("billing_event_invalid");
  }
}

async function resolveEventUserId(
  client: PoolClient,
  metadataUserId: string | null,
  customer: string | null,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customer) return null;
  const result = await client.query(
    `
      SELECT user_id
      FROM vixel_ugc.subscriptions
      WHERE stripe_customer_id = $1
      LIMIT 1
    `,
    [customer],
  );
  return typeof result.rows[0]?.user_id === "string"
    ? result.rows[0].user_id
    : null;
}

export async function projectStripeEvent(input: {
  event: Stripe.Event;
  rawBody: string;
}): Promise<{ replayed: boolean; projected: boolean }> {
  return withProductTransaction(async (client) => {
    const recorded = await client.query<{ id: string }>(
      `
        INSERT INTO vixel_ugc.provider_webhook_events (
          provider,
          provider_event_id,
          event_type,
          payload_sha256,
          provider_occurred_at
        )
        VALUES ('stripe', $1, $2, $3, $4)
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id
      `,
      [
        input.event.id,
        input.event.type,
        eventDigest(input.rawBody),
        unixDate(input.event.created),
      ],
    );
    if (!recorded.rows[0]) return { replayed: true, projected: false };

    if (input.event.type === "checkout.session.completed") {
      const checkout = input.event.data.object as Stripe.Checkout.Session;
      const customer =
        typeof checkout.customer === "string"
          ? checkout.customer
          : checkout.customer?.id ?? null;
      const metadataUserId =
        checkout.metadata?.vixel_user_id ??
        checkout.client_reference_id ??
        null;
      const userId = await resolveEventUserId(
        client,
        metadataUserId,
        customer,
      );
      if (!userId || !customer) return { replayed: false, projected: false };
      await client.query(
        `
          UPDATE vixel_ugc.subscriptions
          SET
            stripe_customer_id = $2,
            stripe_subscription_id = COALESCE($3, stripe_subscription_id),
            status = CASE
              WHEN status IN ('active', 'trialing') THEN status
              ELSE 'checkout_pending'
            END,
            last_provider_event_at = $4
          WHERE user_id = $1
            AND (
              last_provider_event_at IS NULL
              OR last_provider_event_at <= $4
            )
        `,
        [
          userId,
          customer,
          subscriptionId(checkout.subscription),
          unixDate(input.event.created),
        ],
      );
      return { replayed: false, projected: true };
    }

    if (
      input.event.type === "customer.subscription.created" ||
      input.event.type === "customer.subscription.updated" ||
      input.event.type === "customer.subscription.deleted"
    ) {
      const subscription = input.event.data.object as Stripe.Subscription;
      const customer = customerId(subscription.customer);
      const userId = await resolveEventUserId(
        client,
        subscription.metadata.vixel_user_id ?? null,
        customer,
      );
      if (!userId) return { replayed: false, projected: false };
      const item = subscription.items.data[0];
      await client.query(
        `
          UPDATE vixel_ugc.subscriptions
          SET
            stripe_customer_id = $2,
            stripe_subscription_id = $3,
            stripe_price_id = COALESCE($4, stripe_price_id),
            status = $5,
            current_period_end = $6,
            cancel_at_period_end = $7,
            last_provider_event_at = $8
          WHERE user_id = $1
            AND (
              last_provider_event_at IS NULL
              OR last_provider_event_at <= $8
            )
        `,
        [
          userId,
          customer,
          subscription.id,
          item?.price.id ?? null,
          stripeStatus(subscription.status),
          subscriptionPeriodEnd(subscription),
          subscription.cancel_at_period_end,
          unixDate(input.event.created),
        ],
      );
      return { replayed: false, projected: true };
    }

    return { replayed: false, projected: false };
  });
}

export async function requirePaidGenerationAccess(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const config = getServerRuntimeConfig();
  if (!config.product.features.accountAuth.enabled) return null;
  if (!config.product.features.accountAuth.ready) {
    const { apiError } = await import("./api");
    return apiError(
      503,
      "account_auth_not_ready",
      "Account authorization is not ready.",
      false,
      requestId,
    );
  }
  const authorization = await authorizeAccount(request, requestId, {
    approved: true,
  });
  if (!authorization.allowed) return authorization.response;
  if (!config.product.features.billing.ready) {
    const { apiError } = await import("./api");
    return apiError(
      503,
      "billing_not_ready",
      "Subscription billing is not ready.",
      false,
      requestId,
    );
  }
  const state = await getBillingState(authorization.account.userId);
  if (!state.entitled) {
    const { apiError } = await import("./api");
    return apiError(
      402,
      "subscription_required",
      "An active subscription is required for paid generation.",
      false,
      requestId,
    );
  }
  return null;
}

export function installStripeClientForTests(
  client: StripeClient | null,
): void {
  testStripeClient = client;
}
