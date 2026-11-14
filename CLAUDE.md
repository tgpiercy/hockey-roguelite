# Hockey Roguelite

A mobile arcade 3-on-3 hockey roguelite, built once as a TypeScript web game. It is played on a phone with a Bluetooth Xbox controller and installs to the home screen. No App Store release.

- Design: `docs/GDD.md` is the source of truth.
- Decisions the design doc does not cover: `docs/DECISIONS.md`.
- Phases, prompts and exit tests: `docs/IMPLEMENTATION_PLAN.md`.

## Stack

| Part | Tool |
| --- | --- |
| Language | TypeScript, strict |
| On-ice game | Phaser |
| Menus | Preact (HTML and CSS) |
| Build | Vite |
| Tests | Vitest |
| Hosting | GitHub Pages, deployed by GitHub Actions |

Exact versions are pinned in `package.json`.

## Folders

```text
src/core/    game rules: players, grades, cap, gear, packs, aging, economy, run map
src/sim/     on-ice simulation: physics, AI, game rules; runs headless
src/game/    Phaser scenes: drawing, camera, controller input, audio
src/ui/      Preact menu screens
src/data/    JSON tuning tables
tests/       unit tests and headless balance runs
docs/        GDD.md, DECISIONS.md, IMPLEMENTATION_PLAN.md, TUNING.md
```

**Hard rule:** nothing in `src/core` or `src/sim` may import from `src/game`, `src/ui`, Phaser, Preact or the DOM. They may import from each other and from `src/data`.

It is enforced twice:
- `tests/architecture.test.ts` scans those folders for forbidden imports and DOM globals.
- `tsconfig.core.json` type-checks them with no DOM library, so DOM use fails `npm run typecheck`.

**Randomness:** all of it goes through `createRng(seed)` in `src/core/rng.ts`. `Math.random` is banned everywhere in `src` (also checked by `tests/architecture.test.ts`). Use `rng.fork('label')` to give a subsystem its own stream.

## Run, test, deploy

