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

## Decisions

### Application sessions after Supabase OTP

The browser requests and verifies OTP with Supabase, then exchanges the verified
access token for the application's signed, HTTP-only session. The exchange
validates the Supabase user server-side and clears browser Supabase persistence.
This keeps normal authorization compatible with the current server boundary and
avoids long-lived refresh tokens in browser storage. Direct Supabase browser
sessions were rejected because they would create a second authorization surface.

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

### Subscription configuration is external

The app references `STRIPE_PRICE_UGC_BETA`; it does not hard-code amount,
currency, or allowance. This lets the technical launch finish while the final
offer remains a deliberate commercial choice. Missing price or webhook
configuration disables Checkout rather than weakening entitlement checks.

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
4. Configure Supabase custom SMTP/OTP, Turnstile, Resend, and Stripe secrets in
   Preview; verify waitlist, OTP, admin, email, and webhook paths.
5. Promote the same commit to Production and repeat safe smoke checks.
6. Enable account/cloud readiness, then billing. Enable live generation last
   only after an authorized paid-media smoke and recovery check.

Rollback disables the relevant readiness flag first. Additive tables remain for
forensics; provider webhooks continue returning verified success while
projection is paused. Reverting the application commit does not delete user,
delivery, audit, or billing records.

## Open Questions

- Final recurring price, currency, included allowance, and overage policy.
- Initial admin Supabase user ID.
- Final lifecycle sender display names and reply-to mailbox.
