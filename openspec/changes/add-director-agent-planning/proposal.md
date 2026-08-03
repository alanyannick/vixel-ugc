# Add bounded Director agent planning

## Why

The Studio currently couples Creative Brief generation to the paid media flag. Production therefore returns the deterministic fallback even when the text provider is configured, and the UI does not clearly disclose whether a brief came from AI or a template. The existing Director panel is also a static status panel rather than a campaign-aware assistant.

## What changes

- Add an independently gated live Creative Brief capability.
- Persist and display whether a brief came from live AI, the deterministic template, or demo data.
- Add one bounded Director agent that can recommend an existing hook/persona pair and a next Studio view.
- Require an explicit user action before a Director recommendation changes campaign state.
- Keep paid media submission, approval, billing, entitlement, ledger, and recovery logic unchanged.

## Non-goals

- Scraping or ingesting arbitrary product URLs.
- Multiple visible agents or a general-purpose chat surface.
- Letting an agent generate paid media, mutate campaign state, approve spend, or bypass entitlement checks.
- Enabling production feature flags as part of this code change.

## Rollout

Ship with `ENABLE_LIVE_CREATIVE_BRIEF=false`. After deployment health and authenticated planning tests pass, operators may enable it independently from `ENABLE_LIVE_GENERATION`.
