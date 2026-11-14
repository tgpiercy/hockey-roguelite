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
docs/        GDD.md, DECISIONS.md, IMPLEMENTATION_PLAN.md
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

## Notes for future sessions

- Controller input is read with the browser's Gamepad API in `src/game/gamepad.ts`, not Phaser's gamepad plugin. A controller only appears after its first button press.
- Button and axis names for the standard Xbox layout, with the GDD action for each, are in `src/data/xboxMapping.json`.
- iPhones ignore the manifest's landscape lock, so the page shows a "turn your phone sideways" notice in portrait.
- The Phase 0 controller test page (`src/game/ControllerTestScene.ts`, `src/ui/ControllerReadout.tsx`, `src/data/controllerTest.json`) is scaffolding; Phase 1 can replace it.
