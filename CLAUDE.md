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
src/core/    game rules: players, grades, cap, gear, packs, XP, aging, contracts, trades, prestige, cash, staff, facilities, mascot, run map
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
npm run seasons    # league health and the economy over many seasons: -- --seeds 20 --years 20 [--style cautious|balanced|spender]
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Deploy: push to `main`. `.github/workflows/deploy.yml` runs the type check and tests, builds, and publishes to https://tgpiercy.github.io/hockey-roguelite/. A failed check blocks the deploy.

The site lives under `/hockey-roguelite/` (`base` in `vite.config.ts`). Controllers need HTTPS or localhost, so test on the phone from the deployed link.

## Standing rules

- Tuning numbers live in `src/data` and never in code.
- Every rule in `src/core` has a unit test.
- No image or font files: menus are HTML and CSS, the rink is drawn in code.
- Ask before adding a dependency.
- `docs/GDD.md` is the source of truth for design; `docs/DECISIONS.md` records anything we decide that it does not cover.

## How the franchise side fits together

- Rules live in `src/core`, each with tests in `tests/player.test.ts` and `tests/league.test.ts`:
  `player.ts` (overall, grade, cap hit), `names.ts`, `generate.ts` (seeded league), `league.ts` (the data shapes and lookups),
  `roster.ts` (cap, sign, release, can the team play), `lineup.ts` (two lines of 3 and a goalie; auto-fill; repair),
  `save.ts` (save document, version check, migration steps), `matchup.ts` (a dressed lineup becomes the simulation's `TeamSetup`; a result updates the record).
- Tables are in `src/data`: `grades.json` (bands and cap ranges), `overallWeights.json`, `league.json` (cap, roster sizes, how the league is generated), `names.json`.
- Roster moves return `{ ok: true }` or `{ ok: false, reason }`; the reason is written to be shown to the player as it is.
- A save is one JSON document with a `schemaVersion`. Loading always goes through `fromSave`. When the save shape changes, bump `SAVE_VERSION` and add a step to `migrations` in `save.ts`; never break old saves.
- Menus are in `src/ui`: `App.tsx` holds every screen; each screen is one `Menu` (`Menu.tsx`), so all of them work the same way with the controller. `menuInput.ts` turns d-pad, left stick, A and B (and arrows, Enter, Escape) into menu moves. `storage.ts` is the IndexedDB wrapper; the game saves after every roster move, lineup change and game.
- `matchView.tsx` starts a game on the ice between two dressed teams and tears it down when the player leaves the summary; the menus are hidden meanwhile.
- Pausing: `matchView.tsx` holds the paused flag and `RinkScene` reads it through its `paused` option (it still draws, but runs no steps). The pause menu is `src/ui/PauseMenu.tsx`, ordinary `Menu` screens rendered into `#pause`, with `menuInput` started while it is open. The Menu button, Tab, Escape, the on-screen Pause button and a hidden page all pause. "End game" calls `scene.forfeit()`, which ends the game with `forfeitResult` (`src/sim/match.ts`): `forfeit: true` and the other team as winner, so `recordGame` counts a loss. The tuning panel opens from the pause menu.

## How the season run fits together

- `src/core/quickGame.ts` settles a game from team strength without simulating it; the season uses it for "Simulate" and the health checks use it for whole seasons.
- `src/core/season.ts` is the season as a state machine. `Franchise` (league, record, season state, artifacts) is everything that is saved. Every action (`startSeason`, `travel`, `recordGame`, `train`, `chooseEvent`, `buy`, `healStrike`, `leaveShop`, `pickArtifact`, `setLoadout`, `abandonSeason`, `endSeason`) takes the franchise, changes it, and returns `{ ok, message }` or `{ ok: false, reason }` written for the player. `matchup(f)` gives the game waiting to be played, or null.
- `src/core/seasonMap.ts` generates the map from a seed; `src/core/bosses.ts` builds boss teams and ranks the AI teams by strength.
- Content is data: `src/data/season.json` (map shape, strikes, rewards, prices, AI level by region), `powerups.json`, `artifacts.json`, `events.json`, `bosses.json`. Tests in `tests/season.test.ts` check every entry is valid, so new content only needs a data entry.
- **One modifier system** (`src/sim/modifiers.ts`). A modifier is `{ stat, op: 'add' | 'mul', value }`. Stats the simulation reads are the fields of `SkaterEffects` and `GoalieEffects`; anything else (`currencyGain`, `shopPrice`, `trainingBonus`, `powerupDropChance`) is read by the season rules. Artifacts, boss traits, event effects and powerups are all lists of these. Gear (Phase 6) and staff (Phase 8) should use the same system, not new special cases.
- Lasting team modifiers go into a game through `TeamSetup.modifiers`. A powerup is loaded through `WorldOptions.powerups`; `src/sim/powerups.ts` starts its timed boost when the button is pressed and ends it on the game clock. `GameResult.powerupsUsed` tells the season which ones to take out of the bag.
- All randomness in a season comes from its seed and a roll counter, so a season replays exactly.
- `tests/seasonRun.test.ts` plays whole seasons automatically with real simulated games; it prints how each ended.

## How gear and packs fit together

- `src/core/gear.ts`: the gear item, generation from the tables, the modifiers a piece gives, set bonuses, equip, level up, scrap. `src/core/packs.ts`: awarding a pack (contents rolled then, from the franchise seed and a counter), the pity timer, which pack a win earns, opening. `src/core/milestones.ts`: the season milestones and the tallies behind them.
- Tables: `src/data/gear.json` (slots, rarity table, which ratings each slot boosts, level costs, scrap values), `sets.json`, `perks.json`, `packs.json`, `milestones.json`.
- Gear lives on the franchise (`gear`, `packs`, `tape`), not on players: `wornBy` on a piece names who has it on. Releasing a player goes through `releasePlayer`, which sends his gear back to the inventory.
- Gear uses the modifier system (as do staff and facilities, see below). A rating boost is a modifier with a stat like `rating.shooting`; `matchup.dress` applies those to the ratings (so the grade and cap hit, which come from the stored ratings, never move) and passes the rest (perks, set bonuses) to the simulation as that player's own modifiers through `TeamSetup.skaterModifiers` and `goalieModifiers`.
- Seven abilities exist only for modifiers to switch on, and are off by default: `carrySpeedScale`, `chargedShotScale`, `passThrough`, `oneTimerScale`, `bigHitKnock`, `breakawaySpeedScale` (skaters) and `periodAutoSaves` (goalies). The set bonuses in `sets.json` use the last three skater ones.
- `season.recordGame` awards the pack for a win and a Gold pack for each milestone the game completes.
- `tests/gear.test.ts` includes the 100,000-pack check of the rarity table and the pity timer.

## How the franchise loop fits together

- A season ends through `finishSeason(f)` in `src/core/offseason.ts`, never `endSeason` directly. In order: bank XP and level up (`xp.ts`), develop everyone who is not yours off the ice and age the league a year (`aging.ts`), roll retirements, tick contracts, then call `endSeason`. It fills `f.offseason` (the report, your `pending` expiring contracts, `leagueMoved`).
- `decideContract(f, id, years | null)` settles one of your expiring contracts. When the last is settled (or there were none), `leagueMoves(f)` runs: AI teams re-sign or drop, fill their rosters from the pool (including players you let go), rookies arrive, and the pool is topped up and trimmed. `startSeason` refuses while contracts are pending.
- A cap hit changes only when a contract is signed (`resignCapHit`, and when an AI team signs). `regrade` in `xp.ts` updates overall and grade and leaves the cap hit alone.
- `src/core/trades.ts`: `tradeValue`, `evaluateTrade` (the reason is shown to the player), `trade`. `src/core/prestige.ts`: `canPrestige`, `prestige`, `prestigeEffects`, and the jersey colours. Prestige reaches games through `matchup()` (opponent ratings and AI level) and packs through `rarityTable(boost, floor)`.
- Tables: `src/data/xp.json`, `aging.json`, `offseason.json` (rookies, pool, trade values, quick-game values), `prestige.json`.
- `src/core/quickSeason.ts` is for health checks only: an automatic manager (`autoOffseason`), games settled from strength (`quickResult`) and `leagueSnapshot`. `tests/harness/seasons.ts` and `npm run seasons` use it; the numbers are in `docs/TUNING.md`. Re-run it after any change to the XP, aging or off-season tables.
- Save version 4 adds `xp` and `level` per player and `prestige` and `offseason` on the franchise.
- Screens: off-season report, expiring contracts, trade (team, their player, your player, confirm), prestige and jersey colour, all in `App.tsx`. The jersey colour reaches the rink through `playMatch({ homeColour })`.
- Tests are in `tests/franchise.test.ts`, including 20 seasons from 20 seeds.

## How the club side fits together (cash, staff, facilities, scouting, mascot)

- Cash only moves through `book(f, line, amount)` in `src/core/ledger.ts`, so the income statement always adds up to the change in cash. `f.ledger` is this season so far; `f.books` holds every closed season.
- `src/core/economy.ts`: what each game pays (`bookGame`, called from `season.recordGame`), the end-of-season bills (`bookSeasonEnd`, called first thing in `finishSeason`), franchise value, and the fire sale (`inFireSale`, `playerSalePrice`, `canBailOut`, `bailOut`). `startSeason` refuses with cash below zero.
- `src/core/facilities.ts` and `src/core/staff.ts` each turn what you own into modifiers; `src/core/club.ts` joins them (`clubModifiers`, `clubStat`). The stats are `xpGain`, `xpGain.F|D|G`, `agingDecline`, `resignCost`, `scouting`, `ticketRevenue`, `merchRevenue`, `sponsorRevenue`, `mascotPower`, read by the rules, and `drainScale` and `recoverScale`, which reach the ice through `teamModifiers`. In the data a "mul" is written as a rate per level or grade step; `scaleModifiers` in `src/sim/modifiers.ts` turns it into a multiplier.
- `src/core/scouting.ts`: `potentialRange`, `hiddenFreeAgents`, and `signPlayer`, which the menus and the automatic manager use instead of `roster.sign` (it refuses hidden players and notes the signing in `f.offseason.signed`, which is what stops a fire-sale exploit).
- `src/core/mascot.ts`: power, drop-in chance, AI and boss mascots, `withMascot` (a dressed team with him in one skater's place). `season.matchup` rolls the drop-in for both sides and reports it in `Matchup.mascots`. His id in a dressed team is `MASCOT_ID`; XP and milestones skip it.
- Talents run in `src/sim/talents.ts` from `src/data/talents.json`: a skater's `talents` list comes from `TeamSetup.skaterTalents`. Timed ones reuse the boost code (`startBoost` in `powerups.ts`); the spin move hooks into `check.ts`.
- Tables: `src/data/economy.json`, `facilities.json`, `staff.json`, `scouting.json`, `mascot.json`, `talents.json`. Manager styles for the health check are in `offseason.json` under `quick.styles`.
- Save version 5 adds `cash`, `value`, `ledger`, `books`, `staff`, `staffPool`, `facilities`, `mascot`, `tenure` and `offseason.signed`.
- Screens: Finances, Staff (and hiring), Facilities, Mascot, in `App.tsx`; reachable in and out of season.
- Tests are in `tests/club.test.ts`, including 20 seasons under three manager styles. After changing any economy number, run `npm run seasons` and update `docs/TUNING.md`.

## How the look fits together

- Every colour and size the menus use is a CSS variable at the top of `src/style.css`. Do not hard-code colours in components.
- `src/ui/Menu.tsx` is still every screen: the list on the left, and a side panel with the screen's facts (`header`) above the focused item's `detail`. `stack` puts the facts across the top instead, for screens that are mostly to read (rewards, pack reveal). `onFocus` tells the screen which item is focused (the season map lights it up). The help line draws "A ..." and "B ..." as button glyphs.
- The top bar's strip of cap space, cash, tape and Pucks is `Wallet` in `parts.tsx`, handed to every `Menu` through the `MenuChrome` context in `App.tsx`.
- Shared pieces in `parts.tsx`: `PlayerRow`, `Ratings` and `RatingBar` (bars from 40 to 99), `Meter`, `CapLine`, `Dots`. In `App.tsx`, `tile(...)` makes a hub-style row (bold name, what it is, optional badge or lock).
- The hub is a dashboard: the primary actions as wide buttons, then the four groups (`team`, `office`, `collection`, `settings` screens) and Exhibition as `card(...)` tiles. `Menu` takes `columns` for a grid and items take `wide`; which tile the d-pad moves to is `gridMove` in `src/ui/gridMove.ts` (pure, tested). `home()` goes back to the group the player came through; `top()` goes to the very top. The game opens on the `title` screen.
- Icons are line drawings in `src/ui/Icon.tsx`; a `tile` gets its icon from `TILE_ICONS` by its key, or names one. Gear drawings are in `src/ui/GearArt.tsx`.
- Faces: `src/core/portrait.ts` works a portrait out of the player's id and age; `src/ui/Portrait.tsx` draws it; `Face` in `parts.tsx` adds the colours he wears, which `App.tsx` provides through `WearingContext`. `PlayerRow` shows it, so every list has faces.
- Three stars: `src/core/stars.ts`, shown by `src/ui/GameSummary.tsx`.
- `?sheet` opens `src/ui/ArtSheet.tsx`: every portrait style, icon, gear drawing and crest on one page. Look at it after changing any art.
- `src/ui/SeasonMap.tsx` draws one region of the map as SVG from `season.map`, `season.visited` (the route walked) and the stops that can be reached.
- After a season game `recordGame` (or `simulateGame`) returns `rewards`, and the `rewards` screen steps through it.
- The drawn pieces of the season and management screens are in `src/ui/screens/`: `season.tsx` (stop cards, the matchup poster, shop cards, training gain, event header, season summary, the report's before-and-after row) and `club.tsx` (facility and staff cards, the player comparison, the trade offer, the mascot panel, the prestige ladder). `App.tsx` keeps the flow: which screen, which items, what each does. Older screens still have their markup in `App.tsx`.
- Charts are `src/ui/Charts.tsx` (`BarRow`, `LineChart`), with the arithmetic in `src/ui/chartMath.ts` (pure, tested). Lines on one chart share a scale that starts at zero.
- Pure helpers behind those screens, tested in `tests/screens.test.ts`: `src/core/compare.ts` (`sortPlayers`, and `wouldReplace`: the player a newcomer would most likely take the place of) and `src/core/seasonSummary.ts` (how far the season got, the top scorer, milestones, packs).
- The lineup is a three-column grid in the order the line stands: wing, centre, wing. The item keys still carry the real slot (`slot` 0 is the centre).
- The rink is drawn in code in `src/game/RinkScene.ts` (`drawRink`, `drawPlayers`, `drawPuck`, `drawHud`); every colour and proportion is in `src/data/rinkLook.json`. Team colours come from `src/core/teamColours.ts`.
- Players on the ice are upright cartoon figures standing on the top-down rink. `src/game/figure.ts` (pure, tested in `tests/figure.test.ts`) turns a pose into a list of shapes (circles, round-ended limbs, polygons, each tagged with what it is), built facing right and mirrored; every proportion is under `figure` in `rinkLook.json`. `src/game/drawFigure.ts` paints a pose once into a canvas; `RinkScene.drawPlayers` rounds each player's pose to a few steps, keeps one texture per pose (`figureKeys`, repainted on resize), and shows it on that player's sprite, flipped to face left and sorted by depth. Shadows, the control ring and sticks are on the graphics layer below the sprites; the puck and sparks on the one above (`top`). `src/ui/FigureArt.tsx` draws the same shapes as SVG for the art sheet. Do not go back to painting shapes with Phaser graphics every frame: that cost about 6 ms a frame. Each team has two kits (`figureColours(..., kit)`): its colour at home, white on the road; `RinkSceneOptions.whiteTeam` says who wears white, and `playMatch({ userAtHome })` sets it from the schedule (`isHomeGame`). The ring under the controlled player and the arrow over the puck carrier (either team) are under `reticle` in `rinkLook.json`.
- Touch: `src/game/touch.ts` holds the shared touch state and turns it into an `InputFrame` (pure, tested); `src/ui/TouchControls.tsx` is the overlay that writes it; `InputReader` merges it with the controller and keyboard.
- Crests: `src/core/crest.ts` works a team's badge and jersey design out of its name (lists in `src/data/crests.json`, outlines as point lists in the same file). `src/ui/Crest.tsx` draws it as SVG and `src/game/drawCrest.ts` on the ice from the same points.
- On-ice effects are in `src/game/effects.ts` and the crowd in `src/game/drawArena.ts`; both only read the simulation. `RinkScene` hands them the events `step()` returns. Numbers are under `effects` and `arena` in `rinkLook.json`. Randomness there uses `createRng`, like everything else.
- Sound: `src/game/soundMap.ts` says which event makes which sound (pure, tested); `src/game/audio.ts` synthesises each from its recipe in `src/data/audio.json` and runs the crowd bed (the skating sound was removed after the owner listened). `gameAudio.played` counts what was asked for, which is how to check sound without hearing it; to measure a sound, render `playSound` into an `OfflineAudioContext` in the browser (the test environment has no audio).
- Device preferences (sound, volume, rink detail, on-screen controls) are in `src/ui/prefs.ts`, stored apart from the save.
- Pack opening is `src/ui/PackOpening.tsx`; all motion is CSS at the end of `src/style.css`, switched off under `prefers-reduced-motion`. Do not name a class `up` or `down`: those are global colour classes.
- **Seeing the game when the app window is hidden.** Ordinary screenshots time out then. What works: in the page, serialise the DOM into an SVG `foreignObject`, draw it to a canvas, and POST the PNG to a small local Node receiver; for the rink, step a frame (`__game.loop.step`) and copy `__game.canvas` in the same task. Then read the PNG file. The SVG's size sets the viewport, so 844 x 390 gives a phone-landscape layout whatever the real window is. To get the rink itself at phone size, set the browser tab's viewport to 844 x 390 before starting a game. Add `*{animation:none !important}` to the copied styles, or a screen is caught mid-animation.

## How the on-ice game fits together

- `src/sim/world.ts`: `createGame(tuning, seed, options)` starts a full game; `createWorld(...)` starts a scrimmage (endless play, no clock, faceoffs or line changes; used by most tests). `step(world, humanInput, tuning)` advances either by one fixed step of 1/60 second and returns the events that happened. Nothing else advances the game.
- Game rules are in `src/sim/match.ts`: periods, the clock, the faceoff duel, overtime, and `gameResult(world)`, which later phases use for XP and milestones. (It is not called `game.ts` because the folder rule test treats `game` as the rendering folder.)
- 14 players are dressed: for each team, ids run from `team * 7`: six skaters (the first three are line 1, the next three line 2; `slot` 0 is the centre), then the goalie. `onIce` says who is playing. Use `skatersOf`, `availableSkaters` (not heading to the bench) and `onIce` from `team.ts` rather than looping over `world.players`.
- Lines, the bench and fatigue are in `src/sim/lines.ts`. A line change sends skaters to the bench door, where each is swapped for his opposite number; the puck carrier goes last. Changes are automatic at safe moments, and the line-change button forces one.
- Humans and AI use the same mechanics: both produce an `InputFrame`. `src/sim/ai.ts` is a five-state machine (attack, support, chase, defend, backcheck). In the attacking zone (`inZone`) the skaters without the puck take posts (`postsFor`, `postSpot`: net-front, wing, point) instead of following the carrier, and a carrier beyond normal range may plant his feet and take a long shot (`AiMemory.plant`). Positioning numbers and the easy-to-hard ranges are in `src/data/ai.json`. Difficulty changes thinking only, never physics.
- **Checking** (`check.ts`): `stepChecking` tracks the button and throws on release through `resolveCheck(world, p, charged, ...)`. A tap is a poke; held for `check.bodyHoldSeconds` it is a body check if the carrier is within `bodyRange`. `Player.checkClosing` keeps the fastest closing speed during the hold, which is what `minClosingSpeed` and the big hit are judged by. The AI holds through `AiMemory.checkSteps`. The limits a check is judged by come from `checkRules(world, p, t)`: the skater the human controls gets the easier `checkAssist` ones (wider poke arc, better odds, shorter hold, longer reach, a short wait after a miss); read limits through it, not from `t.check`. The human's shots get `aimAssist` (aim at the open corner, and `spreadScale` less scatter); aim nearer the post, not further in, to help.
- Moves beyond skate, pass, shoot and check: a **one-timer** (shoot held as a pass arrives fires first-touch: `oneTimerArmed` set in `contact.ts`, released in `world.ts`; any shot inside `shot.oneTimerWindow` of receiving a pass is a full wind-up times `shot.oneTimerPower`, and gear's `oneTimerScale` multiplies it); a **deke** (the switch button while carrying: `stepDeke` in `world.ts`, and a check during `Player.deke` fails in `check.ts`); a **big hit** (a body check at `check.bigHitClosingSpeed` or more sets `knockedDown` and a longer stagger); and rebounds pulled toward the slot (`makeSave`). The goalie steps out on a straight-on carrier (`goalie.challengeDepth`) and meets a shot at the depth he stands at.
- **Shot fake** (`src/sim/fake.ts`): pass pressed during a wind-up cancels the shot (`stepFake` returns the input with pass taken out while it stays down); the goalie's `bitten` timer holds him still in `stepGoalie`. **Shot block**: `braced(world, p, t)` in `check.ts` (check held a while, without the puck, the carrier not close); a braced skater is slowed in `world.ts` and stops an opponent's shot in `resolveLoosePuck` with a `block` event. The AI does neither.
- **Hints**: `src/game/hints.ts` (pure, tested) says which move is on for the human now (`hintsThatApply`, `hintFor`) and which event counts as doing one (`hintDone`); texts and timing in `src/data/hints.json`. `RinkScene` shows one line where the goalie-pull prompt goes. On or off is `Prefs.hints`; the counts are stored apart under `hockey-hints` (`loadHintCounts` in `prefs.ts`) so a settings change can never wipe them. A new move needs an entry in `hints.json`, a condition and an event.
- **Momentum** (`src/sim/momentum.ts`): `TeamState.heat` fills from goals, big hits, one-timers and saves; full starts the `onFire` boost through `startBoost`. **Tips and screens** (`src/sim/tips.ts`): `screened` lengthens the goalie's reaction in `goalie.ts`; `stepTips` redirects a shot past a teammate near the net. **Give and go**: `world.human.giveGoOffer` is set when the human passes; a second press of pass makes it `giveGo`, `updateControl` and `givePuck` then keep control on the passer, and the receiver's AI returns the puck through `AiMemory.passTo`. **Goalie pull** (`lines.ts`: `mayPull`, `pullGoalie`, `returnGoalie`, `stepPulls`): the goalie goes off the ice and a bench skater comes on as `TeamState.extra`; line changes are held while pulled; `freshLineOn` undoes it at any faceoff. `InputFrame.pullGoalie` is the View button or G.
- **Boss tricks** are abilities switched on by modifiers in `bosses.json`: `periodAutoSaves`, `gainBurst`, `alwaysKnockdown`, `fullPress`, and `unstoppableCharged` (given to the best shooter through the boss's `star` list). The scene draws each one's tell.
- The scene (not the simulation) freezes for a beat on a big hit or a goal and runs in slow motion after a goal (`effects` in `rinkLook.json`); the scorer's figure cheers.
- AI teams have a **style** (`rush`, `cycle`, `dump` in `ai.json`): `src/core/playStyle.ts` picks it from the team's name, `dress` puts it on every team but the user's, and `styleOf` in `ai.ts` reads it. In defence one free defender guards the slot between carrier and net; in support a covered teammate slides until his passing lane is clear.
- Ratings (0 to 100) become physical effects in `src/sim/ratings.ts` from the table in `src/data/ratings.json`. A skater rated 70 gets exactly the plain `physics.json` values. To make a rating worth more or less, steepen or flatten its range but keep the value at 70 where it is (ten points is now about 2 to 4%).
- **Player kinds and talents** (`src/core/playerKind.ts`, `src/data/playerKinds.json`): `kindOf(position, ratings)` works a player's kind out from his ratings (nothing is stored); `generatePlayer` leans a new player toward a rolled kind and may give him its talent (`PlayerRecord.talent`, optional). `dress` sends talents to the ice through `TeamSetup.skaterTalents`, the same road the mascot's take.
- One concern per file: `rink.ts`, `skater.ts`, `puck.ts`, `shot.ts`, `aim.ts` (aim assist for the human's shots; pass assist is `assistedPassTarget` in `pass.ts`), `pass.ts`, `check.ts`, `goalie.ts`, `contact.ts` (bodies and loose-puck pickups), `control.ts` (which skater the human controls), `team.ts` (helpers).
- Every sim function takes the tuning object as an argument; only `src/sim/tuning.ts` reads `src/data/physics.json`. That is what lets the tuning panel change values mid-game.
- Units are metres and seconds. Y points down the screen.
- `src/game/RinkScene.ts` runs as many fixed steps as real time needs each frame, then draws. `src/game/input.ts` turns controller and keyboard into one `InputFrame`; button numbers and keys are in `src/data/controls.json`. `src/ui/GameSummary.tsx` is the end-of-game screen.
- Tuning panel: `src/ui/tuningStore.ts` and `src/ui/TuningPanel.tsx`. It lists every number in `physics.json` automatically. Edits are kept in the browser until Reset. Export JSON downloads a replacement `physics.json`. Log tuning changes in `docs/TUNING.md`.
- Balance harness: `tests/harness/harness.ts` (`runGame`, `runSeries`) and `tests/harness/bot.ts` (a scripted stand-in for a simple human). `scripts/balance.mjs` runs them from the command line through Vite. The targets and the latest numbers are in `docs/TUNING.md`; re-run the series after any change to ratings, AI or goalie values.
- Tests read the shipped tuning and assert relative to it. `tests/helpers.ts` has helpers to place players and hand out the puck.

## Notes for future sessions

- On the ice it is 3 skaters and a goalie a side; 6 skaters and 1 goalie are dressed (two lines of 3). Where a prompt in `docs/IMPLEMENTATION_PLAN.md` says 2 skaters, 4 skaters or lines of 2, `docs/GDD.md` and `docs/DECISIONS.md` win.
- The plain link opens the title screen, then the hub. "Start the season" begins a run; "Exhibition" is a one-off that does not count.
- Difficulty (`f.difficulty`, set in Settings between seasons) shifts opponent AI level only. Ordinary map games can be simulated (`simulateGame`); the run currency is called Pucks in everything the player reads (the field is still `season.currency`).
- Keyboard fallback: arrows or WASD skate, Space shoot (Z or J while winding up: fake), Z or J pass and faceoff draw, X or K check, C or L switch player, Q line change (LB), 1 and 2 powerups (LT and RB), G pull the goalie (View button), Shift sprint, Tab or Escape pause (Menu button; the tuning panel opens from the pause menu), I AI debug overlay (keyboard only).
- Balance (AI against AI, level 0.5) meets the Phase 3 targets. Human against AI is not balanced yet: a scripted player that only skates to the slot and shoots still wins about two games in three at the default difficulty of 0.75.
- In local development `window.__game` is the Phaser game. When the browser tab is hidden, animation frames stop; drive them by hand with `__game.loop.step(timeMs)`.
- The desktop app's "start preview" tool hung on this PC right after Node.js was installed. If it still does, start the server from a shell with `npm run dev` and open http://localhost:5173/hockey-roguelite/.

- `src/ui/PadReadout.tsx` shows live what the game reads from the controller and the on-screen buttons (pause menu, Controls; Settings, Controller test). Use it first when a button "does nothing" on a real device.
- Which button does what is `padMap()` in `src/game/padMap.ts`: the standard layout from `controls.json`, or the player's own from Settings, Set up controller (`src/ui/PadSetup.tsx`), stored on the device under `hockey-padmap`. `InputReader` and `menuInput` both read through it with `bindingDown`; never read `controls.buttons` directly for an action. A binding is a button or an axis pushed one way.
- Controller input is read with the browser's Gamepad API in `src/game/gamepad.ts`, not Phaser's gamepad plugin. A controller only appears after its first button press. `readGamepad` does not take the first device listed: `pickPad` stays with the controller in use and moves to another only when that one is being pressed and the current one is not (phones list fingerprint readers and remotes as controllers). `seenPads` lists them all; the read-out names the ones not in use.
- Button and axis names for the standard Xbox layout, with the GDD action for each, are in `src/data/xboxMapping.json`.
- iPhones ignore the manifest's landscape lock, so the page shows a "turn your phone sideways" notice in portrait.
- The controller mapping was confirmed on the owner's controller on 2026-11-14, and the Phase 0 test page at `?controller` was removed.
