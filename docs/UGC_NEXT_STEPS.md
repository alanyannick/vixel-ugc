# Vixel UGC — Next Steps

Updated: 2026-07-31

## Current release boundary

Vixel UGC is live as a **planning beta**. The public acquisition surfaces,
protected Studio, grounded planning workflow, exact-input approval, recovery
identity, and paid-media ledger/control plane are shipped. Live paid generation
must remain disabled until the isolated production database and paid end-to-end
gates below are complete.

## P0 — Make `main` the single production source

- [ ] Keep the Vercel project `alanyannicks-projects/vixel-koc` connected to
  `alanyannick/vixel-ugc` with production branch `main`.
- [ ] Verify a push to `main` creates a Vercel production deployment whose Git
  commit SHA matches GitHub `main`.
- [ ] Keep `ugc.vixelai.com` assigned only to a verified production deployment.
- [ ] Record deployment ID, commit SHA, health output, and rollback target in
  `docs/evidence/` for each release.
- [ ] Require GitHub CI and Vercel build success before treating a release as
  production-ready.

## P0 — Authorize and provision the production ledger

This section requires an explicit owner decision before any paid resource is
created or reused.

- [ ] Confirm the Supabase organization/project and the exact expected fee.
- [ ] Create or approve a dedicated UGC database; do not reuse another product's
  schema merely because credentials are available.
- [ ] Apply every migration in `supabase/migrations/` in timestamp order using
  an owner/migration connection.
- [ ] Create the restricted runtime login and verify it has only schema usage
  plus `SELECT`, `INSERT`, and `UPDATE`; no `DELETE`, DDL, superuser,
  `BYPASSRLS`, role creation, or database creation.
- [ ] Add `DATABASE_APP_URL` and migration-only credentials to the correct
  Vercel environments without exposing them to the browser.
- [ ] Run the production readiness probe and confirm the exact table, indexes,
  policies, RLS, role membership, and revision contract.
- [ ] Document backup, retention, incident ownership, and restore procedure.

## P0 — Enable paid generation deliberately

- [ ] Keep `ENABLE_LIVE_GENERATION=false` until every item in this section is
  complete.
- [ ] Confirm NewAPI text, image generation, image edit, and video routes over
  HTTPS using the intended production models.
- [ ] Configure conservative provider budgets and alerts in addition to the
  database daily caps.
- [ ] Verify the UI presents two distinct actions: lock/sign exact inputs, then
  explicitly submit potentially billable work.
- [ ] Run one authorized paid image job and one authorized paid video job.
- [ ] Verify idempotent replay does not create a second provider request or
  consume another quota claim.
- [ ] Test refresh/recovery, late provider success, ambiguous submission,
  cancellation support, failed-only retry, and terminal-state immutability.
- [ ] Re-run `/api/health`, desktop/mobile E2E, security headers, secret scan,
  and rollback drill before setting `ENABLE_LIVE_GENERATION=true`.

## P1 — Prove activation and retention

- [ ] Define the activation event: a user imports product truth, selects a hook,
  approves a plan, and exports or generates a usable creative candidate.
- [ ] Instrument the funnel from landing route → Studio access → brief complete
  → plan approved → candidate/export delivered.
- [ ] Track time-to-first-plan, approval drop-off, generation success rate,
  recovery rate, cost per accepted candidate, and seven-day return rate.
- [ ] Add privacy-safe campaign/source attribution for TikTok, Reels, Shorts,
  Xiaohongshu, partner, and direct traffic.
- [ ] Establish weekly customer interviews and tag failure reasons by product
  truth, creative quality, workflow friction, provider failure, and price.

## P1 — Improve the core UGC workflow

- [ ] Add reusable brand/product truth profiles with claims, prohibited claims,
  audience, tone, offer, and required visual references.
- [ ] Make hook comparison faster: evidence, angle, expected audience response,
  and why each route differs.
- [ ] Add review states and comments for marketer/creator collaboration without
  exposing internal router/planner/executor machinery.
- [ ] Preserve source/reference lineage through script, shot plan, generated
  media, revision, and export.
- [ ] Provide platform-aware exports for TikTok, Reels, Shorts, and Xiaohongshu
  while keeping legacy `vixel-koc-campaign` import compatibility.
- [ ] Add explicit edit/regenerate controls that show which inputs change and
  whether a new action may incur cost.

## P1 — Acquisition, SEO, and content

- [ ] Publish high-intent examples for beauty, consumer electronics, food,
  fitness, mobile apps, and local services.
- [ ] Build comparison and workflow pages around real buyer questions rather
  than generic AI copy.
- [ ] Add sanitized, permissioned case studies with source product truth,
  selected hook, delivered asset, outcome, and limitations.
- [ ] Monitor indexed pages, canonical consistency, structured-data validity,
  branded/non-branded queries, and conversion by landing route.
- [ ] Run one acquisition experiment at a time with a predeclared success metric
  and decision date.

## P1 — Operations and observability

- [ ] Alert on health readiness changes, provider error bursts, ledger drift,
  quota exhaustion, stale submissions, and failed Vercel deployments.
- [ ] Build an operator view for request ID, approval digest, idempotency key,
  provider task, ledger revision, timestamps, and recovery status without
  exposing secrets or raw sensitive inputs.
- [ ] Add a reconciliation runbook for `submit_unknown` and
  `reconciliation_required`; never blindly resubmit an ambiguous paid request.
- [ ] Review dependency, secret, access-code, and provider-key rotation monthly.

## P2 — Scale only after repeated usage

- [ ] Add team workspaces, roles, and approvals after collaboration is observed
  in real customer behavior.
- [ ] Add billing/credits only after cost attribution and recovery semantics are
  reliable in production.
- [ ] Add templates/marketplace features only after repeated winning workflows
  emerge from customer data.
- [ ] Consider batch variants and automated optimization only after single-
  creative acceptance and retention targets are met.

## Release definition of done

A release is done only when its GitHub commit, successful CI run, Vercel
production deployment, canonical domain, health/readiness output, smoke tests,
and rollback target are all linked in one evidence record. Paid generation is a
separate launch decision and is not implied by merging code to `main`.