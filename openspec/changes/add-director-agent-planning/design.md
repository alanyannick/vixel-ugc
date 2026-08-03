# Design

## Capability boundary

`ENABLE_LIVE_CREATIVE_BRIEF` controls text-provider planning. It requires account auth and a configured text provider, but it does not require Stripe, media generation, or the media ledger. `ENABLE_LIVE_GENERATION` continues to control paid image/video execution.

## Honest provenance

The Creative Brief response already identifies `live` or `fallback`. The campaign snapshot stores that value so reload, cloud recovery, export, and admin inspection preserve the truth. Demo campaigns use `demo`. The Routes surface labels this provenance, and fixed persona photography is labeled as illustrative casting reference imagery.

## Director agent

The Director endpoint accepts a compact, validated campaign summary and one bounded user request. A `ToolLoopAgent` has only two proposal tools:

1. recommend one existing hook/persona pair;
2. recommend one existing Studio view.

The server validates every returned identifier against the submitted campaign. The endpoint cannot call media APIs and does not write campaign state. The client shows the response and an explicit Apply action. Applying creates one campaign receipt and updates selections locally/cloud through the existing persistence path.

## Failure behavior

- Disabled or unready live planning continues to produce the disclosed deterministic Creative Brief template.
- A Director agent request returns a retryable service error when its capability is unavailable or the provider call fails; it never presents a template as an AI response.
- Paid media availability and approval UX remain unchanged.

## Interface thesis

The Studio remains a quiet production console. The campaign canvas is primary; Director is a narrow guided copilot. It offers one concise recommendation and one Apply action rather than a persistent chat transcript or autonomous workflow.
