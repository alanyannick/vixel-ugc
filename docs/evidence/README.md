# Vixel KOC Release Evidence

## Release identity

- Canonical URL: `https://vixel-koc.vercel.app`
- Vercel project: `viviantsao-3978s-projects/vixel-koc`
- Verified production deployment: `dpl_GXHZV4epJLWfPhLucjA9g28x4ucC`
- Deployment state: `production / READY`
- Verified at: `2026-07-30 03:39 CST`
- Runtime source commit: `fdde50b`

The CLI deployment has no connected Git remote, so `/api/health` reports a null
Git SHA. The immutable Vercel deployment ID and local source commit are paired
here instead. No access code, session cookie, provider credential, or database
value is stored in this evidence pack.

## Command gates

```text
npm run lint                                      PASS
npm run typecheck                                 PASS
npm run test                                      64/64 PASS
npm run build                                     PASS
npm run check                                     PASS
npm run test:e2e                                  4/4 PASS
npm audit --omit=dev                              0 vulnerabilities
vercel inspect https://vixel-koc.vercel.app       production / READY
```

The complete suite includes deterministic domain routing, CAS plan updates,
retry/cancel/late-result state, exact-input approvals, provider normalization,
request limits, access hardening, result recovery, and import/export coverage.

## Production HTTP and security smoke

```text
/                         200
/studio                   200
/api/health               200
/robots.txt               200
/sitemap.xml              200
/llms.txt                 200
/opengraph-image          200
/icon.svg                 200
unauthenticated /api/media/jobs                   401
authenticated planning-only /api/media/jobs       200, jobs=[], recovery=not_configured
```

Health was secret-free and returned:

```text
status=ok
liveness=true
readiness=true
studioAccess=ready
provider=disabled
ledger=not_required
liveGeneration=false
```

Verified response policy:

- HSTS: `max-age=63072000; includeSubDomains; preload`
- CSP includes `connect-src 'self'` and `object-src 'none'`
- COOP and CORP: `same-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- strict referrer and permissions policies

## Authenticated core workflow smoke

The private access gate returned an HttpOnly signed session. With that temporary
session, `/api/creative/brief` returned:

- mode `planned`
- provider `fallback`
- five distinct hook routes
- three creator personas
- both supplied product facts preserved
- nonempty scripts, descriptions, and grounding warnings

The media-approval endpoint returned HTTP 503
`live_generation_disabled` before database or provider I/O. No paid provider
request was made. Temporary cookie and response files were deleted after the
smoke.

## Browser matrix

The production QA matrix in
[`production/qa-results.json`](./production/qa-results.json) verifies:

- `/`, `/workflows/koc-video`, `/product-truth`, `/pricing`, and `/faq` at
  1440px and 390px
- no body-level horizontal overflow
- the Studio demo campaign, plan rail, Routes, Candidates, and Director
- mobile rail overflow and scroll snap
- all ten homepage view-timeline reveal targets
- `consoleErrors=[]`, `pageErrors=[]`, `requestFailures=[]`, and
  `httpErrors=[]`

### Local

- [Homepage · desktop](./local/homepage-desktop.png)
- [Homepage · 390px](./local/homepage-mobile-390.png)
- [Studio · desktop](./local/studio-desktop.png)
- [Studio · 390px](./local/studio-mobile-390.png)

### Production

- [Homepage · desktop](./production/homepage-desktop.png)
- [Homepage · 390px](./production/homepage-mobile-390.png)
- [Studio · desktop](./production/studio-desktop.png)
- [Studio · 390px](./production/studio-mobile-390.png)

## Deliberate production boundary

The available NewAPI source endpoint is plaintext HTTP and no explicitly
isolated KOC PostgreSQL database has been authorized. Production therefore
keeps `ENABLE_LIVE_GENERATION=false`. The paid control plane is implemented and
tested, but provider submit, ledger concurrency, provider cancellation, and
late-result recovery are not claimed as production-proven until those two
dependencies are supplied.
