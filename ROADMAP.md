# Loop Heist roadmap

## Now

- Accessible controls are implemented locally: visible touch/keyboard directions, Interact, six-tick Wait, and optional step-at-your-pace mode through the same deterministic model.
- Public source preview remains at the last accepted source tag `source-accepted-6d525371`; this repair is not pushed or hosted until independent review.
- Browser QA in desktop Chromium and a narrow mobile viewport when the owner grants the first-window slot.
- Five fresh first-session playtests; record echo explanation, opening-chapter completion, retry, and save recovery observations.

## Next

- Keep the source preview provenance tied to accepted source SHA `6d5253714b03b313abf195ccc12ed86bc5b2bb91`; the public branch may carry packaging-only metadata and CI.
- Obtain independent review of input-adapter equivalence, six-tick whole-world stepping, save mode compatibility, and 390px focus/touch behavior before publication.
- Add Safari results if a review machine is available.
- Replace the current text-only actor marks with reviewed original/licensed visual assets if visual review calls for it.

## Later

- Optional sound feedback and richer route inspection, still local-only and deterministic.
- Accessibility pass for keyboard focus order, reduced motion, and non-timing alternatives.

## Done

- Twelve rooms across three chapters with final combined vault.
- Pure fixed 60 Hz replay, 1,800-tick room bound, three echo slots, deterministic guard waiting, timer boundaries, terminal precedence, and solution validator.
- Timeline record/rewind/erase controls, pause release behavior, retry, chapter gating, medals, save/export/import, and rejected-save recovery.
- Source-level fixtures for stored solutions, repeated replay, malformed saves, echo bounds, and room bounds.
- Review repairs: interact-gated echo switches, canonical same-tick ties, strict save narrowing, byte-bounded consistent saves, contiguous room selection, stable authored fingerprints, and executable teaching plans.
- Latest repair: runtime expected-result certificate check; Room 6 guard timing that makes its blocker necessary; Room 10 delayed relay doors and guard timing that make its third role necessary.
- Accessible gameplay repair: canonical touch/keyboard down/up adapter, visible direction/Interact/Wait controls, deterministic six-tick step mode, held-input release on mode change/blur/pause, and version-safe saved input mode.

## Evidence and classification

This checkout is `INCREMENTAL`: a complete bounded game implementation, not scientific evidence. Source SHA, checks, blockers, and review needs are recorded in the portfolio handoff outside this repository.
