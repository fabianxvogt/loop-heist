# Loop Heist

Loop Heist is a deterministic browser puzzle campaign. You record a route, commit it as an echo, then use the replaying accomplice to hold a plate, tap a switch, or block a guard while you take the next route.

## Status

Implementation v1 is complete for source review: twelve authored rooms, bounded pure simulation, checked solution plans, rewind/erase timeline tools, local save, portable JSON export/import, chapter unlocks, medals, pause handling, accessible touch/keyboard controls, six-tick step play, and invalid-save errors are present.

Classification: `INCREMENTAL` game implementation. This is not a research or breakthrough claim.

Human playtests have not been observed in this session. Desktop browser QA and narrow viewport QA are still review work. The reviewed accessible repair is published as a public source preview at the accepted source tag `source-accepted-f809ade`; the hosted preview is `https://loop-heist.fabian523417.chatgpt.site`. This is not full-v1 or human signoff.

## Run it

```sh
npm install
npm run test
npm run typecheck
npm run build
npm run dev
```

Open the local Vite URL. Use arrows/WASD or the visible touch directions to move, Space/E or Interact to use devices, P to pause, and R to retry. Choose Step at your pace for explicit six-tick action beats; each step advances the player, echoes, guards, timers, and budget together, and Wait uses the same beat. Record an echo from the timeline, then continue with that echo selected. Exported saves are local JSON; imports are version-checked and rejected without replacing the old save.

## Source map

- `src/core/model.ts` — fixed 60 Hz simulation, deterministic input ordering, replay, six-tick step beats, rewind, and validator.
- `src/core/rooms.ts` — twelve bounded authored rooms and stored checked solution plans.
- `src/core/save.ts` — bounded versioned save parser, serializer, and guarded local storage.
- `src/main.ts` and `src/ui/styles.css` — static browser UI, chapter map, timeline, controls, and responsive layout.
- `tests/fixtures.ts` — campaign, replay, resource-bound, and save rejection fixtures.
- `docs/QA.md` — evidence status and the remaining independent review plan.

## Limits

The model has no random state, server, account, network leaderboard, or wall-clock input. Echo tapes are input events only. A committed echo releases held inputs when its tape ends and stays in its final cell. Player keys reset on each attempt; echoes cannot collect keys, open the exit, or finish a room.
