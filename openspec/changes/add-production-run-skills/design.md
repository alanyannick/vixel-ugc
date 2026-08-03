# Design

## Campaign Skills

A typed repo-local catalog owns four stable skill IDs and their planning direction. Campaign snapshots persist the ID. Legacy snapshots default to Product Review. The skill is submitted with the Creative Brief request and shapes both the live model prompt and deterministic fallback, while supplied product facts remain immutable.

## Production Run

Production Run is a projection of canonical campaign state, not another orchestration engine. It reads the selected route, execution plan, jobs, candidates, and generation readiness. The left narrative communicates current decisions and real status; the right side presents the best available candidate or an honest empty state.

The view may call the existing navigation and generation handlers. It cannot submit provider work through a new path.

## Candidate reuse

Only an existing image candidate may be reused. The browser loads the already-renderable asset, validates the existing 1.2 MB image boundary, and normalizes it into the chosen campaign reference field. It also writes a compact lineage record containing candidate ID, role, provider, model, and input signature. One receipt records the reuse. No server fetch, generation request, or provider submission occurs.

Changing or uploading a reference manually clears stale reuse lineage for that role. Legacy snapshots default lineage to null.

## Safety

- Campaign Skill direction never becomes a product fact.
- Paid submission remains behind the existing exact-input approval and entitlement gate.
- Production Run renders no invented progress or analytics.
- Reuse is a campaign mutation through the existing writer and revision path.

## Interface thesis

The Studio remains a restrained production console. Production Run has one dominant media preview, a narrow evidence/status narrative, and one relevant next action. It does not reproduce a full chat surface.
