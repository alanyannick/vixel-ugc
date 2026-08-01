import { createHash } from "node:crypto";

import Stripe from "stripe";
import type { PoolClient } from "pg";

import { FOUNDING_BETA_OFFER } from "@/lib/product-offer";

import { authorizeAccount } from "./accounts";
import {
  expectedStripeRuntimeMode,
  getServerRuntimeConfig,
  stripeSecretKeyMode,
  type StripeRuntimeMode,
} from "./env";
import { productQuery, withProductTransaction } from "./product-db";

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
  | "customers"
  | "checkout"
  | "billingPortal"
  | "prices"
  | "subscriptions"
  | "webhooks"
>;

let testStripeClient: StripeClient | null = null;

const VIXEL_UGC_PRODUCT = "vixel-ugc";
const CHECKOUT_SESSION_TTL_SECONDS = 31 * 60;
const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredStripeRuntime(): {
  key: string;
  mode: StripeRuntimeMode;
} {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const mode = expectedStripeRuntimeMode();
  if (!key || stripeSecretKeyMode(key) !== mode) {
    throw new BillingError("billing_not_configured");
  }
  return { key, mode };
}

function stripeClient(): StripeClient {
  const { key } = configuredStripeRuntime();
  if (testStripeClient) return testStripeClient;
  return new Stripe(key, { maxNetworkRetries: 2 });
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function publicState(row: SubscriptionRow | null): BillingState {
  const expectedPriceId = process.env.STRIPE_PRICE_UGC_BETA?.trim() ?? null;
  return {
    status: row?.status ?? "none",
    customerConfigured: Boolean(row?.stripe_customer_id),
    subscriptionConfigured: Boolean(row?.stripe_subscription_id),
    priceId: row?.stripe_price_id ?? null,
    currentPeriodEnd: iso(row?.current_period_end ?? null),
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    entitled:
      expectedPriceId !== null &&
      row?.stripe_price_id === expectedPriceId &&
      (row.status === "active" || row.status === "trialing"),
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

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
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
      | "billing_subscription_exists"
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
    price = await stripeClient().prices.retrieve(priceId, {
      expand: ["product"],
    });
  } catch {
    throw new BillingError("billing_price_invalid");
  }

  const recurring = price.recurring;
  const product = price.product;
  const expandedProduct =
    product !== null &&
    product !== undefined &&
    typeof product !== "string" &&
    !("deleted" in product && product.deleted)
      ? product
      : null;
  const productReady =
    expandedProduct?.active === true &&
    expandedProduct.metadata?.product === VIXEL_UGC_PRODUCT;
  const expectedMode = expectedStripeRuntimeMode();
  const expectedLiveMode = expectedMode === "live";
  if (
    price.id !== priceId ||
    !price.active ||
    price.type !== "recurring" ||
    price.unit_amount !== FOUNDING_BETA_OFFER.amountCents ||
    price.currency.toLowerCase() !== FOUNDING_BETA_OFFER.currency ||
    recurring?.interval !== FOUNDING_BETA_OFFER.interval ||
    recurring.interval_count !== FOUNDING_BETA_OFFER.intervalCount ||
    recurring.usage_type !== "licensed" ||
    price.metadata?.product !== VIXEL_UGC_PRODUCT ||
    !productReady ||
    price.livemode !== expectedLiveMode ||
    expandedProduct?.livemode !== price.livemode
  ) {
    throw new BillingError("billing_price_invalid");
  }
}

function providerSubscriptionBlocksCheckout(
  subscription: Stripe.Subscription,
  customer: string,
): boolean {
  return (
    customerId(subscription.customer) === customer &&
    subscription.status !== "canceled" &&
    subscription.status !== "incomplete_expired"
  );
}

export async function getBillingState(userId: string): Promise<BillingState> {
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

async function ensureStripeCustomer(
  client: PoolClient,
  input: { userId: string; email: string },
): Promise<{
  customer: string;
  subscriptionId: string | null;
}> {
  const existing = await client.query<{
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
    status: BillingStatus;
  }>(
    `
      SELECT stripe_customer_id, stripe_subscription_id, status
      FROM vixel_ugc.subscriptions
      WHERE user_id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [input.userId],
  );
  if (existing.rows[0]) {
    return {
      customer: existing.rows[0].stripe_customer_id,
      subscriptionId: existing.rows[0].stripe_subscription_id,
    };
  }

  const created = await stripeClient().customers.create(
    {
      email: input.email,
      metadata: {
        product: VIXEL_UGC_PRODUCT,
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
  return { customer: created.id, subscriptionId: null };
}

function checkoutSessionCustomerId(
  session: Stripe.Checkout.Session,
): string | null {
  if (typeof session.customer === "string") return session.customer;
  return session.customer?.id ?? null;
}

function checkoutSessionMatches(
  session: Stripe.Checkout.Session,
  input: {
    customer: string;
    userId: string;
    priceId: string;
  },
): boolean {
  const lineItems = session.line_items?.data ?? [];
  const lineItem = lineItems[0];
  return (
    session.mode === "subscription" &&
    checkoutSessionCustomerId(session) === input.customer &&
    session.client_reference_id === input.userId &&
    session.metadata?.product === VIXEL_UGC_PRODUCT &&
    session.metadata?.vixel_user_id === input.userId &&
    lineItems.length === 1 &&
    lineItem?.price?.id === input.priceId &&
    (lineItem.quantity === null || lineItem.quantity === 1)
  );
}

function reusableCheckoutSession(input: {
  sessions: Stripe.Checkout.Session[];
  customer: string;
  userId: string;
  priceId: string;
  nowSeconds: number;
}): Stripe.Checkout.Session | null {
  return (
    input.sessions.find((session) => {
      return (
        session.status === "open" &&
        typeof session.url === "string" &&
        session.url.startsWith("https://checkout.stripe.com/") &&
        (session.expires_at ?? 0) > input.nowSeconds &&
        checkoutSessionMatches(session, input)
      );
    }) ?? null
  );
}

function matchingCompletedSubscriptionIds(input: {
  sessions: Stripe.Checkout.Session[];
  customer: string;
  userId: string;
  priceId: string;
}): string[] {
  return input.sessions.flatMap((candidate) => {
    if (
      candidate.status !== "complete" ||
      !checkoutSessionMatches(candidate, input)
    ) {
      return [];
    }
    const id = subscriptionId(candidate.subscription);
    return id ? [id] : [];
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
  return withProductTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`vixel-ugc-checkout:${input.userId}`],
    );
    const identity = await ensureStripeCustomer(client, input);
    const customer = identity.customer;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const checkoutSessions = await stripeClient().checkout.sessions.list({
      customer,
      limit: 100,
      expand: ["data.line_items"],
    });
    const subscriptions = await stripeClient().subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    const providerSubscriptions = [...subscriptions.data];
    const knownSubscriptionIds = new Set(
      providerSubscriptions.map((subscription) => subscription.id),
    );
    const subscriptionIdsToReconcile = new Set([
      ...(identity.subscriptionId ? [identity.subscriptionId] : []),
      ...matchingCompletedSubscriptionIds({
        sessions: checkoutSessions.data,
        customer,
        userId: input.userId,
        priceId,
      }),
    ]);
    for (const subscriptionIdToReconcile of subscriptionIdsToReconcile) {
      if (knownSubscriptionIds.has(subscriptionIdToReconcile)) continue;
      const subscription = await stripeClient().subscriptions.retrieve(
        subscriptionIdToReconcile,
      );
      providerSubscriptions.push(subscription);
      knownSubscriptionIds.add(subscription.id);
    }
    if (
      providerSubscriptions.some((subscription) =>
        providerSubscriptionBlocksCheckout(subscription, customer),
      )
    ) {
      throw new BillingError("billing_subscription_exists");
    }
    const reusable = reusableCheckoutSession({
      sessions: checkoutSessions.data,
      customer,
      userId: input.userId,
      priceId,
      nowSeconds,
    });
    const checkout =
      reusable ??
      (await stripeClient().checkout.sessions.create(
        {
          mode: "subscription",
          customer,
          client_reference_id: input.userId,
          line_items: [{ price: priceId, quantity: 1 }],
          allow_promotion_codes: true,
          billing_address_collection: "auto",
          expires_at: nowSeconds + CHECKOUT_SESSION_TTL_SECONDS,
          success_url: `${config.product.siteUrl}/studio?billing=success`,
          cancel_url: `${config.product.siteUrl}/pricing?billing=canceled`,
          metadata: {
            product: VIXEL_UGC_PRODUCT,
            vixel_user_id: input.userId,
            price_id: priceId,
          },
          subscription_data: {
            metadata: {
              product: VIXEL_UGC_PRODUCT,
              vixel_user_id: input.userId,
            },
          },
        },
        {
          idempotencyKey: `vixel-ugc/checkout/${input.userId}/${input.requestKey}`,
        },
      ));
    if (!checkout.url) throw new BillingError("billing_not_configured");

    const result = await client.query<SubscriptionRow>(
      `
        UPDATE vixel_ugc.subscriptions
        SET
          stripe_subscription_id = NULL,
          stripe_price_id = $2,
          status = 'checkout_pending',
          current_period_end = NULL,
          cancel_at_period_end = false
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
    return {
      url: checkout.url,
      state: publicState(result.rows[0] ?? null),
    };
  });
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
    const fullClient = stripeClient();
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
  if (metadataUserId && USER_ID_PATTERN.test(metadataUserId)) {
    return metadataUserId.toLowerCase();
  }
  if (metadataUserId) return null;
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

function subscriptionMatchesExpectedProduct(input: {
  subscription: Stripe.Subscription;
  customer: string;
  userId: string;
  priceId: string;
}): boolean {
  const item = input.subscription.items.data[0];
  return (
    input.subscription.id.length > 0 &&
    customerId(input.subscription.customer) === input.customer &&
    input.subscription.metadata.product === VIXEL_UGC_PRODUCT &&
    input.subscription.metadata.vixel_user_id?.toLowerCase() === input.userId &&
    input.subscription.items.data.length === 1 &&
    item?.price.id === input.priceId &&
    (item.quantity === null || item.quantity === 1)
  );
}

function timestampMillis(value: Date | string | null): number | null {
  if (value === null) return null;
  const milliseconds =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

async function stripeProjectionPriceId(
  event: Stripe.Event,
): Promise<string | null> {
  const priceId = process.env.STRIPE_PRICE_UGC_BETA?.trim();
  if (
    !priceId ||
    (event.type !== "customer.subscription.created" &&
      event.type !== "customer.subscription.updated")
  ) {
    return priceId ?? null;
  }

  const subscription = event.data?.object as Stripe.Subscription | undefined;
  if (!subscription) return priceId;
  const customer = customerId(subscription.customer);
  const metadataUserId = subscription.metadata.vixel_user_id?.toLowerCase();
  const canGrant =
    (subscription.status === "active" || subscription.status === "trialing") &&
    Boolean(metadataUserId && USER_ID_PATTERN.test(metadataUserId)) &&
    subscriptionMatchesExpectedProduct({
      subscription,
      customer,
      userId: metadataUserId ?? "",
      priceId,
    });
  if (!canGrant) return priceId;

  const config = getServerRuntimeConfig();
  if (!config.product.stripe.configured) {
    throw new BillingError("billing_not_configured");
  }
  if (!config.product.stripe.webhookConfigured) {
    throw new BillingError("billing_webhook_not_configured");
  }
  // Only an event capable of granting entitlement needs a healthy provider
  // contract. Degrading, contract-invalid, and deleted events must still clear
  // an existing entitlement when Stripe's Price API is unavailable.
  await assertFoundingBetaPrice(priceId);
  return priceId;
}

async function projectNonEntitlingSubscription(
  client: PoolClient,
  input: {
    userId: string;
    customer: string;
    subscription: Stripe.Subscription;
    providerOccurredAt: Date;
    deleted: boolean;
  },
): Promise<boolean> {
  const projected = await client.query(
    `
      UPDATE vixel_ugc.subscriptions
      SET
        stripe_price_id = NULL,
        status = $4,
        current_period_end = $5,
        cancel_at_period_end = $6,
        last_provider_event_at = $7
      WHERE user_id = $1
        AND stripe_customer_id = $2
        AND stripe_subscription_id = $3
        AND (
          last_provider_event_at IS NULL
          OR last_provider_event_at <= $7
        )
    `,
    [
      input.userId,
      input.customer,
      input.subscription.id,
      input.deleted ? "canceled" : stripeStatus(input.subscription.status),
      subscriptionPeriodEnd(input.subscription),
      input.deleted || input.subscription.cancel_at_period_end,
      input.providerOccurredAt,
    ],
  );
  return (projected.rowCount ?? 0) > 0;
}

export async function projectStripeEvent(input: {
  event: Stripe.Event;
  rawBody: string;
}): Promise<{ replayed: boolean; projected: boolean }> {
  const { mode } = configuredStripeRuntime();
  if (input.event.livemode !== (mode === "live")) {
    throw new BillingError("billing_event_invalid");
  }
  const projectionPriceId = await stripeProjectionPriceId(input.event);
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
      if (
        checkout.mode !== "subscription" ||
        checkout.metadata?.product !== VIXEL_UGC_PRODUCT
      ) {
        return { replayed: false, projected: false };
      }
      const customer =
        typeof checkout.customer === "string"
          ? checkout.customer
          : (checkout.customer?.id ?? null);
      const metadataUserId =
        checkout.metadata?.vixel_user_id ??
        checkout.client_reference_id ??
        null;
      const userId = await resolveEventUserId(client, metadataUserId, customer);
      if (!userId || !customer) return { replayed: false, projected: false };
      const projected = await client.query(
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
            AND stripe_customer_id = $2
            AND (
              $3::text IS NULL
              OR stripe_subscription_id IS NULL
              OR stripe_subscription_id = $3
            )
            AND (
              last_provider_event_at IS NULL
              OR last_provider_event_at < $4
            )
        `,
        [
          userId,
          customer,
          subscriptionId(checkout.subscription),
          unixDate(input.event.created),
        ],
      );
      return {
        replayed: false,
        projected: (projected.rowCount ?? 0) > 0,
      };
    }

    if (
      input.event.type === "customer.subscription.created" ||
      input.event.type === "customer.subscription.updated" ||
      input.event.type === "customer.subscription.deleted"
    ) {
      const subscription = input.event.data.object as Stripe.Subscription;
      const customer = customerId(subscription.customer);
      const providerOccurredAt = unixDate(input.event.created);
      if (!providerOccurredAt) {
        throw new BillingError("billing_event_invalid");
      }
      const boundCursor = await client.query<{
        user_id: string;
        stripe_subscription_id: string;
        last_provider_event_at: Date | string | null;
      }>(
        `
          SELECT user_id, stripe_subscription_id, last_provider_event_at
          FROM vixel_ugc.subscriptions
          WHERE stripe_customer_id = $1
            AND stripe_subscription_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [customer, subscription.id],
      );
      const bound = boundCursor.rows[0];
      const expectedPriceId = projectionPriceId;
      const metadataUserId = USER_ID_PATTERN.test(
        subscription.metadata.vixel_user_id ?? "",
      )
        ? (subscription.metadata.vixel_user_id ?? "").toLowerCase()
        : null;
      const contractUserId = bound?.user_id ?? metadataUserId;
      const grantsEntitlement =
        input.event.type !== "customer.subscription.deleted" &&
        (subscription.status === "active" ||
          subscription.status === "trialing") &&
        Boolean(
          expectedPriceId &&
          contractUserId &&
          subscriptionMatchesExpectedProduct({
            subscription,
            customer,
            userId: contractUserId,
            priceId: expectedPriceId,
          }),
        );

      const userId = bound?.user_id ?? metadataUserId;
      if (!userId) {
        return { replayed: false, projected: false };
      }
      const current =
        bound ??
        (
          await client.query<{
            stripe_subscription_id: string | null;
            last_provider_event_at: Date | string | null;
          }>(
            `
              SELECT stripe_subscription_id, last_provider_event_at
              FROM vixel_ugc.subscriptions
              WHERE user_id = $1
                AND stripe_customer_id = $2
              LIMIT 1
              FOR UPDATE
            `,
            [userId, customer],
          )
        ).rows[0];
      if (
        !current ||
        (current.stripe_subscription_id !== null &&
          current.stripe_subscription_id !== subscription.id)
      ) {
        return { replayed: false, projected: false };
      }
      const lastProviderEventAt = timestampMillis(
        current.last_provider_event_at,
      );
      if (
        lastProviderEventAt !== null &&
        lastProviderEventAt > providerOccurredAt.getTime()
      ) {
        return { replayed: false, projected: false };
      }
      let canonicalSubscription = subscription;
      if (lastProviderEventAt === providerOccurredAt.getTime()) {
        // Stripe event times have one-second precision and delivery is unordered.
        // On an equal-second collision, project the provider's current object
        // instead of guessing which event snapshot is newer.
        canonicalSubscription = await stripeClient().subscriptions.retrieve(
          subscription.id,
        );
      }
      const canonicalGrantsEntitlement =
        Boolean(expectedPriceId) &&
        (canonicalSubscription.status === "active" ||
          canonicalSubscription.status === "trialing") &&
        subscriptionMatchesExpectedProduct({
          subscription: canonicalSubscription,
          customer,
          userId,
          priceId: expectedPriceId ?? "",
        });
      if (!canonicalGrantsEntitlement) {
        if (current.stripe_subscription_id !== subscription.id) {
          return { replayed: false, projected: false };
        }
        const projected = await projectNonEntitlingSubscription(client, {
          userId,
          customer,
          subscription: canonicalSubscription,
          providerOccurredAt,
          deleted: input.event.type === "customer.subscription.deleted",
        });
        return { replayed: false, projected };
      }
      if (!expectedPriceId) {
        return { replayed: false, projected: false };
      }
      if (!grantsEntitlement) {
        // An equal-second non-entitling snapshot can race a current active
        // provider object. Verify the commercial contract before restoring it;
        // a throw rolls back the event insert so Stripe can retry.
        await assertFoundingBetaPrice(expectedPriceId);
      }
      const item = canonicalSubscription.items.data[0];
      const projected = await client.query(
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
            AND stripe_customer_id = $2
            AND (
              stripe_subscription_id IS NULL
              OR stripe_subscription_id = $3
            )
        `,
        [
          userId,
          customer,
          canonicalSubscription.id,
          item?.price.id ?? null,
          stripeStatus(canonicalSubscription.status),
          subscriptionPeriodEnd(canonicalSubscription),
          canonicalSubscription.cancel_at_period_end,
          providerOccurredAt,
        ],
      );
      return {
        replayed: false,
        projected: (projected.rowCount ?? 0) > 0,
      };
    }

    return { replayed: false, projected: false };
  });
}

export async function requirePaidGenerationAccess(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const config = getServerRuntimeConfig();
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
  try {
    configuredStripeRuntime();
  } catch {
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
  const expectedPriceId = process.env.STRIPE_PRICE_UGC_BETA?.trim() ?? null;
  if (!state.entitled || state.priceId !== expectedPriceId) {
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

export function installStripeClientForTests(client: StripeClient | null): void {
  testStripeClient = client;
}
