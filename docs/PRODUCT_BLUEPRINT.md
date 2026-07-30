# Vixel UGC Studio Product Blueprint

## 1. Product Definition

Vixel UGC Studio is an AI campaign workspace for teams that need creator-style
product videos without losing product truth, human credibility, or platform
native expression.

The product's job is not to generate a pretty clip from a prompt. It is to make
the decisions and evidence behind that clip inspectable:

```text
source
-> claim
-> hook
-> persona
-> approved input
-> provider job
-> candidate
-> adoption receipt
```

The first target user is a growth marketer, creative strategist, or founder
creating short AI UGC concepts for TikTok, Reels, Shorts, or Xiaohongshu. KOC
remains a secondary creative and distribution concept, not the product brand.

## 2. Product Bar

The first release is successful when a new user can:

1. Add a product name, visible facts, target audience, platform, and goal.
2. Receive five meaningfully different hook routes and three creator personas.
3. Pick one route in a single review moment.
4. Understand what will be generated, what it costs, and why it is paused.
5. Approve exact paid inputs.
6. Review generated candidates with their source and model lineage.
7. Reload or export the project without losing the plan or results.

Trust is more important than number of models. A finished video with an
invented claim is a product failure.

## 3. Core Information Architecture

```text
Public
├── Home
├── AI UGC workflow
├── What is AI UGC?
├── UGC vs KOC guide
├── Product truth guide
├── FAQ
├── Beta access
├── Privacy
└── Terms

Studio
├── Campaigns
├── New campaign
├── Campaign board
│   ├── Intake and sources
│   ├── Creative routes
│   ├── Plan/checkpoints
│   ├── Assets and candidates
│   └── Export
└── Access gate
```

## 4. Visible Product Model

The user sees one Director.

The Director chooses one of three internal paths:

- `direct`: safe, local, reversible operations such as renaming or export.
- `guided`: a small missing decision blocks trustworthy work.
- `planned`: multi-stage, paid, asynchronous, or approval-sensitive work.

Router, Planner, and Executor are not separate characters. They are typed
responsibilities behind one surface.

## 5. AI UGC Workflow

### Brief

Inputs:

- product name and category
- visible/source-backed product facts
- target audience and desired action
- platform and output language
- content form and duration
- reference images and their roles

Outputs:

- source ledger and unsupported-claim warnings
- five distinct hooks
- three personas when a person appears
- recommended duration, CTA, subtitle, and music choices
- one review gate

### Assets

Conditional. Required when the project lacks a trustworthy creator anchor,
product-in-context anchor, or try-on reference.

Outputs first become candidates. A creator anchor cannot enter Production until
the user accepts it.

### Production

Outputs:

- concrete first-three-seconds hook
- timed, word-for-word dialogue
- product action
- scene and shot direction
- native dialogue/sound path
- one continuous 4, 6, or 8-second clip
- actual media work items, not only a document

### Post

Conditional. Only added when deterministic trim/concat, opted-in subtitles,
CTA/logo, or music mix is required.

## 6. Canonical Data Boundaries

- Campaign owns product facts, decisions, accepted artifacts, and revision.
- The stored domain `ExecutionPlan` owns execution topology and runtime state;
  the Studio rail reads it directly.
- A PostgreSQL media-ledger job owns provider submission and recovery.
- Candidate owns immutable provider result and lineage.
- Receipt proves a mutation or adoption.
- Canonical campaign mutations pass through one client writer; paid submission
  mutations pass through the server ledger.

## 7. Safety and Spend

- Product claims require a source.
- Provider credentials never reach the browser.
- Live generation requires an authenticated studio session, explicit deployment
  flag, HTTPS provider, and isolated PostgreSQL ledger.
- Paid input approval is a short-lived server HMAC tied to the canonical input,
  session, provider model, and idempotency key.
- Changing prompt, model, references, ratio, duration, or audio invalidates the
  previous approval.
- Ambiguous provider submission is recorded as `submit_unknown` and never
  automatically retried.
- Cancel, failed-only retry, and protected late-result transitions are covered
  by the domain model and tests. Provider cancellation remains deployment
  dependent.

## 8. Non-goals

- social account posting
- arbitrary plugins or code execution
- multiple visible agents
- general-purpose chat
- full nonlinear video editor
- auto-invented product claims
- automatic face creation after a provider privacy block

## 9. Product Metrics

- time to first approved creative route
- percentage of campaigns with a source-backed hook
- route-to-generation conversion
- candidate acceptance rate
- generation retry rate
- duplicate paid submission count
- lost paid result count
- reload recovery success
- export completion

The hard reliability targets are zero duplicate paid submissions and zero lost
provider results.
