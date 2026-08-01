## Context

The current Next.js application uses a shared access code, a signed HTTP-only
session, IndexedDB campaign state, and a server-only Postgres paid-generation
ledger. It already enforces approval, revision, quota, durable-recording, and
recovery invariants. The launch adds customer identity and commercial state
across Supabase, Resend, Cloudflare, Stripe, and Vercel.

The dedicated `vixel-ugc` Supabase project is the canonical application
database. `ugc.vixelai.com` remains the production origin. GitHub `main`
remains the only production source.

## Goals / Non-Goals

**Goals:**

- Replace shared-code customer access with email OTP and account status.
- Keep authorization, cloud persistence, email, billing, and paid generation
  server-owned and auditable.
- Make public waitlist entry resilient, private, idempotent, and useful to an
  operator.
- Use provider webhooks as inputs to replay-safe application projections.
- Preserve the existing paid-media safety boundary.

**Non-Goals:**

- Realtime collaboration or organization/team workspaces.
- Automated marketing campaigns or social publishing.
- Client-direct database mutation.
- Reusing another Vixel product's database or subscription ledger.
- Enabling live paid generation before provider and recovery proofs pass.
- Adding Google or another social identity provider during private beta.
- Copying Growth OS outreach, calendar, inbox, or content execution into this
  product's operator console.

## Decisions

### Application sessions after Supabase OTP

The browser requests and verifies OTP with Supabase, then exchanges the verified
access token for the application's signed, HTTP-only session. The exchange
validates the Supabase user server-side and clears browser Supabase persistence.
This keeps normal authorization compatible with the current server boundary and
avoids long-lived refresh tokens in browser storage. Direct Supabase browser
sessions were rejected because they would create a second authorization surface.

Supabase Auth owns OTP-request CAPTCHA enforcement. The application forwards the
single-use Cloudflare Turnstile token to `signInWithOtp` without first redeeming
it through Siteverify, and CAPTCHA protection is enabled on the Supabase Auth
project. This also protects the public Auth endpoint from clients that bypass the
application route. Waitlist submissions remain application-owned and therefore
continue to use application-side Siteverify with strict hostname and action
checks.

Private beta uses email OTP only. A future OAuth provider must exchange into the
same Supabase user identity, call the same account-profile boundary, and issue
the same application cookie. Provider-specific identity, email metadata, or a
second session system MUST NOT become an authorization key.

### Private application schema and repository-only access

Application tables live in `vixel_ugc`; paid generation remains in
`vixel_koc`. A restricted login role receives statement-level grants needed by
server repositories. No browser client queries these tables. Public-schema RLS
was considered, but a private schema plus server routes is a smaller, easier to
audit exposure surface for this beta.

### Account identity is the ownership key

Supabase `auth.users.id` is referenced as the durable owner. Email remains
contact/display data and is not an authorization key. Existing recovery
identity remains available only for temporary access-code sessions.

### Waitlist and email use database outbox semantics

Waitlist mutations, consent changes, invitations, and delivery jobs commit in
one transaction. Workers claim delivery rows atomically and use deterministic
provider idempotency keys. This avoids state/email drift and supports retries.
Sending email inline from request handlers was rejected because provider
timeouts make partial completion likely.

### Provider events are replay-safe projections

Raw Stripe and Resend webhook bodies are verified by official libraries before
processing. Provider event IDs are unique. A transaction records the event and
projects subscription or suppression state once. Replays return success without
reapplying side effects.

### Subscription price is an explicit product contract

The Founding Beta offer is USD $39 billed monthly. The app references the
deployment-specific `STRIPE_PRICE_UGC_BETA`, then retrieves that price from
Stripe and verifies the active status, amount, currency, monthly interval, and
licensed usage type before creating a customer or Checkout session. Missing or
drifted price and webhook configuration disables Checkout rather than weakening
entitlement checks.

