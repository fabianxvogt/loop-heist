# QA and evidence

## Source checks

The fixture runner validates all twelve stored solution plans, repeats each replay for equal fingerprints, rejects a truncated solution, round-trips a save, and rejects wrong versions, too many echoes, negative ticks, and out-of-order events. Type checking and the production build are required before independent review.

## Contract coverage

| Area | Source status | Independent review needed |
| --- | --- | --- |
| Fixed 60 Hz / 6-tick movement | Implemented in `src/core/model.ts` | Check exact expiry and simultaneous movement fixtures |
| Input ordering | Ordered by tick and sequence | Add adversarial same-tick permutations if findings require |
| Echo release and final cell | Implemented by per-tape event cursors | Check long-lived plate and guard blocker behavior |
| Doors, plates, timers | Level predicates and decrement-after-evaluation | Verify authored timing windows at boundary ticks |
| Guards | Fixed patrol, wait when echo blocks, swap collision | Check crossing and player collision precedence |
| Timeline | Current tape rewind plus echo erase | Browser interaction and save reload review |
| Campaign | 12 rooms, chapter unlocks, medals | Complete fresh campaign manually |
| Save/import | Versioned, bounded, guarded storage | Browser quota/private-mode behavior |

## Not observed yet

No human playtests have been run or inferred. No browser automation result is claimed. Safari is untested. The current handoff is source-complete but review-pending.
