# Vixel KOC Studio Test Blueprint

## Target

- Main test environment: local production build, then Vercel production.
- Login/test account: not required for the local-first v1.
- Acceptance target: a new user can move from homepage to a saved KOC campaign, approve one creative route, create a stage plan, run provider-backed or demo-safe generation, review candidates, reload, and recover the same project.

## P0 Must Pass

- [ ] Deterministic install, typecheck, lint, unit tests, and production build.
- [ ] `/` communicates the product and opens the studio without a dead end.
- [ ] `/studio` creates and persists a project with a product brief.
- [ ] Product facts remain source-grounded; unsupported claims are visibly blocked.
- [ ] Creative Router returns `direct`, `guided`, or `planned` from typed inputs.
- [ ] Planned KOC flow produces five distinct hooks and an explicit decision gate.
- [ ] Plan uses stable stage/item IDs and separate planner/runtime state.
- [ ] Paid generation cannot run before exact-input approval.
- [ ] Provider submission uses server-only credentials and an idempotency key.
- [ ] Provider success can survive a failed materialization attempt without a second paid submission.
- [ ] Retry targets failed items only and preserves successful result references.
- [ ] Cancel creates a tombstone; late results remain protected candidates.
- [ ] Candidate adoption creates a receipt and does not mutate unrelated project state.
- [ ] Reload/return restores project, plan, jobs, candidates, and selected route.
- [ ] JSON export/import round-trips the versioned project.
- [ ] Vercel deployment serves `/`, `/studio`, and `/api/health`.

## P1 Should Pass

- [ ] Desktop at 1440px has one clear visual anchor and one primary CTA.
- [ ] Mobile at 390px has no horizontal overflow and all primary targets are at least 44px.
- [ ] Keyboard navigation and visible focus cover the main intake/review path.
- [ ] Reduced-motion preference disables nonessential motion.
- [ ] Empty, loading, error, cancelled, retrying, and offline states are understandable.
- [ ] Console is clean on homepage and studio core flow.
- [ ] No secret values appear in client bundles, page source, logs, or error messages.
- [ ] Security headers and safe cache rules are present.
- [ ] Image assets have dimensions, alt text, and modern formats where practical.
- [ ] The main route remains usable when NewAPI is unavailable by showing a clear, non-deceptive blocked/demo state.

## P2 Also Do

- [ ] Marketing metadata includes title, description, canonical, Open Graph, and Twitter/X cards.
- [ ] `robots.txt` and `sitemap.xml` are valid.
- [ ] Product, SoftwareApplication, FAQ, and Organization JSON-LD validate.
- [ ] AI-readable `/llms.txt` and source-backed workflow/FAQ pages exist.
- [ ] Evidence pack contains local and deployed screenshots plus command logs.
- [ ] Design baseline and final design audit record score changes.
- [ ] Repro and rollback notes are documented.

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
