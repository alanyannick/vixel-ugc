# Vixel Campaigns product launch runbook

This runbook covers the public waitlist, account access, lifecycle email,
cloud campaigns, recurring billing, and paid-generation release gates for
`ugc.vixelai.com`.

## Release posture

Every product capability has an explicit environment switch and validates its
required provider configuration at runtime. Keep a switch `false` until the
corresponding provider proof below passes:

| Capability | Switch | Production prerequisites |
| --- | --- | --- |
| Base session and operator recovery | Always required in production | strong access code and session secret |
| Public waitlist | `ENABLE_PUBLIC_WAITLIST` | app database, scoped Turnstile widget |
| Account OTP | `ENABLE_ACCOUNT_AUTH` | waitlist prerequisites, Supabase URL and keys, verified custom SMTP |
| AI Creative Brief and Director | `ENABLE_LIVE_CREATIVE_BRIEF` | account auth, HTTPS text provider |
| Cloud campaigns | `ENABLE_CLOUD_CAMPAIGNS` | account auth, product database grants |
| Lifecycle email | `ENABLE_LIFECYCLE_EMAIL` | Resend API key, verified sender, webhook secret, cron secret |
| Billing | `ENABLE_BILLING` | Stripe live secret, recurring price, verified webhook |
| Paid generation | `ENABLE_LIVE_GENERATION` | approved account, cloud recovery, active billing entitlement, provider, exact-input approval, ledger, quota, and runtime-health proofs |

The public waitlist may launch independently. Product updates are optional and
default off. Joining the waitlist must not create a subscription or trigger
paid generation.

## Provider setup

### Supabase

1. Use project `vixel-ugc` and apply every committed migration in order.
2. Use a non-owner application login through the IPv4 shared transaction
   pooler (`aws-[region].pooler.supabase.com:6543`) for Vercel. The login must
   inherit `vixel_ugc_runtime` and `vixel_koc_runtime` and must not have
   superuser, `BYPASSRLS`, schema `CREATE`, or broad `DELETE`. With
   node-postgres 8.22+, append
   `?sslmode=require&uselibpqcompat=true` unless a Supabase CA bundle is
   supplied separately; otherwise `sslmode=require` is interpreted as
   `verify-full` and the shared pooler's private CA chain is rejected.
3. Set the site URL to `https://ugc.vixelai.com` and allow the production and
   Vercel Preview callback patterns.
4. Configure custom SMTP with a dedicated Resend SMTP credential.
5. Keep the magic-link template on the six-digit `{{ .Token }}` flow.
6. Create the first account, then place its immutable Supabase user UUID in
   `ADMIN_USER_IDS`. Prefer the database-owned `app_role` after bootstrap.

### Resend

1. Verify a Vixel-owned sending domain and create a purpose-named transactional
   API key plus a separate Supabase SMTP credential.
2. Set the transactional sender, reply-to, product-update segment, and topic.
3. Register `/api/webhooks/resend` and store its signing secret.
4. Register only users with explicit product-update consent in the optional
   topic. Bounce and complaint events must suppress future sends.
5. Enable lifecycle email only after a waitlist confirmation, invite,
   idempotency replay, and webhook-signature smoke all pass.

### Stripe

1. Confirm the beta monthly price before creating the recurring live product.
2. Create a single recurring price and set `STRIPE_PRICE_UGC_BETA`.
3. Register `/api/webhooks/stripe` for Checkout and subscription lifecycle
   events, then store the live webhook signing secret.
4. Prove customer reuse, replay-safe event projection, cancellation, and the
   billing portal. Only `active` and `trialing` grant server-side entitlement.

### Vercel and Cloudflare

1. Keep Production and Preview environment variables separate and secret values
   server-only.
2. The Turnstile widget must allow `ugc.vixelai.com`; Preview verification uses
   an explicitly scoped test or preview hostname, never a wildcard production
   bypass.
3. The hourly lifecycle cron calls `/api/cron/lifecycle` and requires
   `CRON_SECRET`.
4. After each provider change, redeploy the same verified commit before smoke
   testing.

## Verification

Run locally:

```bash
npm run check
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test --workers=1
npx openspec validate launch-ugc-product --strict
```

Preview and Production smoke must verify:

1. `/api/health` reports database and intended feature readiness without
   exposing credentials.
2. A Turnstile-protected waitlist submission is idempotent.
3. OTP request and verification fail closed until custom SMTP is proven.
4. Non-admin accounts cannot access `/admin` or mutate waitlist state.
5. Email and Stripe webhooks reject missing, forged, and replayed signatures.
6. Paid media endpoints reject users without a current server-owned
   subscription entitlement.
7. A saved campaign recovers on a second session before live generation is
   enabled.

## Rollback

1. Disable the affected feature switch in Vercel first; paid generation should
   be the first switch turned off.
2. Redeploy the last known-good saved commit.
3. Revoke the affected provider key or webhook secret if exposure is suspected.
4. Preserve database rows and event ledgers for investigation; do not delete
   billing, delivery, audit, or generation records during rollback.
5. Database migrations are forward-only. Correct schema issues with a new
   migration rather than manually reverting production DDL.
