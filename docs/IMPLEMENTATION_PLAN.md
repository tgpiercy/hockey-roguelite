# Hockey Roguelite – Implementation Plan & Prompts

Nov 13, 2026 · @Timothy Graeme Piercy

## Proposal review

The design is buildable, but only if the on-ice game is proven fun before any franchise system is written, and seven gaps in the Game Design Doc are closed first.

**What is solid**

- The big calls are made: 3-on-3, controller first, permanent gear, team as the star, earned-only packs.
- The systems are mostly data and menus, which are quick to build and easy to test without playing.
- The grade, cap, aging and rarity tables are concrete enough to code from.

**Gaps to close**

| # | Gap in the design doc | Why it matters |
| --- | --- | --- |
| 1 | Powerups and artifacts are never defined | Prestige wipes them and LT / RB trigger them, so the run layer has no content yet |
| 2 | No fail state on the run map | Only a playoff series loss ends a run; a normal loss has no consequence |
| 3 | Run length is open, but milestones assume a long season | 15 wins and a 25-goal player cannot happen in a 12-game run of 6-minute games |
| 4 | Pillar 3 says runs reset, but artifacts carry across seasons | Nothing actually resets until prestige, so each season plays less like a roguelite run |
| 5 | Gear ownership is unclear | 8 players x 6 slots is 48 slots; the doc does not say what happens to gear when a player leaves, or whether gear changes grade and cap hit |
| 6 | F and D positions with only 2 skaters on the ice | Position needs a job, or it should be dropped |
| 7 | Economy has no numbers | Revenue, costs and franchise value are named but unsized; this is the system most likely to feel like bookkeeping |

Recommended defaults for each are in the last section.

**Risks**

- **Scope.** There are ten systems here. The on-ice game is roughly half the total effort and decides whether any of the rest matters, so it gets a go / no-go gate at Phase 3.
- **Rebuild cost.** The doc plans a web prototype, then a rebuild in Godot or Unity. The plan below removes that rebuild.
- **Balance.** Grades only mean something if an A-grade team reliably beats a C-grade team on the ice. The plan adds a headless AI-vs-AI harness to measure that instead of guessing.
- **Naming.** "Blades of Steel" is the title of an existing Konami hockey game and "Tape to Tape" is a current one. Both are fine as working titles; pick an original name before anything is shared publicly.

## Tech stack and project structure

Build it once as a TypeScript web game that installs to the phone's home screen, and skip the Godot or Unity rebuild.

| Choice | Recommendation | Why |
| --- | --- | --- |
| Language | TypeScript | Claude Code can run, test and type-check it with no editor in the loop |
| On-ice rendering and input | Phaser (current stable release) | 2D scenes, camera and gamepad support out of the box |
| Menus | HTML and CSS with Preact, navigated by controller | Roster, cap, gear and pack screens are forms and lists, which the web does best |
| Build and tests | Vite and Vitest | Fast reloads; rules and simulation tested headless |
| Saves | IndexedDB, versioned, with export and import to a file | Survives updates; a save can be backed up or moved between devices |
| Hosting | GitHub Pages, deployed by GitHub Actions on every push | A link that opens on the phone; HTTPS, which home-screen install needs |

**Why not Godot or Unity now.** A web build runs on iPhone and Android from one link, with a paired Xbox controller read through the browser. A native iPhone build needs a Mac and a paid Apple developer account. If app-store release matters later, the same web build can be wrapped as a native app, and the rules code would port to Godot unchanged in design.

**The one structural rule:** the game rules and the on-ice simulation never import rendering code. That is what makes headless testing and AI-vs-AI balance runs possible.

```text
src/core/    rules: players, grades, cap, gear, packs, aging, economy, run map
src/sim/     on-ice simulation: physics, AI, game rules; fixed 60 Hz step, runs headless
src/game/    Phaser scenes: drawing, camera, controller input, audio
src/ui/      menu screens
src/data/    JSON tuning tables: physics values, grade bands, drop rates, costs
tests/       unit tests and headless balance runs
docs/        GDD.md, DECISIONS.md, TUNING.md
CLAUDE.md    standing rules for every Claude Code session
```

