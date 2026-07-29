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
generation is server-only and remains disabled until
`ENABLE_LIVE_GENERATION=true`, an access code, and NewAPI credentials are set.

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
- Stable plan/stage/item/job/artifact/receipt identifiers.
- Separate planner-owned and runtime-owned plan state.
- Exact-input approval before paid work.
- Provider success and candidate materialization are distinct states.
- Browser-local project durability with versioned JSON export.
- Server-only NewAPI adapters.

See [the product blueprint](./docs/PRODUCT_BLUEPRINT.md),
[the design system](./DESIGN.md), and
[the launch checklist](./VIXEL_KOC_LAUNCH_BLUEPRINT.md).

