# Decisions

Decisions that docs/GDD.md does not cover. The Phase 4 to 8 prompts read this file.
Open decisions and their recommended defaults are listed in the last section of docs/IMPLEMENTATION_PLAN.md.

## Settled

| Date | Decision | Answer | Needed by |
| --- | --- | --- | --- |
| 2026-11-13 | Which phone, and is there a Mac? | Web build as planned: a TypeScript web game installed to the phone's home screen. No App Store release, no Mac needed. | Phase 0 |
| 2026-11-13 | How is the "core and sim import no rendering code" rule enforced? | A Vitest test (`tests/architecture.test.ts`), plus a second type check of `src/core` and `src/sim` with no DOM library (`tsconfig.core.json`). No ESLint. | Phase 0 |
| 2026-11-13 | Which random number generator? | sfc32, seeded from a hashed string, in `src/core/rng.ts`. `fork(label)` gives each subsystem its own repeatable stream. `Math.random` is banned in `src` by a test. | Phase 0 |
| 2026-11-13 | Which versions? | Node.js 26 LTS. Phaser 4.2.1 (current stable), Preact 11.2.0, Vite 8.3.8, Vitest 5.1.0, TypeScript 7.0.2, all pinned exactly. | Phase 0 |
| 2026-11-13 | How is the controller read? | The browser's Gamepad API directly (`src/game/gamepad.ts`), not Phaser's gamepad plugin. | Phase 0 |
| 2026-11-13 | Start Phase 1 before the Phase 0 controller test? | Yes. The Phase 0 page is still at `?controller`. No `phase-0` tag until the test passes with a real controller. | Phase 1 |
| 2026-11-13 | Keyboard controls? | Yes, as a fallback for checking things on a computer: arrows or WASD skate, Space shoots, Shift sprints, Tab opens tuning. Feel is judged on the controller. | Phase 1 |
| 2026-11-13 | Units and step | Metres and seconds. The simulation always advances 60 fixed steps a second; a fast puck is moved in shorter sub-steps so it cannot pass through a post or the netting. | Phase 1 |
| 2026-11-13 | Can the puck be carried into the net? | Yes, it counts as a goal. Revisit when goalies arrive in Phase 2. | Phase 1 |

## Open

The other 13 decisions in docs/IMPLEMENTATION_PLAN.md ("Decisions to settle") are still open. Settle the Phase 4 ones (F/D meaning, backup goalie) before Phase 4, and the rest before the phase that needs them.