All randomness goes through one seeded generator, so any game, pack or season can be replayed exactly from its seed.

## Implementation plan

Ten phases, each ending in a test you run on your phone with the controller; do not start a phase until the one before it passes.

| Phase | Builds | Exit test |
| --- | --- | --- |
| 0. Setup | Repo, build, deploy pipeline, controller read-out page | A square moves with the left stick on your phone, from the deployed link |
| 1. Skating and puck | One skater, puck, boards, nets, shooting, live tuning panel | Skating and shooting at an empty net is fun for 5 minutes |
| 2. 3-on-3 | Teammate and opponent AI, goalies, passing, checking, player switch | You win some shifts and lose some; passes go where you meant |
| 3. Full game | Periods, faceoffs, OT, fatigue, line changes, stats, headless AI-vs-AI harness | A full game plays start to finish; an A-grade team beats a C-grade team in about 75% of 200 headless games |
| 4. Players and roster | Player generator, grades, cap hits, league pool, roster and lineup screens, saves | Build a legal roster under the cap, dress 5, play a game with them, reload and find it saved |
| 5. Season run | Run map, node types, bosses, playoffs, fail state, powerups and artifacts | A full season plays from lineup to championship or elimination |
| 6. Gear and packs | Gear, rarity, sets, pack opening, pity timer, tape currency, milestones | Win a game, open a pack, equip a piece and feel it on the ice |
| 7. Franchise loop | XP, aging, contracts, free agency, pool refresh, prestige | A 20-season headless run stays healthy: no cap deadlock, grades stay spread, rookies replace retirees |
| 8. Economy and mascot | Operating cash, revenue, staff, facilities, mascot drop-ins | A 20-season headless run neither goes bankrupt nor piles up unspendable cash under sensible play |
| 9. Polish | Art, sound, onboarding, home-screen install, touch fallback | Someone who has never seen it can play a season without help |

**Go / no-go at Phase 3.** If a full game is not fun with the controller by then, stop and either keep tuning or switch the on-ice layer to the coach-mode sim. Phases 4 to 8 work with either.

**Order within the plan.** Phases 4 to 8 follow the design doc's own build order, with two changes: packs move after the season run so there are wins to earn them from, and the economy goes last because it depends on every other system for its inputs.

**Placeholder art until Phase 9.** Circles, rectangles and text are enough to judge feel and balance; art made earlier gets thrown away when sizes and speeds change.

## How to use the prompts

Each prompt below is one Claude Code session, pasted as written into a session opened in the project folder.

1. Create an empty GitHub repo and clone it to your computer.
2. Export the Game Design Doc as Markdown and save it in the repo as `docs/GDD.md`.
3. Settle the open decisions at the end of this doc and add them to the design doc before Phase 4.
4. Run the Phase 0 prompt. It creates `CLAUDE.md`, which every later session reads automatically.
5. For each phase: paste the prompt, review the plan it proposes, let it build, then run the exit test on your phone.
6. When the exit test passes, commit and tag the phase. When it fails, use the tuning or bug prompt until it passes.

**Three prompts you will reuse**

Tuning the feel:

```text
The on-ice feel is off. Here is what I notice, in hockey terms: [e.g. skaters stop too fast, passes arrive too slowly, the goalie never gets beaten short side].
Change only values in src/data/ tuning tables where possible. Tell me which values you changed, from what to what, and why. Add each to docs/TUNING.md. Do not refactor.
```

Fixing a bug:

```text
Bug: [what happened]. Expected: [what should happen]. Steps: [how to trigger it]. Seed, if shown: [seed].
First reproduce it with a failing test in tests/. Then fix the cause, not the symptom. Show me the test passing and run the full test suite before you finish.
```

