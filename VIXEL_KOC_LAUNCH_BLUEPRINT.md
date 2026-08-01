# Vixel Campaigns Launch Blueprint

## Goal

- Current stack: Next.js 16, React 19, TypeScript, browser IndexedDB,
  PostgreSQL-ready media ledger, NewAPI adapters, and Vercel.
- Target stack: a production-ready, account-based UGC campaign studio on Vercel.
- Primary test environment: local development and Vercel preview/production.
- Planned production environment: Vercel with server-only NewAPI media access.
- Product promise: turn a product reference into a grounded, reviewable UGC Campaign brief, creator anchor, shot plan, and generated campaign assets.

## Product Truth

The product is not a generic AI chat or an imitation of the MiniMax/Higgsfield brand.
It uses a single visible Director and a deterministic `direct | guided | planned`
router. Every paid or multi-stage workflow becomes a durable client-visible plan.
Generated results first become candidates and are only adopted into the project after
review.

The first production workflow is:

```text
Product intake
-> grounded product facts
-> five hook routes
-> one creator/persona decision
-> plan approval
-> optional creator/product anchors
-> shot and native-dialogue plan
-> image/video candidate generation
-> review and adoption
-> exportable campaign package
```

## Architecture Boundaries

- One visible Director; Router, Planner, and Executor are cognitive phases, not competing chat agents.
- Stable plan, stage, item, job, artifact, and receipt identifiers.
- Planner-owned fields and runtime-owned fields are updated through separate typed functions.
- Paid input changes invalidate approval and require a new exact-input signature.
- Provider success and local materialization are separate recoverable states.
- Late results survive cancellation as protected candidates and are never auto-adopted.
- Product facts, brand text, claims, price, efficacy, and specs may only come from user input or uploaded references.
- Browser-local storage is the first durable project store; provider secrets remain server-only.
- No external reference code, prompt, or brand asset is copied verbatim into the product.

## Provider Mapping

- Hosting: Vercel.
- Frontend: Next.js App Router, React, TypeScript.
- API runtime: Vercel Node functions through Next route handlers.
- Project persistence: browser IndexedDB/local-first repository for v1; export/import as JSON.
- Auth: HMAC-signed HttpOnly preview sessions with fail-closed access checks,
  origin/fetch-metadata validation, and best-effort login throttling.
- Media provider: NewAPI through server-only adapters.
- Paid control plane: short-lived exact-input HMAC approval plus a PostgreSQL
  unique submission ledger and session-owned recovery routes.
- Object storage: bounded provider data URLs or validated public HTTPS result
  URLs plus durable result claims. Dedicated object storage remains a follow-up.
- DNS/domain: Vercel project URL for first launch; custom domain is follow-up.

## Environment Inventory Categories

- App runtime: `NEXT_PUBLIC_SITE_URL`, `NODE_ENV`.
- Agent/text: `NEWAPI_BASE_URL`, `NEWAPI_API_KEY`, `NEWAPI_TEXT_MODEL`.
- Image: `NEWAPI_IMAGE_MODEL`.
- Video: `NEWAPI_VIDEO_MODEL`.
- Paid ledger: `DATABASE_APP_URL` or `DATABASE_URL`.
- Access: `STUDIO_ACCESS_CODE`, `STUDIO_SESSION_SECRET`.

## Launch Clusters

- [x] Cluster 1: Discovery and boundary scan
  - Evidence: empty target repository verified; report, KOC workflow, Higgsfield surface, and interactive-drama source tree inspected.
- [x] Cluster 2: Product and information architecture
  - Evidence: `docs/PRODUCT_BLUEPRINT.md`, `DESIGN.md`, typed domain contracts,
    route map, acceptance flow, and one-Director architecture.
- [x] Cluster 3: Runtime and deploy foundation
  - Evidence: deterministic lockfile; lint, typecheck, 62 tests, production
    build, Vercel project link, and environment inventory.
- [x] Cluster 4: Marketing and entry surface
  - Evidence: responsive homepage, original creator assets, direct Studio CTA,
    keyboard focus, reduced motion, and desktop/mobile browser QA.
- [x] Cluster 5: KOC workspace and creative router
  - Evidence: intake, deterministic router, five hooks, three personas, explicit
    decision, stored domain `ExecutionPlan`, candidates, receipts, and Director.
- [x] Cluster 6: Media provider and recovery
  - Evidence: server-only adapters, server-signed approval, PostgreSQL unique
    submit claim, `submit_unknown`, owned polling, result recovery routes, and
    mock tests. Live proof is intentionally blocked because the available
    NewAPI endpoint is plaintext HTTP and no isolated KOC database is approved.
- [x] Cluster 7: Project durability and export
  - Evidence: IndexedDB reload, versioned validated export/import, persisted
    plan/jobs/candidates, deterministic lineage, and server-ledger reconciliation.
- [x] Cluster 8: SEO/GEO and trust
  - Evidence: canonical metadata, OG image, sitemap, robots, JSON-LD,
    `/llms.txt`, workflow/FAQ/product-truth pages, privacy/terms, CSP/HSTS.
- [x] Cluster 9: Real-path validation and design loop
  - Evidence: independent design/security/architecture audits, 1440/390 browser
    checks, four Chrome E2E tests, clean lint/build, and fixed P0 findings.
- [x] Cluster 10: Vercel production deployment
  - Evidence: canonical production alias `https://vixel-koc.vercel.app`,
    immutable Vercel deployment recorded in `docs/evidence/README.md`, READY
    control-plane state, security headers, `/`, `/studio`, `/api/health`,
    metadata endpoints, authenticated five-hook/three-persona workflow smoke,
    and clean 1440/390 production browser passes.

## Explicit Non-goals for First Launch

- Multi-user realtime collaboration.
- Plugin marketplace or arbitrary third-party code execution.
- Direct provider keys in the browser.
- Automatic publishing to social networks.
- Claims inferred from product appearance.
- Full video editor/timeline.
- A second canonical mutation service.

## Completion Rule

- All P0 items in `VIXEL_KOC_TEST_BLUEPRINT.md` pass.
- Every required launch cluster is checked or has a smallest, explicit human-only blocker.
- Evidence is captured for local and deployed core paths.
- Final report records what passed, what failed, the deployed URL, and remaining risk.
