# Vixel UGC Design Audit

## Baseline

- Independent review date: 2026-07-30
- Viewports: 1440px desktop and 390px mobile
- Design score: B
- AI-slop score: A
- P0 findings: none
- Direction: accepted as a deliberate, evidence-first creative-production
  product rather than a generic SaaS surface.

The homepage hierarchy, original creator imagery, citron action color, and
three-column Studio responsibilities were already strong. The gap to the A-
target was primarily interface ergonomics, not a visual-direction reset.

## Findings closed

1. Studio body, label, and metadata type was too small.
2. Muted text missed AA contrast at small sizes.
3. Several mobile actions were below the 44px touch target.
4. The mobile plan rail appeared clipped.
5. The Director sheet covered the first mobile task.
6. Product-truth and access comparison tables hid columns on mobile.
7. A shorthand font reset caused the loaded Manrope family to fall back to
   Times.
8. The mobile route-decision bar covered too much content.
9. The above-the-fold candidate needed eager image loading.

## Final verification

- Studio body is at least 14px; metadata at least 12px.
- Mobile form controls use 16px text.
- Small muted text uses an AA-safe secondary color.
- Primary mobile targets and plan steps are at least 44px.
- The plan rail scrolls horizontally with snap and an edge affordance.
- Mobile Director starts closed; its explicit toggle remains available.
- The route decision bar measures about 66px at 390px.
- Product-truth and access matrices reflow to definition rows.
- Computed Studio font is `Manrope Variable`; `color-scheme` is dark.
- 390px pages report no body-level horizontal overflow.
- The first visible candidate is eager/priority loaded.
- Final local and production captures at 1440px and 390px are retained in
  `docs/evidence/`; the production QA record has no console, page, request, or
  HTTP errors.

The post-fix surface meets the review's A- closure target without changing the
accepted brand direction.

## 2026-08-01 homepage hierarchy review

The live Vixel UGC acquisition page was reviewed again at 1440 × 900 and
390 × 844, with independent source, naming, and rendered-page audits plus a
comparison against current product-to-ad landing patterns.

### Baseline problem

- The headline occupied about 649px on desktop and 432px on mobile.
- The product-link composer began below the first viewport on both sizes.
- The long category line, product promise, runtime disclaimer, composer, fake
  control pills, fake tabs, format cards, and workflow footer all competed in
  one hero.
- Scroll-linked reveals started entire content regions at `opacity: 0`, which
  could make screenshots, fast scrolls, and some restored positions look blank.
- Desktop navigation, the brand link, and the header CTA did not consistently
  meet the documented 44px target.

### Resolution

- Renamed the public product to `Vixel UGC`; `UGC Campaign` remains the saved
  project and `Creative Router` remains the engine.
- Replaced the manifesto headline with one exact input/output promise:
  `One product link. Five creator ad directions.`
- Kept the complete product-link composer and CTA inside the first viewport,
  with persistent visible field labels and a `focus-within` state.
- Moved creator starting points into their own section and removed control-like
  decoration that had no interaction semantics.
- Reduced the deployment boundary to one compact, honest status line.
- Kept scroll motion but removed the invisible starting state.
- Raised header brand, navigation, login, and CTA targets to at least 44px.

### Measured closure

At 1440 × 900 the final H1 is 143px high, the 900px-wide composer ends at
`y=727`, and its CTA ends at `y=713`. At 390 × 844 the H1 is 166px high, the
composer ends at `y=705`, the CTA ends at `y=692`, and the status ends at
`y=781`. Both viewports have zero horizontal overflow. Offscreen route content
computes to `opacity: 1`, and browser inspection reported no console or page
errors.

The deeper product-truth, workflow, and trace sections remain intentionally
editorial. A later acquisition experiment may test larger 9:16 creator proof
beside the composer, but it is not required to close the clipping, hierarchy,
semantic-control, or blank-section defects found in this review.