Closing a phase:

```text
Phase [N] passes its exit test. Run the full test suite and the type check. Update CLAUDE.md with anything a future session needs to know, and record the decisions made this phase in docs/DECISIONS.md. Commit and tag it phase-[N]. Then list anything you cut or stubbed that a later phase must pick up.
```

## Prompts: the on-ice game (Phases 0 to 3)

These four prompts build the playable hockey game and end at the go / no-go gate.

**Phase 0: setup**

```text
Read docs/GDD.md. We are building this as a TypeScript web game played on a phone with a Bluetooth Xbox controller.

Set up the project:
- Vite + TypeScript (strict), Phaser (current stable release) for the on-ice game, Preact for menus, Vitest for tests.
- Folders: src/core (game rules), src/sim (on-ice simulation), src/game (Phaser scenes), src/ui (menus), src/data (JSON tuning tables), tests, docs.
- Hard rule, enforced by a lint rule or a test: nothing in src/core or src/sim may import from src/game, src/ui, Phaser, or the DOM.
- A seeded random number generator in src/core. All randomness in the project must go through it.
- A GitHub Actions workflow that runs tests and the type check, then deploys to GitHub Pages on every push to main.
- A web app manifest so the page can be added to a phone's home screen and opens full screen in landscape.

Then build one test page: a square on a rink-coloured background that moves with the controller's left stick, plus an on-screen read-out of every button and axis so I can confirm the mapping on my phone. Show a clear "press any button to connect controller" message until a controller is detected.

Finally write CLAUDE.md with: the stack, the folder rules above, how to run, test and deploy, and these standing rules: tuning numbers live in src/data and never in code; every rule in src/core has a unit test; placeholder shapes only, no art; ask before adding a dependency; docs/GDD.md is the source of truth for design and docs/DECISIONS.md records anything we decide that it does not cover.

Show me your plan before writing code. Done when: tests pass, the deploy succeeds, and you give me the link to open on my phone.
```

**Phase 1: skating and puck**

```text
Read CLAUDE.md and the on-ice gameplay section of docs/GDD.md. Build the skating and puck feel. One skater, no opponents yet.

In src/sim (headless, fixed 60 Hz step):
- A top-down rink with rounded corners, boards, two nets and goal lines.
- A skater with momentum: acceleration, top speed, turning that gets wider at speed, glide when the stick is released, and a sprint on RT that drains a stamina bar.
- A puck that the skater picks up on contact and carries on the stick side, bounces off boards and posts, and slows with friction when loose.
- Shooting on X: tap for a quick wrist shot, hold to charge a harder one. Aim follows the left stick. Shot speed and accuracy come from parameters, not constants, because player ratings will drive them later.
- Goal detection.

In src/game: draw it with placeholder shapes, a camera that fits the whole rink in landscape on a phone, and the controller mapping from the GDD.

Add an on-screen tuning panel, toggled by the controller's menu button, that edits every physics value live and can export the current values as JSON for src/data. Start from values that feel like classic arcade hockey: quick, slightly slippery, never floaty.

Unit test the simulation: puck bounces, goal detection, stamina drain. Show me your plan first. Done when I can skate, pick up the puck and score on an empty net from the deployed link.
```

**Phase 2: 3-on-3**

