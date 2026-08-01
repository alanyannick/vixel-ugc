## ADDED Requirements

### Requirement: Approved recurring Checkout

The system SHALL create Stripe Checkout sessions only for authenticated,
approved users and the configured recurring beta price.

#### Scenario: Eligible user

- **WHEN** an approved user without an active subscription starts Checkout
- **THEN** the system creates or reuses the user's Stripe customer and returns a hosted Checkout URL

#### Scenario: Missing price

- **WHEN** the recurring price is not configured
- **THEN** the system returns a controlled unavailable result without creating a Checkout session

#### Scenario: Drifted price

- **WHEN** the configured Stripe price is not an active licensed USD $39 monthly price
- **THEN** the system fails closed before creating a customer or Checkout session

#### Scenario: Existing entitled subscription

- **WHEN** an active or trialing account starts Checkout again
- **THEN** the system returns a controlled already-subscribed result and does
  not create an overlapping subscription

#### Scenario: Existing open Checkout

- **WHEN** an account already has a usable Checkout flow that can create a
  subscription
- **THEN** the system reuses or rejects that flow and does not create another
  independently payable subscription

### Requirement: Replay-safe subscription projection

The system MUST verify Stripe webhook signatures and apply each provider event
at most once.

#### Scenario: Duplicate webhook

- **WHEN** Stripe retries an already recorded event
- **THEN** the system returns success without reapplying entitlement side effects

#### Scenario: Forged webhook

- **WHEN** the Stripe signature is invalid
- **THEN** the system rejects the event without changing subscription state

#### Scenario: Different price or customer

- **WHEN** a valid Stripe subscription event references a different price or a
  customer not bound to the target account
- **THEN** the system records the event for audit but does not grant or mutate
  entitlement

#### Scenario: Invalid product contract or quantity

- **WHEN** a subscription does not have the `product=vixel-ugc` metadata on the
  configured product/price or does not contain exactly one licensed item with
  quantity one
- **THEN** the system does not grant entitlement; if the customer and
  subscription are already bound, it clears the stale local price entitlement,
  otherwise it records and ignores the unrelated subscription

#### Scenario: Bound subscription degrades

- **WHEN** an already-bound subscription becomes past-due, canceled, deleted,
  or changes to a different price, quantity, or product metadata contract
- **THEN** the system advances the provider cursor and removes entitlement even
  when the configured Price is archived, drifted, or temporarily unavailable

#### Scenario: Provider contract unavailable before a grant

- **WHEN** an active or trialing event could grant entitlement but the
  configured Price and expanded Product cannot be verified against the full
  Founding Beta contract
- **THEN** the webhook returns a retryable failure and does not permanently
  record the event or grant entitlement

#### Scenario: Valid recovery after drift

- **WHEN** the same bound subscription later returns to the verified configured
  contract with a current provider event
- **THEN** the system may restore entitlement after full contract verification

### Requirement: Deployment-isolated Stripe mode

The system MUST derive Stripe live/test mode from deployment identity rather
than `NODE_ENV` and MUST fail closed when the secret key, Price, or webhook
Event belongs to a different mode.

#### Scenario: Vercel Production

- **WHEN** `VERCEL_ENV` is `production`
- **THEN** Checkout, billing management, webhook projection, and paid
  entitlement require a live secret key, live Price, and live webhook Event

#### Scenario: Vercel Preview or Development

- **WHEN** `VERCEL_ENV` is `preview` or `development`
- **THEN** billing accepts only test secret keys, test Prices, and test webhook
  Events and never creates or projects live commercial state

#### Scenario: Non-Vercel local production build

- **WHEN** `VERCEL_ENV` is absent even if `NODE_ENV` is `production`
- **THEN** billing safely defaults to test mode

#### Scenario: Mode mismatch

- **WHEN** the configured secret key prefix, retrieved Price `livemode`, or
  verified webhook Event `livemode` differs from the expected deployment mode
- **THEN** the system returns a controlled unavailable or invalid-event result
  before Checkout side effects or webhook projection

### Requirement: Server-owned entitlement

The system SHALL derive paid-generation entitlement from the server-side
subscription projection and explicit operational readiness.

#### Scenario: Active subscription

- **WHEN** an approved user has an active subscription and all generation gates pass
- **THEN** the existing paid-generation workflow may proceed

#### Scenario: Past-due or missing subscription

- **WHEN** subscription entitlement is absent, past due, or canceled
- **THEN** paid generation fails before provider work starts

### Requirement: Hosted billing management

The system SHALL let an authenticated user with a Stripe customer open a hosted
billing portal session.

#### Scenario: Existing customer

- **WHEN** an authenticated user requests billing management
- **THEN** the system returns a server-created portal URL scoped to that customer

#### Scenario: Product access is suspended

- **WHEN** a verified account with an existing Stripe customer is pending or
  suspended from product use
- **THEN** the system still allows billing status and hosted portal access so
  the customer can cancel or manage charges while Checkout and generation stay blocked
