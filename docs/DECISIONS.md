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
| 2026-11-13 | Start Phase 2 before the controller tests? | Yes, at the owner's request. Existing skating values were left alone; only new values were added. | Phase 2 |
| 2026-11-13 | How do humans and AI share the game? | One set of mechanics. The AI produces the same input a controller does and cannot do anything a player cannot. | Phase 2 |
| 2026-11-13 | What does a rating of 70 mean? | It reproduces the plain physics values. Every player starts at 70 until Phase 4 generates real players. | Phase 2 |
| 2026-11-13 | Opponent difficulty | One number from 0 (easy) to 1 (hard), `game.opponentDifficulty`, starting at 0.5. It changes reaction time, aim, passing awareness, checking and shot selection, never physics. The AI teammate plays at a fixed 0.6. | Phase 2 |
| 2026-11-13 | When does control switch? | To the puck carrier whenever your team has it; to the receiver the moment you pass; on defence, Y jumps to the skater nearest the puck (or the other one if you are already on him). | Phase 2 |
| 2026-11-13 | Who can collect a loose puck? | The intended receiver of a pass; anyone close enough if the puck is slow enough to handle; an opponent standing in the lane of a flat pass. A puck too fast to handle deflects off bodies. A saucer pass cannot be touched until it lands. | Phase 2 |
| 2026-11-13 | Stoppages | None yet. A goalie who freezes the puck holds it for a second, then lobs it to his most open teammate. After a goal everyone resets and the puck drops loose at centre. Faceoffs and periods come in Phase 3. | Phase 2 |
| 2026-11-13 | Can the puck be carried into the net? | Yes if the goalie is out of position, but a goalie smothers a puck carried into him. Replaces the Phase 1 answer. | Phase 2 |
| 2026-11-13 | How many players on the ice? | 3 skaters and a goalie per side (the GDD first said 2 skaters). `docs/GDD.md` has been edited to match. | Phase 2 |
| 2026-11-13 | How many players are dressed? | 6 skaters + 1 goalie: two lines of 3, from the roster of 7 skaters + 1 goalie, so one skater stays home. `docs/GDD.md` has been edited to match. This overrides the "4 skaters and 1 goalie" and "two lines of 2" wording in the Phase 2, 3, 4 and 5 prompts of `docs/IMPLEMENTATION_PLAN.md`. | Phase 3 |
| 2026-11-13 | How does a line change work? | Skaters skate to their bench door on the top boards; each is swapped for his opposite number as he gets there. The puck carrier goes once he no longer has the puck. | Phase 3 |
| 2026-11-13 | Who calls line changes? | Automatic for both teams: when the line on the ice is tired, the bench is fresher and the moment is safe (the team has the puck, or the puck is in the other half). LB forces a change at once. At a faceoff the bench line starts if it is clearly fresher. | Phase 3 |
| 2026-11-13 | How are faceoffs decided? | A timing duel. The puck drops after a random wait; the first centre to press A after the drop wins it back to a winger. Pressing early locks that centre out for half a second. If nobody presses within a second the puck lies loose. | Phase 3 |
| 2026-11-13 | Fatigue | Two bars. The sprint bar is unchanged. Each skater also has shift energy that falls on the ice (faster when sprinting) and refills on the bench; below 60% it cuts speed, shot power and check strength. Goalies tire slowly over the game and react a little later. | Phase 3 |
| 2026-11-13 | Does the clock run through stoppages? | No. It runs during play and stops for the goal celebration and the faceoff set-up, so a goal does not eat a 2-minute period. | Phase 3 |
| 2026-11-13 | Overtime | Sudden death with the same lines, played until someone scores. The balance harness alone caps it at 5 minutes and counts a tie. | Phase 3 |
| 2026-11-13 | What counts as a shot, a save, an assist, a hit? | A shot is any shot attempt. A save is a goalie stopping a puck that an opponent shot (loose pucks and passes do not count). Up to two assists go to the teammates who had the puck before the scorer, as long as the other team did not have it in between. A hit is a body check that lands. | Phase 3 |
| 2026-11-13 | Can a goalie be skated around? | A goalie smothers any puck carried within 1.2 m of him. | Phase 3 |
| 2026-11-13 | Default opponent difficulty | 0.75 (was 0.5), because a scripted player that only skates to the slot and shoots beat level 0.5 easily. Balance targets are measured AI against AI at 0.5. | Phase 3 |
| 2026-11-13 | Aim assist | The skater the human controls gets it; the AI does not. A shot pointed within 50 degrees of the net is steered to the corner further from the goalie; pointed anywhere else it is left alone. Strength, cone and corner inset are in `physics.json` under `aimAssist`. Added because aiming at the net from a keyboard's eight directions was too hard. | Phase 3 |
| 2026-11-13 | Pass assist | For the skater the human controls only. Between teammates in the direction you point, one with a clear lane is preferred over one with an opponent in the way (a saucer pass ignores the lane). With the stick centred, the pass goes to the teammate with a clear lane and the most room. It never picks a teammate outside the aiming cone. Values are in `physics.json` under `passAssist`. | Phase 3 |

## Open

The other 13 decisions in docs/IMPLEMENTATION_PLAN.md ("Decisions to settle") are still open. Settle the Phase 4 ones (F/D meaning, backup goalie) before Phase 4, and the rest before the phase that needs them.
