# Vixel KOC Studio Test Blueprint

## Target

- Main test environment: local production build, then Vercel production.
- Login/test account: production uses the private-preview access code; local
  planning does not require it.
- Acceptance target: a new user can move from homepage to a saved KOC campaign, approve one creative route, create a stage plan, run provider-backed or demo-safe generation, review candidates, reload, and recover the same project.

## P0 Must Pass

- [x] Deterministic install, typecheck, lint, unit tests, and production build.
- [x] `/` communicates the product and opens the studio without a dead end.
- [x] `/studio` creates and persists a project with a product brief.
- [x] Product facts remain source-grounded; hook claim text must cite a supplied `factId`.
- [x] Creative Router returns `direct`, `guided`, or `planned` from typed inputs.
- [x] Planned KOC flow produces five distinct hooks and an explicit decision gate.
- [x] Stored domain plan uses stable stage/item IDs and separate planner/runtime state.
- [x] Paid generation requires a current server-signed exact-input approval.
- [x] Provider submission uses server-only credentials and a ledger-bound idempotency key.
- [x] Provider results are claimed in PostgreSQL before client materialization and
  can be recovered through session-owned endpoints without another paid submit.
- [x] Domain retry targets failed items only and preserves successful references;
  ambiguous provider submit is never automatically retried.
- [ ] Cancel creates a tombstone; late results remain protected candidates.
  - Implemented and unit-tested in the domain state machine, but provider
    cancellation is not exposed in the hosted preview while live generation is off.
- [x] Candidate adoption creates a receipt and does not mutate unrelated candidate kinds.
- [x] Reload/return restores project, plan, jobs, candidates, and selected route.
- [x] JSON export/import round-trips the versioned project.
- [x] Vercel deployment serves `/`, `/studio`, and `/api/health`.

## P1 Should Pass

- [x] Desktop at 1440px has one clear visual anchor and one primary CTA.
- [x] Mobile at 390px has no horizontal overflow and primary targets are at least 44px.
- [x] Keyboard navigation and visible focus cover the main intake/review path.
- [x] Reduced-motion preference disables nonessential motion.
- [x] Empty, loading, error, provider-disabled, and offline states are understandable.
- [x] Console is clean on homepage and studio core flow.
- [x] No secret values appear in client bundles, page source, logs, or error messages.
- [x] Security headers and safe cache rules are present.
- [x] Image assets have dimensions, alt text, and WebP alternatives.
- [x] The main route remains usable when NewAPI is unavailable and discloses the blocked state.

## P2 Also Do

- [x] Marketing metadata includes title, description, canonical, Open Graph, and Twitter/X cards.
- [x] `robots.txt` and `sitemap.xml` are valid.
- [x] Product, SoftwareApplication, FAQ, and Organization JSON-LD validate.
- [x] AI-readable `/llms.txt` and source-backed workflow/FAQ pages exist.
- [x] Evidence pack contains local and deployed screenshots plus command logs.
  - Evidence: `docs/evidence/README.md`, four local screenshots, four production
    screenshots, and the sanitized production `qa-results.json`.
- [x] Design baseline and final design audit record the B baseline and P1/P2 fixes.
- [x] Repro and rollback notes are documented in `docs/OPERATIONS.md`.

## Evidence Requirements

- Command outputs for install, lint, typecheck, tests, and build.
- Browser screenshots for homepage and the studio at desktop and mobile widths.
- API response samples with secrets removed.
- At least one test proving approval invalidation and one proving provider-result recovery.
- Deployment URL, timestamp, response status, and Vercel headers.
- Source inspection showing provider keys are referenced only from server modules.

## Completion Rule

Only finish when every P0 item is checked or the smallest non-resolvable blocker is
recorded next to the item with the exact evidence still missing.