```bash
npm install        # once
npm run dev        # local server; prints a network address for the phone on the same Wi-Fi
npm test           # all tests, once
npm run typecheck  # whole project, then core and sim without the DOM
npm run balance    # headless AI-vs-AI series: -- --games 200 --home 90 --away 70 (add --naive for a scripted human)
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Deploy: push to `main`. `.github/workflows/deploy.yml` runs the type check and tests, builds, and publishes to https://tgpiercy.github.io/hockey-roguelite/. A failed check blocks the deploy.

The site lives under `/hockey-roguelite/` (`base` in `vite.config.ts`). Controllers need HTTPS or localhost, so test on the phone from the deployed link.

## Standing rules

- Tuning numbers live in `src/data` and never in code.
- Every rule in `src/core` has a unit test.
- Placeholder shapes only, no art (until Phase 9).
- Ask before adding a dependency.
- `docs/GDD.md` is the source of truth for design; `docs/DECISIONS.md` records anything we decide that it does not cover.

## How the on-ice game fits together

- `src/sim/world.ts`: `createGame(tuning, seed, options)` starts a full game; `createWorld(...)` starts a scrimmage (endless play, no clock, faceoffs or line changes; used by most tests). `step(world, humanInput, tuning)` advances either by one fixed step of 1/60 second and returns the events that happened. Nothing else advances the game.
- Game rules are in `src/sim/match.ts`: periods, the clock, the faceoff duel, overtime, and `gameResult(world)`, which later phases use for XP and milestones. (It is not called `game.ts` because the folder rule test treats `game` as the rendering folder.)
- 14 players are dressed: for each team, ids run from `team * 7`: six skaters (the first three are line 1, the next three line 2; `slot` 0 is the centre), then the goalie. `onIce` says who is playing. Use `skatersOf`, `availableSkaters` (not heading to the bench) and `onIce` from `team.ts` rather than looping over `world.players`.
- Lines, the bench and fatigue are in `src/sim/lines.ts`. A line change sends skaters to the bench door, where each is swapped for his opposite number; the puck carrier goes last. Changes are automatic at safe moments, and the line-change button forces one.
- Humans and AI use the same mechanics: both produce an `InputFrame`. `src/sim/ai.ts` is a five-state machine (attack, support, chase, defend, backcheck). Positioning numbers and the easy-to-hard ranges are in `src/data/ai.json`. Difficulty changes thinking only, never physics.
- Ratings (0 to 100) become physical effects in `src/sim/ratings.ts` from the table in `src/data/ratings.json`. A skater rated 70 gets exactly the plain `physics.json` values.
- One concern per file: `rink.ts`, `skater.ts`, `puck.ts`, `shot.ts`, `pass.ts`, `check.ts`, `goalie.ts`, `contact.ts` (bodies and loose-puck pickups), `control.ts` (which skater the human controls), `team.ts` (helpers).
- Every sim function takes the tuning object as an argument; only `src/sim/tuning.ts` reads `src/data/physics.json`. That is what lets the tuning panel change values mid-game.
- Units are metres and seconds. Y points down the screen.
- `src/game/RinkScene.ts` runs as many fixed steps as real time needs each frame, then draws. `src/game/input.ts` turns controller and keyboard into one `InputFrame`; button numbers and keys are in `src/data/controls.json`. `src/ui/GameSummary.tsx` is the end-of-game screen.
- Tuning panel: `src/ui/tuningStore.ts` and `src/ui/TuningPanel.tsx`. It lists every number in `physics.json` automatically. Edits are kept in the browser until Reset. Export JSON downloads a replacement `physics.json`. Log tuning changes in `docs/TUNING.md`.
- Balance harness: `tests/harness/harness.ts` (`runGame`, `runSeries`) and `tests/harness/bot.ts` (a scripted stand-in for a simple human). `scripts/balance.mjs` runs them from the command line through Vite. The targets and the latest numbers are in `docs/TUNING.md`; re-run the series after any change to ratings, AI or goalie values.
- Tests read the shipped tuning and assert relative to it. `tests/helpers.ts` has helpers to place players and hand out the puck.

## Notes for future sessions

- On the ice it is 3 skaters and a goalie a side; 6 skaters and 1 goalie are dressed (two lines of 3). Where a prompt in `docs/IMPLEMENTATION_PLAN.md` says 2 skaters, 4 skaters or lines of 2, `docs/GDD.md` and `docs/DECISIONS.md` win.
- The plain link opens the rink. The Phase 0 controller read-out is at `?controller`.
- Keyboard fallback: arrows or WASD skate, Space shoot, Z or J pass and faceoff draw, X or K check, C or L switch player, Q line change (LB), Shift sprint, Tab tuning, I AI debug overlay (View button).
- Balance (AI against AI, level 0.5) meets the Phase 3 targets. Human against AI is not balanced yet: a scripted player that only skates to the slot and shoots still wins about two games in three at the default difficulty of 0.75.
- In local development `window.__game` is the Phaser game. When the browser tab is hidden, animation frames stop; drive them by hand with `__game.loop.step(timeMs)`.
- The desktop app's "start preview" tool hung on this PC right after Node.js was installed. If it still does, start the server from a shell with `npm run dev` and open http://localhost:5173/hockey-roguelite/.

- Controller input is read with the browser's Gamepad API in `src/game/gamepad.ts`, not Phaser's gamepad plugin. A controller only appears after its first button press.
- Button and axis names for the standard Xbox layout, with the GDD action for each, are in `src/data/xboxMapping.json`.
- iPhones ignore the manifest's landscape lock, so the page shows a "turn your phone sideways" notice in portrait.
- The Phase 0 controller test page (`src/game/ControllerTestScene.ts`, `src/ui/ControllerReadout.tsx`, `src/data/controllerTest.json`) is scaffolding; remove it once the controller mapping is confirmed.
