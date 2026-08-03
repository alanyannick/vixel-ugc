# Vixel Campaigns

Vixel Campaigns is an AI Product-to-UGC Campaign Studio. It turns grounded
product references into reviewable UGC Campaigns: five hook routes, one
explicit decision, a durable execution plan, and protected image/video
candidates. The Creative Router keeps the workflow coherent while product
claims, paid inputs, and generated results remain inspectable.

## Production

The canonical production surface is
[ugc.vixelai.com](https://ugc.vixelai.com). The legacy
[vixel-koc.vercel.app](https://vixel-koc.vercel.app) origin permanently
redirects to the canonical host. Access credentials stay out of the
repository. Provider-backed features remain fail-closed unless their production
switches, credentials, database boundaries, and runtime checks are ready.

See the checked-in [release evidence](./docs/evidence/README.md) for immutable
deployment metadata, sanitized API results, security headers, and desktop/mobile
screenshots.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The Studio works in local-first demo mode without provider credentials. When
enabled, Supabase-backed accounts use email OTP and can save cloud campaigns;
the public waitlist is protected by Turnstile, lifecycle mail is sent through
the configured email provider, and recurring billing is managed through
Stripe. Each capability has its own configuration and feature gate.

Provider-backed Creative Briefs and the proposal-only Director use
`ENABLE_LIVE_CREATIVE_BRIEF=true`. This text-planning capability is independent
from paid media generation and still requires authenticated account access.

Live generation is server-only. A paid submission requires an approved
account, an active billing entitlement, exact-input approval, a secure server
session boundary, an HTTPS NewAPI endpoint, an isolated PostgreSQL ledger,
healthy runtime dependencies, and `ENABLE_LIVE_GENERATION=true`.

## Quality gates

```bash
npm run lint
npm run typecheck
npm run test
npm run test:postgres-ledger
npm run build
npm run test:e2e
```

The PostgreSQL integration command runs only against the guarded local
`vixel_ledger_ci` database prepared by
`npm run test:postgres-ledger:prepare`; normal unit tests skip it safely.

## Architecture

- One visible UGC Campaign workflow backed by a deterministic Creative Router
  with `direct | guided | planned` paths.
- Supabase email-OTP accounts and account-scoped cloud campaign snapshots.
- A Turnstile-protected waitlist, lifecycle email, and Stripe-hosted billing.
- A real domain `ExecutionPlan` in the Studio with stable stage/item IDs,
  revision checks, and separate planner/runtime state.
- Five-minute server-signed exact-input approval before paid work.
- PostgreSQL submission ledger with unique submit ownership, a signed
  browser-recovery identity, monotonic job transitions, and reload recovery
  endpoints.
- Provider success and candidate materialization are distinct states.
- Browser-local project durability with versioned JSON export.
- Server-only NewAPI adapters.

Direct HTTPS NewAPI canaries cover text, image generation, image editing, and
Veo video generation. Production paid media fails closed when the approved
account, billing entitlement, provider, approval, ledger, feature-flag, or
runtime-health gate is missing.
Database setup must apply every file in `supabase/migrations/` in timestamp
order; the later hardening migration is required even when the base ledger
migration is already registered.

See [the product blueprint](./docs/PRODUCT_BLUEPRINT.md),
[the design system](./DESIGN.md), and
[the launch checklist](./VIXEL_KOC_LAUNCH_BLUEPRINT.md). The legacy
`vixel-koc-campaign` export identifier remains intentionally stable so existing
campaign files continue to import.
