# Vixel Campaigns product launch

## Goal

Ship Vixel Campaigns as a production-ready, account-based beta on
`ugc.vixelai.com`: visitors can understand the product and join the waitlist,
approved users can authenticate with email OTP and keep work in the cloud,
operators can manage access and lifecycle state, and paid generation remains
protected by durable server-side entitlement and job ledgers.

The implementation follows the email/auth boundary in
`Vixel-AI/vixel-skill@52c8674`: Supabase Auth plus Resend SMTP for OTP, Resend
API for application-owned lifecycle email, explicit product-update consent,
and Cloudflare Turnstile on production OTP requests.

## Acceptance Criteria

### Public entry and waitlist

- The first viewport explains the UGC product, shows one dominant campaign
  composer, and exposes Pricing, Log in, and Join waitlist actions.
- A visitor can submit name, email, company/use case, expected volume, and
  optional product-update consent without signing in.
- A duplicate email updates the existing waitlist record rather than creating
  duplicate people or emails.
- A successful submission receives exactly one waitlist confirmation for the
  canonical event, even after retries.
- Product-update consent is off unless explicitly selected and is stored in the
  application database before any provider projection.
- Public submissions never start paid media work and cannot read waitlist data.

### Authentication and authorization

- Supabase sends a six-digit email OTP through custom SMTP.
- Production OTP requests require a valid Turnstile token.
- OTP verification creates an HTTP-only application session; Supabase tokens
  are not persisted in browser storage after exchange.
- Pending users see waitlist status, approved users enter Studio, and admins
  enter the operator surface.
- Invalid, expired, replayed, or cross-user sessions fail closed.
- The legacy access-code session remains an operator recovery path until the
  account launch has been proven in production.

### Cloud data

- Approved users can create, update, reload, and delete their own campaign
  snapshots across browsers.
- A user cannot read or modify another user's campaigns, waitlist record,
  billing state, generation jobs, or email preferences.
- Media generation uses a stable account identity for ledger ownership while
  preserving the existing revision, approval, quota, and recovery semantics.
- Browser code never receives database credentials, Supabase secret keys,
  Resend keys, Stripe keys, or webhook secrets.

### Admin

- An admin can list and filter waitlist entries, view a user detail, add an
  internal note, approve/reject an entry, and issue or revoke an invitation.
- Status transitions are validated, idempotent, and written to an audit log.
- Approval and reminder email jobs are created atomically with state changes.
- A non-admin receives `403` for every admin API, including direct URL access.

### Email lifecycle

- OTP delivery is owned only by Supabase Auth SMTP.
- Welcome, waitlist confirmation, approval/invite, and invite reminder email
  use deterministic idempotency keys and an application delivery ledger.
- Product-update subscribers are projected only after canonical consent exists.
- Verified Resend bounce, complaint, or suppression events force product-update
  opt-out; invalid webhook signatures have no effect.
- Reminder processing is cron-safe and does not resend within its cooldown.
- No broadcast endpoint sends immediately; any future broadcast tooling is
  draft-only and requires a separate explicit operator action.

### Billing and paid generation

- Approved users can start Stripe Checkout for the configured recurring beta
  price and open Stripe's billing portal for an existing customer.
- Checkout creation requires authentication, approval, a configured price, and
  a trusted server-side return URL.
- Stripe webhook fulfillment is signature-verified, replay-safe, and projects
  subscription state into the application database.
- Studio shows pending/active/past-due/canceled entitlement states without
  trusting client-supplied plan data.
- Live paid generation stays disabled unless provider credentials, subscription
  entitlement, durable database recording, and the existing approval gate all
  pass.

### Positive verification

- Unit tests cover waitlist normalization/upsert, consent, role/status gates,
  session exchange, email idempotency, reminder cooldown, Stripe event
  projection, and cloud campaign ownership.
- Integration tests exercise database uniqueness, privilege boundaries,
  transaction rollback, webhook replay, and admin audit events.
- Browser tests cover public waitlist, OTP UI contract, pending status,
  approved Studio, admin waitlist review, and billing state.
- A production-safe smoke proves public health, waitlist persistence, admin
  authorization, Turnstile presence, and fail-closed paid generation.

### Negative verification

- Malformed email, missing Turnstile, consent omission, invalid OTP, non-admin
  admin access, wrong campaign owner, forged Stripe/Resend webhooks, duplicate
  provider events, missing database credentials, and missing price each fail
  without partial state or secret leakage.
- Browser bundles and rendered HTML contain no private environment values.
- Database advisor checks show no unintended public exposure or missing RLS on
  exposed schemas.

## Path Boundaries

Allowed:

- `app/**`
- `components/**`
- `lib/**`
- `server/**`
- `supabase/migrations/**`
- `scripts/**`
- `tests/**`
- `.env.example`
- `README.md`
- `docs/**`
- `openspec/**`
- package manifests and test/build configuration

