# Vixel KOC Studio Launch Blueprint

## Goal

- Current stack: empty Git repository.
- Target stack: a production-ready, local-first KOC/UGC creative studio on Vercel.
- Primary test environment: local development and Vercel preview/production.
- Planned production environment: Vercel with server-only NewAPI media access.
- Product promise: turn a product reference into a grounded, reviewable KOC brief, creator anchor, shot plan, and generated campaign assets.

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
- Auth: deferred unless a safe existing Supabase project can be isolated without touching the drama product.
- Media provider: NewAPI through server-only adapters.
- Object storage: provider result URLs plus browser-local metadata for v1.
- DNS/domain: Vercel project URL for first launch; custom domain is follow-up.

## Environment Inventory Categories

- App runtime: `NEXT_PUBLIC_APP_URL`, `NODE_ENV`.
- Agent/text: `NEWAPI_BASE_URL`, `NEWAPI_API_KEY`, `NEWAPI_TEXT_MODEL`.
- Image: `NEWAPI_IMAGE_MODEL`.
- Video: `NEWAPI_VIDEO_MODEL`.
- Optional observability: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

## Launch Clusters

- [x] Cluster 1: Discovery and boundary scan
  - Evidence: empty target repository verified; report, KOC workflow, Higgsfield surface, and interactive-drama source tree inspected.
- [ ] Cluster 2: Product and information architecture
  - Required evidence: product blueprint, route map, data contracts, visual thesis, and acceptance flow.
- [ ] Cluster 3: Runtime and deploy foundation
  - Required evidence: deterministic install, typecheck, lint, tests, production build, Vercel config.
- [ ] Cluster 4: Marketing and entry surface
  - Required evidence: responsive homepage, real product composition, CTA path, accessibility and performance checks.
- [ ] Cluster 5: KOC workspace and creative router
  - Required evidence: intake, direct/guided/planned routes, five-hook brief, decision gate, plan surface, receipts.
- [ ] Cluster 6: Media provider and recovery
  - Required evidence: server-only NewAPI adapter, idempotency, task states, retry/cancel semantics, mock tests, at least one live provider proof when credentials work.
- [ ] Cluster 7: Project durability and export
  - Required evidence: reload persistence, versioned project schema, artifact candidates, adoption, JSON export/import.
- [ ] Cluster 8: SEO/GEO and trust
  - Required evidence: metadata, canonical, sitemap, robots, JSON-LD, AI-readable product/FAQ content, privacy/terms, security headers.
- [ ] Cluster 9: Real-path validation and design loop
  - Required evidence: desktop/mobile browser path, visual audit, console errors, accessibility, recovery and failure paths.
- [ ] Cluster 10: Vercel production deployment
  - Required evidence: deployment URL, response headers, `/`, `/studio`, `/api/health`, metadata and one core workflow smoke.

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

