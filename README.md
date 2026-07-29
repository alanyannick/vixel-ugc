# Vixel KOC Studio

Vixel KOC Studio turns grounded product references into reviewable creator
campaigns: five hook routes, one explicit decision, a durable execution plan,
and protected image/video candidates.

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
npm run build
npm run test:e2e
```

## Architecture

- One visible Director with deterministic `direct | guided | planned` routing.
- A real domain `ExecutionPlan` in the Studio with stable stage/item IDs,
  revision checks, and separate planner/runtime state.
- Five-minute server-signed exact-input approval before paid work.
- PostgreSQL submission ledger with unique submit ownership, session-scoped
  video tasks, and reload recovery endpoints.
- Provider success and candidate materialization are distinct states.
- Browser-local project durability with versioned JSON export.
- Server-only NewAPI adapters.

The checked-in Vercel release is intentionally a protected planning preview:
paid generation remains off because the available NewAPI endpoint is plaintext
HTTP and no explicitly isolated KOC database has been authorized. The app
fails closed rather than sending a provider key or paid input over that link.

See [the product blueprint](./docs/PRODUCT_BLUEPRINT.md),
[the design system](./DESIGN.md), and
[the launch checklist](./VIXEL_KOC_LAUNCH_BLUEPRINT.md).
