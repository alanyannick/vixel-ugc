import { siteConfig } from "@/lib/seo/site";

export const dynamic = "force-static";

const content = `# Vixel KOC Studio

> Vixel KOC Studio is a source-grounded AI campaign workspace for planning and producing creator-native KOC and UGC product video.

Canonical site: ${siteConfig.url}

## What the product does

- Accepts product facts, audience, platform, goal, and reference roles.
- Produces five distinct creative hook routes and three creator personas.
- Routes work through Brief, conditional Assets, Production, and conditional Post.
- Requires one route choice before the plan advances.
- Requires explicit approval of the exact paid input before live generation.
- Preserves provider results as immutable candidates with lineage.
- Records adoption and campaign mutations as receipts.
- Supports browser-local campaign state plus JSON export and restore in the current preview.

## Product-truth policy

Product claims require a supplied source. Vixel separates visible facts, supported benefits, creator expression, and unsupported claims. Generated output cannot rewrite campaign truth. References have explicit product or creator roles.

## Paid-generation policy

Live generation requires a configured provider, an authenticated studio session, a deployment flag, and approval tied to a canonical input hash. Changing prompt, model, references, aspect ratio, duration, or audio invalidates the approval. Late results remain protected candidates and are not auto-adopted.

## Primary pages

- Home: ${siteConfig.url}/
- KOC workflow: ${siteConfig.url}/workflows/koc-video
- Product truth standard: ${siteConfig.url}/product-truth
- Studio access: ${siteConfig.url}/pricing
- FAQ: ${siteConfig.url}/faq
- Privacy: ${siteConfig.url}/privacy
- Terms: ${siteConfig.url}/terms

## Terminology

- KOC: creator content led by credible product experience and native platform expression.
- Route: a distinct hook, persona, product action, and creative direction.
- Candidate: an immutable provider result awaiting review.
- Adoption: the explicit act of bringing a candidate into the campaign.
- Receipt: evidence of a campaign mutation or adoption.

## Non-goals

Vixel does not auto-publish social posts, serve as a general-purpose chat tool, invent product claims, or silently adopt generated results.
`;

export function GET() {
  return new Response(content, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
