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

### Requirement: Replay-safe subscription projection
The system MUST verify Stripe webhook signatures and apply each provider event
at most once.

#### Scenario: Duplicate webhook
- **WHEN** Stripe retries an already recorded event
- **THEN** the system returns success without reapplying entitlement side effects

#### Scenario: Forged webhook
- **WHEN** the Stripe signature is invalid
- **THEN** the system rejects the event without changing subscription state

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
