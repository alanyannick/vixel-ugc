# Vixel UGC Studio Operations

## Reproduce locally

```bash
npm ci
cp .env.example .env.local
npm run check
npm run test:e2e
```

`npm run check` runs ESLint, TypeScript, all Vitest suites, and the production
Next.js build. The Playwright suite uses the installed Chrome channel and checks
the marketing and campaign-intake paths at desktop and mobile widths.

## PostgreSQL ledger integration gate

Pull requests run a PostgreSQL 17 service named `vixel_ledger_ci`. CI applies
all checked-in Supabase migrations in timestamp order as the local `postgres`
owner, creates a restricted `vixel_koc_ci_runtime` login, and grants it
membership in the
migration-owned `vixel_koc_runtime` capability role. The integration suite then
verifies:

- base-to-incremental migration upgrade with row preservation;
- concurrent claim idempotency against real unique constraints;
- monotonic compare-and-swap updates using the ledger `revision`;
- fail-closed behavior under selective restrictive-policy drift;
- owned list and lookup recovery paths;
- the checked-in table, RLS, index, role, and revision shape;
- runtime `SELECT`, `INSERT`, and `UPDATE`, plus denied `DELETE` and DDL.

The setup and test commands reject every database except the exact
`vixel_ledger_ci` database on `localhost`, `127.0.0.1`, or `::1`; the test also
requires the `vixel_koc_ci_runtime` login. This prevents an accidentally
inherited production URL from being used. Ordinary `npm test` leaves this suite
skipped. To reproduce it against an isolated local PostgreSQL 15+ instance:

```bash
LEDGER_TEST_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/vixel_ledger_ci \
LEDGER_TEST_RUNTIME_PASSWORD=vixel-ledger-ci-runtime-only \
npm run test:postgres-ledger:prepare

DATABASE_APP_URL=postgresql://vixel_koc_ci_runtime:vixel-ledger-ci-runtime-only@127.0.0.1:5432/vixel_ledger_ci \
LEDGER_TEST_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/vixel_ledger_ci \
npm run test:postgres-ledger
```

## Production capability gates

Planning mode is safe without a media provider. Paid generation remains
fail-closed until all of these are present:

1. `ENABLE_LIVE_GENERATION=true`
2. a strong `STUDIO_ACCESS_CODE` and `STUDIO_SESSION_SECRET`
3. an HTTPS `NEWAPI_BASE_URL` plus server-only `NEWAPI_API_KEY`
4. an explicitly isolated PostgreSQL `DATABASE_APP_URL` or `DATABASE_URL`

Every new paid submission claim is also protected by PostgreSQL transaction
advisory locks and UTC-day quotas. The default ceilings are 4 claims per
pseudonymous studio identity and 20 claims across the deployment per UTC day.
Override them with `PAID_SUBMISSION_DAILY_IDENTITY_LIMIT` (1–100) and
`PAID_SUBMISSION_DAILY_GLOBAL_LIMIT` (1–500). Missing, malformed, fractional,
zero, negative, or out-of-range values fail safely to the defaults; the
effective identity ceiling can never exceed the global ceiling.

Quota accounting includes every newly inserted ledger claim, regardless of its
eventual provider status, because an ambiguous or failed provider response may
still have incurred cost. Existing idempotency keys remain readable at the
limit and never invoke the provider again. A new claim at either limit returns
HTTP 429 before provider I/O. The UTC counters reset at 00:00 UTC. Keep the
global ceiling conservative: it is the database-level cost backstop if an
access code is disclosed, not a substitute for provider billing alerts.

Apply every SQL file in `supabase/migrations/` in timestamp order with an
owner/migration connection before the runtime starts. In particular, existing
databases that already applied
`20260730114500_create_media_generation_ledger.sql` must still apply
`20260730193000_harden_media_generation_ledger.sql`; the later migration adds
the compare-and-swap `revision` required by the runtime. Never edit or replay a
migration already recorded as applied. The application login must inherit the
migration-created `vixel_koc_runtime` capability role; it can select, insert,
and update the private ledger but cannot delete rows or run DDL. A release
operator must validate ownership and backup policy before enabling the flag.
The internal schema name remains stable for migration compatibility. Do not
reuse another product's database merely because credentials are locally
available.

Check `/api/health` after every environment change. Readiness is `503` when
access is incomplete or live generation is enabled without its provider or
ledger.

## Deploy

```bash
npx vercel --prod --skip-domain --scope alanyannicks-projects
```

The Vercel project is linked through the ignored `.vercel/project.json`. Never
commit `.env.local`, `.vercel`, provider keys, database URLs, access codes, or
private evidence.

Production smoke:

```bash
curl -I https://<production-origin>/
curl -fsS https://<production-origin>/api/health
curl -fsS https://<production-origin>/robots.txt
curl -fsS https://<production-origin>/sitemap.xml
curl -fsS https://<production-origin>/llms.txt
```

Then verify the access gate, campaign intake, five routes, two-stage paid-input
approval, stored plan, JSON export, mobile plan rail, and `/api/health` in a
real browser. Bind or promote `ugc.vixelai.com` only after the staged deployment
passes.

## Rollback

Vercel deployments are immutable. If a smoke test fails:

1. keep `ENABLE_LIVE_GENERATION=false`;
2. promote the last known-good deployment in the Vercel project;
3. verify `/api/health`, `/`, and `/studio`;
4. preserve media-ledger rows for reconciliation—do not delete or replay them;
5. investigate from a new branch and deployment.

An ambiguous `submit_unknown` ledger entry must never be retried automatically.
Reconcile it with the provider before a person approves a distinct new job.
