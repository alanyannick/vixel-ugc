## Why

Vixel Campaigns has a strong planning and paid-generation core, but it is still
gated by a shared access code and local browser state. The beta now needs a
safe customer entry, durable accounts and data, operator-controlled admission,
and subscription entitlement without weakening the existing paid-media
approval and recovery guarantees.

## What Changes

- Add passwordless email OTP accounts protected by Cloudflare Turnstile.
- Add a public, idempotent waitlist and an authenticated pending-user status
  experience.
- Add protected admin workflows for review, approval, invitations, notes,
  lifecycle state, unified account access, role changes, growth summaries,
  system readiness, and audit history.
- Persist approved users' campaign state in the dedicated cloud database.
- Add application-owned transactional email with consent, delivery, reminder,
  suppression, and webhook ledgers.
- Add Stripe recurring Checkout, billing portal, webhook projection, and
  server-owned subscription entitlement.
- Recompose the public entry around one campaign composer and clear account,
  pricing, and format-discovery paths.
- Preserve the shared access code as a temporary operator recovery path and
  keep paid generation fail-closed until every server-side gate passes.

## Capabilities

### New Capabilities

- `account-access`: Email OTP, application sessions, Turnstile, account status,
  and role-based route authorization.
- `waitlist-operations`: Public waitlist capture and protected admin review,
  status transition, invitation, note, and audit behavior.
- `cloud-campaigns`: User-owned cloud persistence for campaign snapshots and
  stable paid-generation ownership.
- `lifecycle-email`: Transactional delivery idempotency, consent projection,
  reminder scheduling, and verified provider-event handling.
- `subscription-entitlements`: Stripe Checkout, billing portal, webhook
  projection, and server-owned subscription gates.
- `product-entry`: Public product navigation, dominant composer, example
  formats, and account/pricing calls to action.
- `admin-operations`: Unified account operations, guarded role/status changes,
  product-owned growth summaries, readiness, and audit visibility.

### Modified Capabilities

None. This repository had no prior OpenSpec capabilities.

## Impact

- New database migrations and restricted runtime grants in the dedicated
  Supabase project.
- New public, authenticated, admin, provider-webhook, and cron API routes.
- New authentication, waitlist, admin, billing, and public-entry UI states.
- New pinned Supabase, Resend, Svix, and Stripe dependencies.
- New Cloudflare, Supabase, Resend, Stripe, and Vercel configuration.
- Stripe Preview/local deployments stay isolated in test mode while only
  Vercel Production can consume live keys, prices, and webhook events.
- Existing session, campaign state, and paid-generation code gains account and
  entitlement integration while retaining the current safety invariants.
- Private beta remains email-OTP-only; a future social provider must converge
  on the same Supabase identity and application session boundary.
