import { siteConfig } from "@/lib/seo/site";

export const dynamic = "force-static";

const content = `# Vixel UGC

> Vixel UGC is an independently operated AI UGC Ad Studio. Its current workflow, UGC Campaign, turns source-backed product facts into reviewable creator ad plans and, when every deployment gate is ready, traceable media candidates.

Canonical site: ${siteConfig.url}

## Product hierarchy

- Product: Vixel UGC.
- Category: AI UGC Ad Studio.
- Current workflow: UGC Campaign.
- Engine: Creative Router.
- Release state: account-based private beta.
- Canonical web origin: ${siteConfig.url}.
- Readiness: account auth, cloud campaigns, billing, and live generation are reported independently by the deployment.

## What the product does

- Accepts product facts, audience, platform, goal, and reference roles.
- Produces five distinct creative hook routes and three creator personas.
- Routes work through Brief, conditional Assets, Production, and conditional Post.
- Requires one route choice before the plan advances.
- Requires explicit approval of the exact paid input before live generation.
- Supports 9:16 video plans with canonical 4, 6, or 8-second durations.
- Preserves provider results as immutable candidates with lineage.
- Records adoption and campaign mutations as receipts.
- Gives approved accounts account-scoped cloud campaign save, reload, and revision protection when cloud readiness passes.
- Keeps browser recovery and versioned JSON export/restore as recovery paths.
- Exposes pricing and Stripe-backed billing controls only when the deployment's account and billing configuration are ready.

## Product-truth policy

Product claims require a supplied source. Vixel separates visible facts, supported benefits, creator expression, and unsupported claims. Generated output cannot rewrite campaign truth. References have explicit product or creator roles.

## Paid-generation policy

Live generation requires an approved authenticated account, active subscription entitlement, a secure HTTPS provider, an isolated PostgreSQL ledger, a deployment flag, and a short-lived server signature tied to the canonical input, provider model, adapter build, signed recovery identity, and idempotency key. Changing prompt, model, references, aspect ratio, duration, or audio requires a new review. Ledger transitions use revision compare-and-set rules; ambiguous or stale submissions require reconciliation and are never automatically retried. Database-backed submission limits cap exposure. Deployment capability is disclosed by /api/health, whose product checks report account auth, cloud campaigns, billing, email, and live-generation readiness separately; unavailable or incomplete capabilities remain fail-closed.

## Primary pages

- Home: ${siteConfig.url}/
- UGC ad generator: ${siteConfig.url}/ugc-ad-generator
- AI video for product marketing: ${siteConfig.url}/ai-video-generator-for-product-marketing
- AI UGC guide: ${siteConfig.url}/what-is-ai-ugc
- UGC vs KOC guide: ${siteConfig.url}/guides/ugc-vs-koc
- Vixel app vs web studio comparison: ${siteConfig.url}/compare/vixel-ai-video-generator-app
- UGC workflow: ${siteConfig.url}/workflows/ugc-video
- Product truth standard: ${siteConfig.url}/product-truth
- UGC Campaign access: ${siteConfig.url}/access
- Private beta pricing: ${siteConfig.url}/pricing
- Beta waitlist: ${siteConfig.url}/waitlist
- FAQ: ${siteConfig.url}/faq
- Privacy: ${siteConfig.url}/privacy
- Terms: ${siteConfig.url}/terms

## Terminology

- AI UGC: creator-style advertising media produced with generative AI rather than filmed by a customer.
- UGC: the broader user-generated-content format whose visual language informs creator-style ads.
- KOC: a key opinion consumer; a consumer-scale creator framing products through credible experience, especially in Asian marketing contexts.
- Route: a distinct hook, persona, product action, and creative direction.
- Candidate: an immutable provider result awaiting review.
- Adoption: the explicit act of bringing a candidate into the campaign.
- Receipt: evidence of a campaign mutation or adoption.

## Non-goals

Vixel does not auto-publish social posts, serve as a general-purpose chat tool, invent product claims, present generated talent as a real customer endorsement, or silently adopt generated results.

## Brand clarification

Vixel UGC is an independently operated web product. It is not affiliated with, endorsed by, or operated by any third-party mobile app, App Store publisher, or similarly named service. The third-party Vixel AI Video Generator app is published by FENIX MOBILE YAZILIM A.S.; accounts, subscriptions, purchases, uploads, and support are not shared with that app.
`;

export function GET() {
  return new Response(content, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
