# Vixel Campaigns — Next Steps

Updated: 2026-08-01

## Current release boundary

Vixel Campaigns is live as a **planning beta**. Public waitlist, email OTP
accounts, operator approval, cloud campaigns, lifecycle email, protected
Studio, grounded planning, recovery identity, Stripe billing integration, and
the paid-media control plane are shipped behind explicit feature gates. Live
paid generation remains deliberately disabled until an approved account has a
current billing entitlement and the provider, ledger, runtime-health, budget,
and paid end-to-end proofs below are complete.

## P0 — Make `main` the single production source

- [x] Keep the Vercel project `alanyannicks-projects/vixel-koc` connected to
  `alanyannick/vixel-ugc` with production branch `main`.
- [x] Verify a push to `main` creates a Vercel production deployment whose Git
  commit SHA matches GitHub `main`.
- [x] Keep `ugc.vixelai.com` assigned only to a verified production deployment.
- [x] Record deployment ID, commit SHA, health output, and rollback target in
  `docs/evidence/` for each release.
- [x] Require GitHub CI and Vercel build success before treating a release as
  production-ready.

## P0 — Authorize and provision the production ledger

The production Vixel Campaigns project and fee were explicitly approved and
provisioned.

- [x] Confirm the Supabase organization/project and the exact expected fee.
- [x] Create or approve a dedicated UGC database; do not reuse another product's
  schema merely because credentials are available.
- [x] Apply every migration in `supabase/migrations/` in timestamp order using
  an owner/migration connection.
- [x] Create the restricted runtime login and verify it has only schema usage
  plus `SELECT`, `INSERT`, and `UPDATE`; no `DELETE`, DDL, superuser,
  `BYPASSRLS`, role creation, or database creation.
- [x] Add `DATABASE_APP_URL` to the production runtime without exposing it to
  the browser; migration authority remains separate from the application.
- [x] Run the production readiness probe and confirm the exact table, indexes,
  policies, RLS, role membership, and revision contract.
- [ ] Add a separately isolated Preview database before running stateful Preview
  account or campaign tests; Preview must not mutate production user data.
- [ ] Document backup, retention, incident ownership, and restore procedure.

## P0 — Enable paid generation deliberately

- [x] Keep `ENABLE_LIVE_GENERATION=false` until every item in this section is
  complete.
- [x] Confirm NewAPI text, image generation, image edit, and video routes over
  HTTPS using the intended production models.
- [ ] Configure conservative provider budgets and alerts in addition to the
  database daily caps.
- [x] Verify the UI presents two distinct actions: lock/sign exact inputs, then
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

## P1 — Improve the core UGC Campaign workflow

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
- [ ] Expand plans, quotas, or credit models only after cost attribution and
  recovery semantics are reliable in production.
- [ ] Add templates/marketplace features only after repeated winning workflows
  emerge from customer data.
- [ ] Consider batch variants and automated optimization only after single-
  creative acceptance and retention targets are met.

## Release definition of done

A release is done only when its GitHub commit, successful CI run, Vercel
production deployment, canonical domain, health/readiness output, smoke tests,
and rollback target are all linked in one evidence record. Paid generation is a
separate launch decision and is not implied by merging code to `main`.