```text
Read CLAUDE.md. The skating and puck feel is tuned; do not change physics values in this phase. Add the other five players: 2 skaters and a goalie per side.

- Player switching: I control the skater with the puck; on defence, Y switches to the skater nearest the puck. Show a clear marker on my skater.
- Passing on A: aimed with the left stick at the best teammate in that direction, led to where the teammate is going. Hold A for a saucer pass that clears sticks.
- Checking on B: a body check when close and moving toward a puck carrier knocks the puck loose and briefly staggers them; otherwise a poke check. No penalties.
- Goalie AI: follows the puck's angle, stays in the crease, saves by reaction time and coverage driven by rating parameters, freezes or deflects the puck, and can be beaten by quick lateral passes.
- Skater AI as a small state machine with clear states: attack with puck, support the puck carrier (get open), chase loose puck, defend (cover a man or the slot), and backcheck. AI teammates must get open for passes and take shots themselves.
- Every AI decision reads from a ratings object per player (shooting, passing, speed, checking, puck control, stamina; goalies: reflexes, positioning, rebound control, stamina) on a 0 to 100 scale. Keep one table in src/data that maps each rating to its physical effect.
- A difficulty parameter for the opposing team that changes AI reaction time and decision quality, not physics.

Add a debug overlay that shows each AI skater's current state. Unit test the AI state transitions and the goalie save logic. Show me your plan first. Done when I can play continuous 3-on-3 against the AI with goals scored by both sides.
```

**Phase 3: full game and balance harness**

```text
Read CLAUDE.md. Turn the 3-on-3 sandbox into a complete game, then prove that ratings matter.

Game rules, in src/sim:
- 3 periods of 2 minutes with a running clock, faceoffs at centre after goals and at period starts, sudden-death overtime.
- Icing and offside are off. Puck out of play is not possible.
- A dressed lineup of 4 skaters and 1 goalie per team: two lines of 2. LB changes lines on the fly. Skaters lose energy on the ice and recover on the bench; low energy reduces speed, shot power and check strength.
- Track per-player stats for every game: goals, assists, shots, hits, time on ice; saves and goals against for goalies. Return them in a game-result object, because later phases award XP and milestones from it.
- Scoreboard, period and clock display, goal celebration pause, end-of-game summary screen.

Balance harness, in tests/:
- A headless runner that plays AI against AI at full simulation speed from a seed, with no rendering, and returns the game result.
- A command that plays N games between two teams and reports win rate, average score, shots and save percentage.
- Use it to tune the ratings table until: two equal teams score about 3 to 5 goals each per game; a team rated 90 beats a team rated 70 in roughly 75% of 200 games; save percentage sits between .850 and .920. Report the numbers before and after tuning.

Show me your plan first. Done when a full game plays start to finish on my phone and the harness numbers are inside those targets.
```

## Prompts: the franchise game (Phases 4 to 9)

These six prompts add the roster, season, gear, franchise and economy layers on top of the proven on-ice game.

**Phase 4: players and roster**

```text
Read CLAUDE.md, and the league, grades, roster and cap sections of docs/GDD.md plus docs/DECISIONS.md. Build the player and roster layer. All rules go in src/core with unit tests; screens go in src/ui.

- Player model: name, position, age, ratings, hidden potential, overall, grade, cap hit, contract years. Overall is a weighted average of ratings; grade bands and cap-hit ranges come from the GDD table, stored in src/data.
- A seeded generator for players and for a league of 12 AI teams plus mine, each with 7 skaters and 1 goalie, plus a free-agent pool. Generated names only; no real players or teams.
- My starting roster is mostly C grade, per the GDD.
- Hard salary cap of $35M: no move may put a roster over it.
- Screens, fully usable with the controller (d-pad or stick to move focus, A to select, B to go back): roster with ratings and cap space, free agents with sign and release, and a lineup screen to dress 4 skaters and 1 goalie into two lines.
- Save and load with IndexedDB. Every save carries a schema version and goes through a migration function on load. Add export-to-file and import-from-file.
- Connect it to the game: the dressed lineup's ratings drive the on-ice players, and the opponent is an AI team from the league.

Show me your plan first, including the data schema. Done when I can build a roster under the cap, dress a lineup, play a game with it, close the page and find everything saved.
```

**Phase 5: season run**

