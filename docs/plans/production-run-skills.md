# Production Run, Campaign Skills, and candidate reuse

## Goal Description

Extend the existing Vixel UGC campaign workspace with a focused production surface, four persisted planning skills, and traceable reuse of accepted image candidates. The result should make the real workflow easier to understand without widening the product into a general chat, website builder, public MCP server, or autonomous paid-generation agent.

## Acceptance Criteria

- AC-1: A campaign has one persisted Campaign Skill.
  - Positive Tests:
    - New campaigns default to Product Review.
    - Product Review, Problem to Demo, Founder Story, and Faceless Explainer survive local/cloud/export parsing.
    - Legacy snapshots without a skill load with the Product Review default.
  - Negative Tests:
    - Unknown skill identifiers fail campaign validation.

- AC-2: The selected Campaign Skill shapes Creative Brief generation honestly.
  - Positive Tests:
    - The client sends the selected skill to the Creative Brief endpoint.
    - Live prompt context and deterministic fallback both use skill-specific direction.
    - The Routes surface names the selected skill and the existing live/fallback/demo provenance.
  - Negative Tests:
    - Skill copy cannot add unsupported product facts or bypass grounding normalization.

- AC-3: Production Run exposes real campaign and job state without inventing execution.
  - Positive Tests:
    - The Studio navigation includes Production Run.
    - The surface shows selected hook/persona, exact planning/generation readiness, current image/video job state, and the best candidate preview.
    - A disabled deployment says generation is closed rather than showing a fake progress state.
  - Negative Tests:
    - No fabricated views, likes, virality score, provider success, or progress is rendered.

- AC-4: Reusing an image candidate is explicit and traceable.
  - Positive Tests:
    - A candidate action can select Product reference or Creator reference.
    - Reuse writes the candidate image into the chosen campaign reference field, records its candidate ID/role lineage, creates one receipt, and navigates to Product Sources.
    - The reused reference is visible in Sources and is included only when the user later approves generation.
  - Negative Tests:
    - Video candidates cannot be reused through this first-slice action.
    - Reuse does not invoke creative, image, video, approval, or billing APIs.
    - A missing/invalid candidate cannot be written as a reference.

- AC-5: Existing paid-generation boundaries remain unchanged.
  - Positive Tests:
    - Existing exact-input approval, entitlement, idempotency, ledger, and polling tests continue to pass.
    - Production Run delegates paid actions to the existing handlers.
  - Negative Tests:
    - Campaign Skills and Director tools have no paid-execution capability.

- AC-6: The feature remains usable at desktop and mobile sizes.
  - Positive Tests:
    - Desktop shows a stable narrative/result split with one dominant preview.
    - Mobile stacks the status narrative before the preview and retains navigation access.
    - Browser tests cover the planning-only and candidate-reuse paths.

## Path Boundaries

### Upper Bound

- Campaign state/schema migration with backward-compatible defaults.
- Creative Brief request/prompt/fallback changes for four skills.
- Studio navigation and Production Run UI.
- Image candidate reuse and receipts.
- Unit, build, and desktop/mobile browser tests.
- Repo-local plan, OpenSpec, and operator documentation.

### Lower Bound

- One persisted skill selector.
- One production state/preview surface.
- One traceable image reuse action.
- No provider or billing contract changes.

### Allowed Choices

- Can use existing React components, campaign store, Creative Brief endpoint, execution plan, candidate model, and CSS module.
- Can add small shared domain helpers and backward-compatible optional/defaulted fields.
- Cannot enable production billing or generation flags.
- Cannot add public MCP/CLI, arbitrary code execution, website generation, social posting, or autonomous paid execution.
- Cannot promote product-local behavior into `vixel-core-runtime`.

## Dependencies and Sequence

1. Persist Campaign Skill and reuse provenance.
2. Thread Campaign Skill through Creative Brief request, prompt, and fallback.
3. Add Production Run navigation and real-state projection.
4. Add image reuse actions and receipt behavior.
5. Verify old snapshots, planning-only behavior, desktop/mobile layout, and paid boundaries.

## Implementation Notes

- Use stable skill IDs, with product copy stored in one typed catalog.
- Treat candidate URLs/data URLs as existing provider results; do not fetch them server-side during reuse.
- Keep one canonical campaign writer so revision and cloud persistence remain intact.
- Show provider/model/signature as secondary metadata, never invented engagement metrics.
- The Production Run screen is a view over existing state, not a second workflow engine.
