# Vixel KOC Studio Operations

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

## Production capability gates

Planning mode is safe without a media provider. Paid generation remains
fail-closed until all of these are present:

1. `ENABLE_LIVE_GENERATION=true`
2. a strong `STUDIO_ACCESS_CODE` and `STUDIO_SESSION_SECRET`
3. an HTTPS `NEWAPI_BASE_URL` plus server-only `NEWAPI_API_KEY`
4. an explicitly isolated PostgreSQL `DATABASE_APP_URL` or `DATABASE_URL`

The first paid-control-plane request creates the namespaced
`vixel_media_generation_ledger` table and its unique indexes. A release operator
must validate database ownership and backup policy before enabling the flag.
Do not reuse another product's database merely because credentials are locally
available.

Check `/api/health` after every environment change. Readiness is `503` when
access is incomplete or live generation is enabled without its provider or
ledger.

## Deploy

```bash
npx vercel --prod --yes
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

Then verify the access gate, campaign intake, five routes, stored plan, JSON
export, mobile plan rail, and paid-generation disabled message in a real browser.

## Rollback

Vercel deployments are immutable. If a smoke test fails:

1. keep `ENABLE_LIVE_GENERATION=false`;
2. promote the last known-good deployment in the Vercel project;
3. verify `/api/health`, `/`, and `/studio`;
4. preserve media-ledger rows for reconciliation—do not delete or replay them;
5. investigate from a new branch and deployment.

An ambiguous `submit_unknown` ledger entry must never be retried automatically.
Reconcile it with the provider before a person approves a distinct new job.
