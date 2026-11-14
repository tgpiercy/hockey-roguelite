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

- `src/sim/world.ts`: `createWorld(tuning, seed)` and `step(world, input, tuning)`. One call is one fixed step of 1/60 second and returns the events that happened (goal, shot, post, pickup). Nothing else advances the game.
- Every sim function takes the tuning object as an argument; none reads `src/data/physics.json` directly except `src/sim/tuning.ts`. That is what lets the tuning panel change values mid-game.
- `src/sim/rink.ts` holds all geometry and collisions; `skater.ts`, `puck.ts` and `shot.ts` hold one concern each.
- Units are metres and seconds. Y points down the screen.
- `src/game/RinkScene.ts` runs as many fixed steps as real time needs each frame, then draws. `src/game/input.ts` turns controller and keyboard into one `InputFrame`; button numbers and keys are in `src/data/controls.json`.
- Tuning panel: `src/ui/tuningStore.ts` and `src/ui/TuningPanel.tsx`. It lists every number in `physics.json` automatically, so a new value added there appears with no extra code. Edits are kept in the browser until Reset. Export JSON downloads a replacement `physics.json`. Log tuning changes in `docs/TUNING.md`.
- Tests read the shipped tuning and assert relative to it, so exporting new values should not break them.

## Notes for future sessions

- The plain link opens the rink. The Phase 0 controller read-out is at `?controller`.
- Keyboard fallback: arrows or WASD skate, Space shoots, Shift sprints, Tab opens tuning.
- In local development `window.__game` is the Phaser game. When the browser tab is hidden, animation frames stop; drive them by hand with `__game.loop.step(timeMs)`.
- The desktop app's "start preview" tool hung on this PC right after Node.js was installed. If it still does, start the server from a shell with `npm run dev` and open http://localhost:5173/hockey-roguelite/.

- Controller input is read with the browser's Gamepad API in `src/game/gamepad.ts`, not Phaser's gamepad plugin. A controller only appears after its first button press.
- Button and axis names for the standard Xbox layout, with the GDD action for each, are in `src/data/xboxMapping.json`.
- iPhones ignore the manifest's landscape lock, so the page shows a "turn your phone sideways" notice in portrait.
- The Phase 0 controller test page (`src/game/ControllerTestScene.ts`, `src/ui/ControllerReadout.tsx`, `src/data/controllerTest.json`) is scaffolding; remove it once the controller mapping is confirmed.
