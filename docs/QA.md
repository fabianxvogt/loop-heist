# QA and evidence

## Source checks

The fixture runner validates all twelve stored solution plans and stable fingerprints, checks the runtime expected-result certificate, repeats each replay for equal fingerprints, checks canonical same-tick ties, requires echo interaction edges for timed switches, exercises real rewind/erase/retry plan steps, accepts a redundant release after terminal success, rejects semantically required event removal including Room 6's blocker and Room 10's third role, checks six-tick whole-world beats and nonterminal preview boundaries, checks touch/keyboard down/up and Interact tape equivalence, round-trips real-time and step-mode saves, defaults old saves safely, rejects invalid modes, and rejects wrong versions, too many echoes, negative ticks, bad sequence order, invalid progress/medals/checkpoints, cursor inconsistencies, and byte-oversized input. `npm test` also runs the native controller probe for wait, pointer, keyboard, terminal, focus, release, and wall-clock suppression behavior. `npm run typecheck` and `npm run build` pass on the repair checkout.

## Contract coverage

| Area | Source status | Independent review needed |
| --- | --- | --- |
| Fixed 60 Hz / 6-tick movement | Implemented in `src/core/model.ts` | Check exact expiry and simultaneous movement fixtures |
| Input ordering | Canonical tick/sequence order with equal-sequence direction precedence | Check browser event capture against the pure tape |
| Echo release and final cell | Final tape event releases held inputs after that tick | Check long-lived plate and guard blocker behavior |
| Doors, plates, timers | Interact edge for switches, level plates, decrement-after-evaluation | Verify authored timing windows at boundary ticks |
| Guards | Fixed patrol, wait when echo blocks, swap collision | Check crossing and player collision precedence |
| Timeline | Executable authored play/record/rewind/erase/retry steps plus current tape rewind | Browser interaction and save reload review |
| Accessible input | Visible touch/keyboard directions, Interact, six-tick Wait, and optional step mode through the same model | Browser focus/touch review at 390px |
| Campaign | 12 rooms, chapter unlocks, medals | Complete fresh campaign manually |
| Save/import | Versioned byte bound, ordered events, cursor replay consistency, contiguous progress, medals, guarded storage | Browser quota/private-mode behavior |

## Reviewed public preview evidence

- Accepted source SHA: `f809adeba1f0168b072c88a21096dcd2966a7a75`; public tag: `source-accepted-f809ade`.
- Public repository: `https://github.com/fabianxvogt/loop-heist`; CI run `34031280237` passed for the exact source SHA.
- Existing Site version 2 uses the exact source SHA and archive `sha256:6d89f19c588f5975c19e7889423fd5b655f2c2cab0dc83a7731d3735a6c8be24`; live URL: `https://loop-heist.fabian523417.chatgpt.site`.
- Live checks returned `200 text/html`, `200 text/javascript`, and `200 text/css`; the deployed hashed JS and CSS bytes matched the reviewed local build. No browser was opened for this release.

## Not observed yet

No human playtests have been run or inferred. No real-browser visual fit at 390px, desktop/mobile browser QA, Safari, device check, full campaign playthrough, or five-human acceptance is claimed. This is a public reviewed source preview, not full-v1 or user-gameplay acceptance.
