# App Store traffic strategy

Last verified: 2026-08-01

## The boundary

The iPhone app [Vixel - AI Video Generator](https://apps.apple.com/us/app/vixel-ai-video-generator/id6756965785)
is published by **FENIX MOBILE YAZILIM A.S.** It is not operated by Vixel
Campaigns, and the two products do not share accounts, subscriptions, purchases,
uploads, data, or support.

A website cannot rank inside App Store search. Apple says App Store discovery
uses an app's name, subtitle, keyword field, category, downloads, ratings, and
reviews. The website can only serve people who continue the search on the open
web or in an AI answer engine.

Sources:

- [Apple App Store search](https://developer.apple.com/app-store/search/)
- [Apple Ads keyword guidance](https://ads.apple.com/app-store/help/keywords/0014-add-and-manage-keywords)
- [App Store app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)

## Phase 1 — web spillover

Implemented public entry points:

- `/compare/vixel-ai-video-generator-app` — one factual brand-clarification
  page that links users to the correct product.
- `/ai-video-generator-for-product-marketing` — a non-brand task page for
  people moving from general AI video generation into product marketing.
- Existing `/ugc-ad-generator`, `/workflows/ugc-video`, `/product-truth`, and
  `/guides/ugc-vs-koc` pages — the high-intent cluster around the web studio's
  actual workflow.
- `/waitlist` and `/pricing` — the account-based private-beta conversion and
  commercial-information surfaces. Neither may imply that the third-party app
  account or subscription works here.

The comparison page must remain singular. Do not clone it into country,
pricing, login, download, refund, review, or support doorway pages. Do not use
the third-party app's icon, screenshots, reviews, prices, or App Store badge.
Do not describe Vixel Campaigns as the app's official web version.

The web product should describe its own capabilities precisely: approved
accounts can use account-scoped cloud campaign persistence when deployment
readiness passes, while browser recovery and JSON export remain fallbacks.
Billing and paid image/video submission are separate readiness-gated
capabilities and must remain visibly unavailable when configuration is
incomplete.

## Phase 2 — partner referral

The fastest legitimate route to traffic from the existing app is a commercial
partnership with FENIX MOBILE. A proposal could include:

- an in-app handoff from generated clips to a web UGC Campaign workflow;
- co-authored product-marketing templates;
- a tracked landing page owned by each party;
- clear account, billing, data, and support separation;
- a referral or revenue-share agreement.

No partner claim or cross-link should appear until both parties approve it in
writing.

## Phase 3 — a Vixel companion iOS app

To acquire App Store search traffic directly, Vixel Campaigns needs its own
useful iOS app under its own Apple Developer account. A narrow companion is
safer than reproducing the whole web product:

1. capture product references and approved facts on iPhone;
2. review Creative Router directions and scripts;
3. approve or reject campaign candidates;
4. deep-link into the account-based web workspace for full planning and
   delivery.

The app name, subtitle, screenshots, keywords, tags, and description must refer
only to its own functionality. Apple's organic keyword guidance says not to
use competing app names or unauthorized trademark terms. After launch, Apple
Ads can separate brand, category, competitor, and discovery campaigns, but ad
eligibility still depends on relevance and the destination remains the app's
App Store product page.

## Measurement

Track these query families separately in Search Console:

- name confusion: `vixel app`, `vixel ai video generator`, `vixel web`;
- category: `ai video generator for product marketing`, `ai ugc generator`;
- workflow: `ugc campaign planner`, `koc video campaign`, `product truth ads`.

Recommended events:

- `outbound_app_store` — user intentionally leaves for the third-party app;
- `compare_to_studio` — user chooses the independent web workflow;
- `waitlist_started` — user starts the private-beta application;
- `studio_start` — an approved user opens the campaign workspace;
- `campaign_brief_started` — a user begins a real campaign brief.

Success is not raw traffic from people seeking subscription support. It is the
share of correctly informed visitors who choose the web studio for its product
marketing workflow.

This document is a product and acquisition plan, not legal advice. Because the
two products use a similar name in an overlapping AI-video category, expanded
brand bidding or a mobile launch should receive a trademark and
likelihood-of-confusion review first.