```text
Read CLAUDE.md, the season campaign section of docs/GDD.md, and docs/DECISIONS.md for run length, fail state, and the definitions of powerups and artifacts. Build the season run.

- A seeded branching map: 3 regions, each with a choice of paths through game, training, event and shop nodes, ending in a boss team. Then playoffs as best-of-3 series.
- Node types: game (play it); training (pick one dressed player for a rating bump this season); event (a short text choice with a trade-off, drawn from a data file of at least 15 events); shop (spend run currency on powerups).
- Boss teams: stronger rosters with one signature trait each, defined in data.
- Fail state and run length exactly as recorded in docs/DECISIONS.md.
- Powerups and artifacts as defined in docs/DECISIONS.md. Implement them as data-driven modifiers applied through one modifier system that the simulation reads, not as special cases scattered in the code. Ship at least 10 powerups and 12 artifacts.
- A season state machine: off-season, lineup, map, playoffs, season end. The save records exactly where I am, so I can quit mid-season and resume at the same node.
- Map screen and node screens navigable by controller.

Unit test map generation (every path reaches the boss), the modifier system, and the season state machine. Show me your plan first. Done when I can play a whole season from lineup to championship or elimination.
```

**Phase 6: gear and packs**

```text
Read CLAUDE.md, the equipment and packs sections of docs/GDD.md, and docs/DECISIONS.md for gear ownership rules. Build gear, packs and milestones.

- Gear model: slot, rarity, 1 to 3 rating boosts, optional perk, optional set, level. Six skater slots; goalies use their own gear pool. Generate items from data tables.
- Gear applies through the same modifier system as powerups. Gear never changes a player's grade or cap hit.
- Set bonuses at 2 and 4 pieces, per the GDD table.
- Packs: Bronze, Silver and Gold with the contents, guarantees and triggers in the GDD; rarity odds from the GDD; a Legendary guaranteed after 25 packs without one. Pack contents are rolled from the seeded generator when the pack is awarded, not when it is opened.
- Duplicates scrap into tape; tape levels up owned gear.
- Milestones as recorded in docs/DECISIONS.md, checked from the game-result object after every game.
- Screens, by controller: pack opening with a reveal per item, inventory with filters, and equip per player showing the rating change and set progress before I confirm.
- A test that opens 100,000 packs and checks the observed rarity rates and pity timer against the tables.

Show me your plan first. Done when I win a game, receive a pack, open it, equip a piece and can see its effect in the player's on-ice numbers.
```

**Phase 7: franchise loop**

```text
Read CLAUDE.md, the progression, aging and prestige sections of docs/GDD.md, and docs/DECISIONS.md. Build what happens between seasons.

- XP from the game-result stats, per the GDD; level-ups grant skill points capped by hidden potential; benched players earn a small share.
- Season end: bank XP, age every player in the league by one year, apply the aging table (speed and stamina decline first; passing and positioning last), roll retirements, tick contracts down.
- Off-season: re-sign expiring players at a cap hit from their current grade, free agency, and a rookie class entering the pool. AI teams fill their rosters and re-sign or lose players by simple, legal rules.
- Trades with AI teams: propose player-for-player; the AI accepts when it gains value and stays under its cap.
- Prestige exactly as recorded in docs/DECISIONS.md: keeps roster, contracts, gear, tape, XP and skills; wipes artifacts and powerups; grants the prestige reward.
- Off-season screens by controller, with a clear summary of who improved, who declined and who retired.

Then add a headless multi-season runner with a simple auto-manager, and run 20 seasons from 20 seeds. Report: distribution of grades by year, average age, how often any team cannot field a legal roster, and whether the cap ever deadlocks. Tune the tables until the league stays stable, and show me the numbers.

Show me your plan first. Done when I can play season after season and the 20-season report is healthy.
```

**Phase 8: economy, facilities and mascot**

