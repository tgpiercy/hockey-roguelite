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
| 2026-11-13 | What do F and D mean? | A tendency only. Any three skaters can form a line. Forwards are generated with better shooting, defencemen with better checking; when two teammates support the puck carrier, the forward goes ahead and the defenceman trails. | Phase 4 |
| 2026-11-13 | Backup goalie? | None. One goalie per team; goalies tire but are never injured. | Phase 4 |
| 2026-11-13 | Roster size | At most 7 skaters and 1 goalie. To sign when full, release first. A team needs 6 skaters and a goalie dressed to play. | Phase 4 |
| 2026-11-13 | Cost of releasing a player | Nothing for now: he goes to the free-agent pool and his cap hit comes off at once. Revisit when contracts and cash matter (Phases 7 and 8). | Phase 4 |
| 2026-11-13 | Grade bands | S 95+, A+ 92 to 94, A 88 to 91, B+ 83 to 87, B 78 to 82, C+ 72 to 77, C 65 to 71, D under 65. The GDD pairs (A+ / A and so on) are each split in two. | Phase 4 |
| 2026-11-13 | Cap hit | Follows overall in a straight line through each grade's range from the GDD: S $11M to $13M, A+ $9.5M to $11M, A $8M to $9.5M, B+ $6M to $8M, B $4M to $6M, C+ $2.75M to $4M, C $1.5M to $2.75M, D $0.8M to $1.5M. Rounded to $50,000. | Phase 4 |
| 2026-11-13 | Overall rating | A weighted average of the ratings. Forwards weigh shooting most, defencemen checking, goalies reflexes and positioning. Weights are in `src/data/overallWeights.json`. | Phase 4 |
| 2026-11-13 | The league | Your team plus 12 AI teams whose average overall runs from about 66 to 80, and 24 free agents from D grade up to one A. Your team averages about 68. Everything is rebuilt exactly from the league seed. | Phase 4 |
| 2026-11-13 | Who do you play? | Any AI team, chosen from a list, until the season run arrives in Phase 5. Wins, losses and overtime losses are kept. | Phase 4 |
| 2026-11-13 | New signings and the lineup | A signing fills an empty lineup spot if there is one; otherwise he waits undressed and the game says so. | Phase 4 |
| 2026-11-13 | How long is a season? | 3 regions, each a game, a stop, a game, a stop and a boss (with a choice of two at every step but the boss), then a semi-final and a final, each best of 3: 13 to 15 games. | Phase 5 |
| 2026-11-13 | What does a loss cost? | Three strikes. A lost map game is a strike and you move on; a lost boss game is a strike and a rematch; the third strike ends the season. A lost playoff series ends it outright. | Phase 5 |
| 2026-11-13 | Powerups and artifacts | Powerups are consumables: load one on LT and one on RB before a game; pressing the trigger uses it up for a timed boost or an instant effect. Artifacts are always-on team bonuses kept across seasons until prestige. The AI does not use powerups; bosses have a signature trait instead. | Phase 5 |
| 2026-11-13 | What does a season reset? | Powerups, run currency, training bumps and temporary effects are wiped at season end. Artifacts, the roster and the record carry on. | Phase 5 |
| 2026-11-13 | Roster during a season | Locked. The dressed six skaters and goalie are fixed for the run and the seventh skater stays home; the six can still swap lines. Signing and releasing happen only in the off-season. | Phase 5 |
| 2026-11-13 | Stops on the map | Game: a win pays 20 currency plus 5 per goal of margin (up to 15 more), with a 35% chance of a powerup. Training: one dressed player gains 3 in every rating for the season. Event: a text choice with a trade-off (18 written). Shop: three powerups for sale and a strike wiped for 120. Boss: a generated team 3 points stronger than its region's best, with a trait; a win pays 40 and a choice of three artifacts. | Phase 5 |
| 2026-11-13 | Who are the opponents? | Region 1 draws from the four weakest AI teams, region 2 the middle four, region 3 the four strongest; the playoffs are against the second strongest and then the strongest. The AI is sharper each region (0.5, 0.65, 0.8; bosses 0.1 more; playoffs 0.9). The tuning panel's difficulty shifts all of these together. | Phase 5 |
| 2026-11-13 | Champion's prize | One artifact, awarded automatically. | Phase 5 |
| 2026-11-13 | Can an event end the season? | No. Events can add or wipe a strike but never deliver the third; currency never goes below zero. | Phase 5 |
| 2026-11-13 | Quitting mid-game | The season is saved after every step, but a game in progress is not: quit during a game and you replay it. | Phase 5 |
| 2026-11-13 | Exhibition games | Still available in the off-season against any team; they no longer count toward the record. | Phase 5 |

## Open

The Phase 6 to 9 decisions in docs/IMPLEMENTATION_PLAN.md ("Decisions to settle") are still open: gear ownership, milestone targets, prestige, poaching, the mascot questions and the game name. Settle each before the phase that needs it.
