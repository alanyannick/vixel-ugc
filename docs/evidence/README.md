# Vixel UGC Release Evidence

## Release identity

- Canonical URL: `https://ugc.vixelai.com`
- Vercel project: `alanyannicks-projects/vixel-koc`
- Verified deployment: `dpl_CVHfSRtiqYFCNQWR2tXeX9yWfPBB`
- Deployment state: `production / READY`
- Verified at: `2026-08-01 04:44 CST`
- Runtime source commit: `6186d29211703fc24f4099cb0a1fb2a3e72102c6`
- Application feature commit: `26f44f6d6fcf2e2d309b04ae0b0e0d6c8860172d`
- Pull requests: `alanyannick/vixel-ugc#9`, `alanyannick/vixel-ugc#10`

The deployment is public on the custom domain. The legacy
`vixel-koc.vercel.app` host returns a permanent redirect to the same path on
`ugc.vixelai.com`. No access code, session cookie, provider credential,
database value, or protection-bypass secret is stored in this evidence pack.

## Quality gates

```text
npm run check                                      PASS
  ESLint                                            PASS
  TypeScript                                        PASS
  Vitest                                            177 PASS / 4 SKIPPED
  Next.js production build                          41 routes PASS
npm run test:e2e                                    12/12 PASS
npm audit --omit=dev                                0 vulnerabilities
GitHub CI / verify                                  PASS (2m10s)
Vercel Preview and Production builds                PASS
production Chrome Studio inspection                 PASS
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
waitlist=ready
accountAuth=ready
cloudCampaigns=ready
lifecycleEmail=ready
billing=disabled
productDatabase=ready
studioAccess=ready
provider=ready
ledger=ready
liveGeneration=disabled
databaseConfigured=true
providerConfigured=true
providerTransportSecure=true
commit=6186d29211703fc24f4099cb0a1fb2a3e72102c6
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

The dedicated UGC database is connected and the runtime boundary is healthy.
RLS is enabled and forced on the product tables; the application role can
select, insert, and update campaign snapshots but cannot physically delete
them. `ENABLE_LIVE_GENERATION=false` and billing remains disabled, so this is a
fail-closed planning release: the control plane is implemented and tested, but
this evidence does not claim a successful Stripe checkout or live production
image/video spend. A real public Turnstile success remains a manual owner smoke
test because CAPTCHA completion was not bypassed during automation.
