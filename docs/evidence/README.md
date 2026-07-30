# Vixel UGC Release Evidence

## Release identity

- Canonical URL: `https://ugc.vixelai.com`
- Vercel project: `alanyannicks-projects/vixel-koc`
- Verified deployment: `dpl_BmdkYn8nvMgxBcJDkqrdRhDgHCQE`
- Deployment state: `production / READY`
- Verified at: `2026-07-30 23:58 CST`
- Runtime source commit: `4c78cc4bcb3a8b530b1e09cc0c82231a2828864d`
- Pull request: `alanyannick/vixel-ugc#1`

The deployment is public on the custom domain. The legacy
`vixel-koc.vercel.app` host returns a permanent redirect to the same path on
`ugc.vixelai.com`. No access code, session cookie, provider credential,
database value, or protection-bypass secret is stored in this evidence pack.

## Quality gates

```text
npm run check                                      PASS
  ESLint                                            PASS
  TypeScript                                        PASS
  Vitest                                            79/79 PASS
  Next.js production build                          28 routes PASS
npm run test:e2e                                    10/10 PASS
npm audit --omit=dev                                0 vulnerabilities
GitHub CI / verify                                  PASS
production acquisition + SEO Playwright smoke       8/8 PASS
```

The suite covers deterministic creative routing, durable execution-plan state,
4/6/8-second media contracts, two-stage exact-input approval, provider
normalization, idempotent submission ownership, recovery, export/import
compatibility, SEO surfaces, and desktop/mobile acquisition flows.

## Production HTTP and SEO smoke

```text
/                                      200
/ugc-ad-generator                      200
/what-is-ai-ugc                        200
/guides/ugc-vs-koc                     200
/workflows/ugc-video                   200
/product-truth                         200
/access                                200
/faq                                   200
/privacy                               200
/terms                                 200
/studio                                200 + noindex
/api/health                            200
/robots.txt                            200
/sitemap.xml                           200
/llms.txt                              200
/manifest.webmanifest                  200
/opengraph-image                       200
/workflows/koc-video                   308 -> /workflows/ugc-video
/pricing                               308 -> /access
vixel-koc.vercel.app/<path>            308 -> ugc.vixelai.com/<path>
```

The homepage exposes the exact category H1, a self-referencing canonical,
index/follow directives, Organization/WebSite/SoftwareApplication structured
data, and production Open Graph/Twitter metadata. Supporting pages expose
Article, FAQ, Breadcrumb, and HowTo data where appropriate. `robots.txt`,
`sitemap.xml`, and `llms.txt` all resolve against the canonical origin.

## Runtime and security smoke

The secret-free health response reports:

```text
status=ok
liveness=true
readiness=true
studioAccess=ready
provider=ready
ledger=not_required
liveGeneration=false
databaseConfigured=false
providerConfigured=true
providerTransportSecure=true
commit=4c78cc4bcb3a8b530b1e09cc0c82231a2828864d
```

Verified response policy:

- HSTS: `max-age=63072000; includeSubDomains; preload`
- CSP includes `connect-src 'self'`, `object-src 'none'`, and
  `frame-ancestors 'none'`
- COOP and CORP: `same-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- strict referrer and permissions policies

## Visual artifacts

The checked-in `local/` screenshots capture the current Vixel UGC acquisition
and Studio surfaces used for visual review. Files under `production/` other
than `qa-results.json` are retained as the pre-cutover KOC baseline for visual
regression history; they are not claimed as screenshots of the deployment
identified above.

## Deliberate production boundary

Direct HTTPS NewAPI canaries passed for text (`gpt-5.4-mini`), image generation
and editing (`gpt-image-2`), and Veo video generation. Those HTTPS provider
variables are now present on the public deployment, while
`ENABLE_LIVE_GENERATION=false` remains enforced until a dedicated Supabase
project is explicitly authorized, created, migrated, and bound to Vercel. This
is a fail-closed production boundary: the paid control plane is implemented
and tested, but this evidence does not claim live production spend or a
production ledger.
