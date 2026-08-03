# Add Production Run, Campaign Skills, and candidate reuse

## Why

The Studio has durable planning, candidates, jobs, approvals, and receipts, but those states are distributed across separate views. Users cannot see one coherent production narrative, and every Creative Brief currently follows the same planning posture. Existing candidates also cannot be explicitly reused as the next product or creator reference.

## What changes

- Add a persisted Campaign Skill with four bounded choices.
- Thread that skill through live and fallback Creative Brief planning.
- Add a Production Run view over real campaign, job, approval-readiness, and candidate state.
- Allow explicit image-candidate reuse as a product or creator reference with lineage and a receipt.

## Non-goals

- Public MCP/CLI, website building, social publishing, or arbitrary plugins.
- Multiple agents, a general chat transcript, or autonomous campaign mutation.
- New provider models, automatic provider routing, or production flag changes.
- Reusing video candidates, editing media, dubbing, or reframing in this slice.
- Fabricated performance metrics or fake progress.

## Outcome

The product reads as a coherent production console while preserving the existing source-truth, approval, entitlement, ledger, and recovery boundaries.
