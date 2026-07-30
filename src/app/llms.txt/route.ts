import { siteConfig } from "@/lib/seo/site";

export const dynamic = "force-static";

const content = `# Vixel UGC Studio

> Vixel UGC Studio is a source-grounded AI UGC video generator for planning and producing creator-style product ads.

Canonical site: ${siteConfig.url}

## What the product does

- Accepts product facts, audience, platform, goal, and reference roles.
- Produces five distinct creative hook routes and three creator personas.
- Routes work through Brief, conditional Assets, Production, and conditional Post.
- Requires one route choice before the plan advances.
- Requires explicit approval of the exact paid input before live generation.
- Supports 9:16 video plans with canonical 4, 6, or 8-second durations.
- Preserves provider results as immutable candidates with lineage.
- Records adoption and campaign mutations as receipts.
- Supports browser-local campaign state plus JSON export and restore in the current beta.

## Product-truth policy

Product claims require a supplied source. Vixel separates visible facts, supported benefits, creator expression, and unsupported claims. Generated output cannot rewrite campaign truth. References have explicit product or creator roles.

## Paid-generation policy

Live generation requires a secure HTTPS provider, an isolated PostgreSQL ledger, an authenticated studio session, a deployment flag, and a short-lived server signature tied to the canonical input, provider model, adapter build, signed recovery identity, and idempotency key. Changing prompt, model, references, aspect ratio, duration, or audio requires a new review. Ledger transitions use revision compare-and-set rules; ambiguous or stale submissions require reconciliation and are never automatically retried. Database-backed submission limits cap exposure. Deployment capability is disclosed by /api/health, whose ledger check verifies a real connection, schema, RLS policy, and restricted runtime grants; unavailable or incomplete deployments remain fail-closed.

## Primary pages

- Home: ${siteConfig.url}/
- UGC ad generator: ${siteConfig.url}/ugc-ad-generator
- AI UGC guide: ${siteConfig.url}/what-is-ai-ugc
- UGC vs KOC guide: ${siteConfig.url}/guides/ugc-vs-koc
- UGC workflow: ${siteConfig.url}/workflows/ugc-video
- Product truth standard: ${siteConfig.url}/product-truth
- Studio access: ${siteConfig.url}/access
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

Vixel UGC Studio is an independently operated web product. It is not affiliated with third-party applications using a similar name.
`;

export function GET() {
  return new Response(content, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
