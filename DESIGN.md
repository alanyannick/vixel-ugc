# Vixel KOC Studio Design System

## Visual Thesis

A creator contact sheet under a precise production light: raw, human portrait
frames against near-black editorial structure, sharpened by one acidic citron
action color. The product should feel like a serious creative instrument, not a
generic SaaS dashboard.

## Content Plan

1. **Hero:** Vixel brand, source-grounded promise, one primary CTA, and an
   animated strip of original KOC frames.
2. **Proof:** one brief produces five routes, one decision, and a durable plan.
3. **Product:** a real campaign board that shows sources, plan state, generated
   candidates, and receipts.
4. **Depth:** product truth, native creator expression, and paid-result
   protection explained through one concrete workflow.
5. **Final CTA:** open the studio with the demo campaign ready.

## Interaction Thesis

- Hero frames enter with a staggered vertical drift, then respond subtly to
  pointer position and scroll depth.
- The campaign workflow reveals stage-by-stage as the user scrolls, with the
  active connector moving from Source to Candidate.
- Buttons and selectable routes use a fast 120–180ms physical press/reveal.
  Plan and Director panels use shared-layout transitions, never decorative
  bouncing.

All motion respects `prefers-reduced-motion`.

## Type

- Display and brand: **Syne Variable**, 600–800.
- UI and body: **Manrope Variable**, 400–750.
- Large display text uses compact leading and balanced wrapping.
- Body copy stays between 48 and 72 characters per line.
- Numerical status and timestamps use tabular figures.

## Color

```text
ink-950        #090a08   global dark canvas
ink-900        #111310   raised work surface
ink-800        #1b1e19   hover/selected surface
paper-50       #f3f0e8   primary light text/surface
paper-200      #d9d5ca   secondary light text
muted-500      #8c9187   quiet labels
citron-400     #c7f43d   primary action and active state
citron-700     #506b09   subdued success tint
coral-400      #ff7a64   destructive or blocked state
sky-400        #7fd5ff   information and provider state
```

Citron is the only default accent. Coral and sky appear only when their semantic
state is present.

## Spacing and Layout

- 4px base with an 8px primary rhythm.
- Public page max reading width: 1240px.
- Hero is full-bleed and owns the first viewport.
- Studio uses:
  - 232px primary navigation on wide screens
  - flexible campaign workspace
  - 340px Director/plan context when open
- On mobile the Director becomes a bottom sheet and navigation becomes a compact
  top bar.

## Shape and Surface

- Public media crops may use 18–28px radii.
- Routine app surfaces use 8–14px radii.
- Avoid shadows as the main hierarchy mechanism. Use tone, scale, alignment,
  and one-pixel separators.
- Cards exist only when the object is selectable, draggable, or independently
  reviewable.

## App Copy

App UI uses orientation and action language:

- Good: “Product sources”, “5 routes ready”, “Waiting for your hook choice”,
  “Approve exact input”, “Retry failed item”.
- Avoid: “Unleash your creativity”, “Magic”, “All-in-one”, “Revolutionary”.

Status language must come from a durable state or receipt.

## Accessibility

- Body text contrast meets WCAG AA.
- All primary touch targets are at least 44px.
- `focus-visible` is always present.
- Color is never the only status signal.
- Images have useful alt text.
- Forms use visible labels and inline, actionable errors.
- Zoom is never disabled.

## Anti-patterns

- purple/blue gradients
- three-column icon feature grids
- centered copy in every section
- a hero made of floating dashboard cards
- large rounded containers around every region
- invented stats or customer logos
- product UI written like an ad
- model/provider state expressed as a generic spinner
