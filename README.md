# Vixel UGC Studio

Vixel UGC Studio turns grounded product references into reviewable AI UGC
campaigns: five hook routes, one explicit decision, a durable execution plan,
and protected image/video candidates.

## Production

The canonical production surface is
[ugc.vixelai.com](https://ugc.vixelai.com). The legacy
[vixel-koc.vercel.app](https://vixel-koc.vercel.app) origin permanently
redirects to the canonical host. Access credentials stay out of the
repository. Live paid generation remains fail-closed until the isolated
production database and deployment settings are ready.

See the checked-in [release evidence](./docs/evidence/README.md) for immutable
deployment metadata, sanitized API results, security headers, and desktop/mobile
screenshots.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The studio works in local-first demo mode without provider credentials. Live
generation is server-only and remains disabled until an authenticated access
gate, secure HTTPS NewAPI endpoint, isolated PostgreSQL ledger, and
`ENABLE_LIVE_GENERATION=true` are all configured.

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

- One visible Director with deterministic `direct | guided | planned` routing.
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
Veo video generation. Production paid media remains off until a dedicated
database is authorized, migrated, and bound to the deployment. The app fails
closed when any access, provider, approval, or ledger gate is missing.
Database setup must apply every file in `supabase/migrations/` in timestamp
order; the later hardening migration is required even when the base ledger
migration is already registered.

See [the product blueprint](./docs/PRODUCT_BLUEPRINT.md),
[the design system](./DESIGN.md), and
[the launch checklist](./VIXEL_KOC_LAUNCH_BLUEPRINT.md). The legacy
`vixel-koc-campaign` export identifier remains intentionally stable so existing
campaign files continue to import.