```text
Read CLAUDE.md, the franchise economy and mascot sections of docs/GDD.md, and docs/DECISIONS.md. Build the second budget and what it buys.

- Operating cash: revenue lines and expense lines from the GDD tables, calculated per game and per season, with every number in src/data. Propose a full set of starting numbers and show me a sample season's income statement before building screens.
- Franchise value as the long-term score.
- Running out of cash triggers the fire sale described in the GDD.
- Staff (trainers, scouts, promoters): generated pool, grades, salaries and contracts, with effects applied through the modifier system.
- Facilities, levels 1 to 5, with the effects in the GDD table, build costs and upkeep.
- Scouting: hidden potential and part of the free-agent pool are hidden until scouting reveals them.
- Mascot: drop-in roll before each game from 5% up to a 35% cap by mascot power; replaces one dressed skater for that game; talents from the GDD table; rules for goalies and declining as recorded in docs/DECISIONS.md. AI teams and bosses have mascots too.
- Screens by controller: finances, staff, facilities, mascot.

Extend the 20-season headless runner with the economy and report cash and franchise value by season for a cautious, a balanced and a free-spending auto-manager. Tune until none goes bankrupt by sensible play and none ends with cash it has nothing to spend on.

Show me your plan first. Done when the economy screens work and the three reports look healthy.
```

**Phase 9: polish**

```text
Read CLAUDE.md. The game is feature complete. Make it presentable, in this order, and stop for my review after each item:

1. A first-run flow that teaches the controls in a practice skate and explains the cap, the run map and packs in one screen each.
2. A consistent visual style for menus: one type scale, one colour palette, readable at arm's length on a phone in landscape.
3. Simple original player, rink and puck art to replace placeholder shapes, and team colours generated per team. Nothing copied from any existing game.
4. Sound: skates, passes, shots, posts, hits, goal horn, crowd swell. Use sounds I supply or ones with a licence that allows this use, and list the source of each.
5. Touch controls as a fallback: virtual stick on the left, pass, shoot and check buttons on the right.
6. Home-screen install polish: icon, splash screen, works offline after first load.
7. A performance pass on my phone: steady 60 frames per second during play.

Do not change game rules or balance values in this phase.
```

## Decisions to settle

Only the first decision blocks the start; the rest have a recommended default you can accept or change before the phase that needs it.

| Decision | Recommended default | Needed by |
| --- | --- | --- |
| Which phone, and do you have a Mac? | Web build as planned. Only a firm need for an App Store release on iPhone would change the stack. | Phase 0 |
| What does F or D mean with 2 skaters? | An AI tendency only: F leans to attack, D stays back. Any two skaters can form a line. | Phase 4 |
| Backup goalie? | None. Goalies tire but are never injured. | Phase 4 |
| How long is a season run? | 3 regions of 2 games plus a boss, then two best-of-3 playoff rounds: 13 to 15 games, roughly 1.5 to 2 hours, saved between games. | Phase 5 |
| What does a normal loss cost? | Three strikes: the third loss on the map ends the season. A lost playoff series ends it outright. | Phase 5 |
| Powerups vs artifacts | Powerups are consumables triggered with LT / RB and expire at season end. Artifacts are passive team-wide effects kept across seasons until prestige. | Phase 5 |
| Does a season reset anything? | Yes: powerups, run currency and training bumps reset each season, so each run starts fresh while artifacts build toward prestige. | Phase 5 |
| Who owns gear? | The team. Gear is assigned to a player, returns to inventory when the player leaves, and never changes grade or cap hit. | Phase 6 |
| Milestone targets | Scaled to the run: 4, 8 and 12 wins; a 12-goal player; 3 shutouts; a hat trick. | Phase 6 |
| What does prestige give? | A harder league tier with better pack odds, plus one jersey design per level. | Phase 7 |
| Can AI teams poach expiring players? | Yes. Anyone you do not re-sign enters free agency and AI teams can sign them. | Phase 7 |
| Can the mascot replace the goalie? | No, skaters only. | Phase 8 |
| Can a mascot drop-in be declined? | No, but you see it before the game and choose which skater sits. | Phase 8 |
| Game name | Keep a working title for now; choose an original name before sharing a link publicly. | Phase 9 |

Once you have chosen, the answers go into `docs/DECISIONS.md`, which the Phase 5 to 8 prompts read.