Stripe mode follows deployment identity rather than Next.js build mode.
`VERCEL_ENV=production` requires live Stripe resources. Vercel Preview and
Development, custom or unknown targets, and a non-Vercel local process with no
`VERCEL_ENV` all require test resources, including when a local production
build sets `NODE_ENV=production`. This safe default prevents a local build or
Preview branch from charging live customers. The server rejects a secret-key
prefix, retrieved Price `livemode`, or incoming webhook Event `livemode` that
does not match the expected deployment mode before Checkout side effects or
webhook projection. Stripe webhook signing secrets do not encode mode, so the
verified Event's `livemode` is still checked explicitly against the secret-key
and deployment contract.

Webhook entitlement is asymmetric and fail-closed. An active or trialing event
can grant or restore access only after the configured Price and expanded Product
pass the complete provider contract. A bound subscription that becomes
past-due, canceled, deleted, or drifts in price, quantity, or metadata clears
the local price entitlement while retaining the customer/subscription binding
for billing management and a later valid recovery event. These revocations do
not depend on a healthy Price lookup. Provider verification failures on a
potential grant roll back the event-ledger insert so Stripe can retry rather
than permanently deduping an unverified grant.

Webhook projection grants entitlement only when the event belongs to the
configured Founding Beta price, both the product and price carry the
`product=vixel-ugc` metadata contract, the subscription contains exactly one
licensed item with quantity one, and the customer is locally bound. Checkout
does not create a second open flow or subscription for the same account.

### Product-owned operator console

The UGC operator console owns admissions, account status, the two-role
permission model, subscription/generation summaries, a read-only product funnel,
readiness, and audit evidence. It does not execute Growth OS campaigns. Account
status and roles remain server-owned; sensitive changes require an actor, a
meaningful reason, previous/next state, and last-admin protection. Metrics name
their data source and generation time, and unavailable inputs never render as
zero. The activation funnel places active entitlement before first paid
generation and counts the final generation stage only within the currently
entitled cohort.

### Public composer is a safe intent capture

The first viewport contains one dominant composer and format examples, inspired
structurally by the supplied reference while retaining Vixel visual language.
Unauthenticated input can be carried into waitlist/account onboarding, but no
generation route accepts it until approval, entitlement, and existing ledger
gates succeed.

## Risks / Trade-offs

- [Email deliverability depends on DNS and provider reputation] → Use custom
  SMTP, purpose-named credentials, verified domains, explicit transactional
  senders, and production delivery tests.
- [Outbox processing adds operational complexity] → Keep a small state machine,
  deterministic keys, bounded retries, visible admin status, and a cron-safe
  worker.
- [Temporary dual access paths complicate sessions] → Mark the access-code path
  as recovery-only, isolate its identity type, and remove it after production
  account verification.
- [External webhooks can be delayed or reordered] → Treat the local projection
  as eventual, order by provider timestamps where meaningful, and reconcile
  from the provider before granting ambiguous entitlement.
- [Cloud campaign state can conflict across tabs] → Use revisions and reject
  stale writes with `409`, retaining a local recovery copy.
- [A single-user beta admin list can become brittle] → Authorize by immutable
  user ID in server-owned profile data, with environment bootstrap limited to
  initial setup.

## Migration Plan

1. Create and health-check the dedicated Supabase project.
2. Apply the existing paid-generation migrations, then account/email/billing
   migrations and restricted grants.
3. Deploy code with auth, email, billing, cloud persistence, and live generation
   readiness flags off.
4. Configure Supabase custom SMTP/OTP and Auth-level Turnstile, Resend, and Stripe secrets in
   Preview; verify waitlist, OTP, admin, email, and webhook paths.
5. Promote the same commit to Production and repeat safe smoke checks.
6. Enable account/cloud readiness, then billing. Enable live generation last
   only after an authorized paid-media smoke and recovery check.

Rollback disables the relevant readiness flag first. Additive tables remain for
forensics; provider webhooks continue returning verified success while
projection is paused. Reverting the application commit does not delete user,
delivery, audit, or billing records.

## Open Questions

- Included generation allowance and overage policy before live generation.

## Resolved launch identities

- The bootstrap operator is the approved `yummyym35@gmail.com` Supabase account,
  configured by immutable Supabase user ID; additional administrators are
  granted only after their own OTP verification.
- Lifecycle mail uses `hello@vixelai.com` only as the transactional
  sender/reply-to boundary for the private beta, not as the configured
  bootstrap administrator.