Do not modify:

- unrelated Vixel repositories except the four canonical workspace documents
  after this repository has shipped;
- generated `.next/**`, `playwright-report/**`, or `test-results/**`;
- production secrets or plaintext credential files;
- the existing paid-generation invariant except to add account entitlement in
  front of it;
- another Vixel product's user, subscription, or email tables.

## Feasibility

- The current app already has signed HTTP-only sessions, a server-only Postgres
  connection, durable paid-media job recording, revision conflict checks,
  recovery receipts, and Playwright/Vitest coverage.
- A dedicated Supabase project isolates account and billing data from other
  Vixel products while allowing the existing `pg` server boundary to remain.
- The existing Vercel project is linked to GitHub `main`; Preview can verify
  migrations and env configuration before Production.
- Cloudflare, Supabase, Resend, Stripe, GitHub, and Vercel accounts already
  exist. Provider-side setup may still require dashboard authentication or a
  human CAPTCHA.
- A live Stripe price is a commercial decision. Code and schema can be fully
  implemented against `STRIPE_PRICE_UGC_BETA`; production Checkout remains
  fail-closed until the selected recurring price is configured.

## Dependencies

- `@supabase/supabase-js` pinned in the lockfile for OTP initiation and
  verification.
- `resend` pinned for application-owned transactional email.
- `svix` pinned for raw-body Resend webhook verification.
- `stripe` pinned for Checkout, billing portal, and webhook verification.
- Dedicated Supabase project `vixel-ugc` in `us-east-1`.
- Cloudflare Turnstile managed widget scoped to `ugc.vixelai.com`.
- Purpose-named Resend SMTP and lifecycle credentials.
- Stripe recurring price and webhook endpoint.
- Vercel Production/Preview environment variables and cron configuration.

## Task Breakdown

1. Record this plan and an OpenSpec change for the account launch.
2. Apply the existing paid-generation ledger migrations to the dedicated
   Supabase project.
3. Add account, waitlist, campaign cloud state, consent/delivery, subscription,
   provider-event, and audit migrations with private schemas and minimal grants.
4. Add typed environment validation, database repositories, stable account
   identity, and auth/session exchange.
5. Add public waitlist APIs and UI, status routing, Turnstile, OTP request and
   verification, and idempotent transactional email.
6. Add protected admin APIs and an operator UI for waitlist and user lifecycle.
7. Add cloud campaign persistence and preserve the local recovery/offline path.
8. Add Stripe Checkout, portal, webhook projection, and entitlement gates.
9. Recompose the public entry using the structural reference: persistent
   navigation, dominant composer, example formats, and clear account actions.
10. Configure provider resources and Vercel environments without exposing
    secrets.
11. Run static, unit, integration, browser, security-advisor, Preview, and
    Production smoke checks; fix failures before enabling paid generation.
12. Commit, push, deploy from `main`, and update canonical Vixel workspace docs.

## Claude-Codex Deliberation

No separate Claude review was requested. Codex reconciled the broad launch
request against the repository's existing paid-media safety invariants and the
referenced auth/email skill. The deliberate choices are:

- keep Supabase tokens short-lived in the verification exchange and use the
  app's signed HTTP-only session for normal product traffic;
- keep account/application tables private and expose behavior through
  authenticated server routes;
- separate OTP transport from lifecycle email and separate transactional email
  from product-update consent;
- project provider webhook state into server-owned ledgers before changing
  entitlement or consent;
- keep both billing and live generation fail-closed when commercial/provider
  configuration is incomplete;
- retain the access-code path as a temporary recovery mechanism, not as the
  primary customer experience.

## Pending User Decisions

These decisions do not block the secure implementation, but they do block a
fully live commercial checkout:

- final recurring price, currency, included monthly image/video allowance, and
  overage policy for `STRIPE_PRICE_UGC_BETA`;
- which first Supabase user ID should receive the `admin` role;
- the exact sender display names and reply-to mailbox for UGC lifecycle email.

Until those values are confirmed, the system uses explicit configuration,
shows a controlled unavailable state, and does not infer or silently reuse
another product's commercial identity.

## Implementation Notes

- Use `user_id` as the primary ownership key; email is display/contact data and
  must not be used as an authorization key.
- Place application tables in a private `vixel_ugc` schema. Grant the runtime
  role only the statements needed by server repositories.
- Store timestamps in UTC and provider payload identifiers with unique
  constraints for replay safety.
- Put email jobs and state transitions in the same database transaction.
- Use constant-time comparisons for signed application sessions and verified
  provider libraries for Stripe, Resend, and Turnstile.
- Never log OTPs, access/refresh tokens, database passwords, API keys, webhook
  signatures, full provider payloads, or raw user prompts containing secrets.
- Keep a kill switch for live generation and separate readiness switches for
  auth, lifecycle email, billing, and cloud persistence.
