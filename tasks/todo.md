# Phase 0: setup

Built, deployed and checked with a simulated controller.

- [x] Controller confirmed by the owner on 2026-11-14 (in the game itself; the `?controller` page is removed)
- [ ] Tag `phase-0` once it passes

# Phase 1: skating and puck

- [x] Data: `physics.json`, `controls.json`, `rinkLook.json`
- [x] Rink geometry, boards, nets and collisions
- [x] Puck: friction, bounces, pickup, carry
- [x] Skater: momentum, turning, glide, braking, sprint and stamina
- [x] Shooting: tap and charge, aim, power and accuracy parameters
- [x] World step, goal detection, reset after a goal
- [x] Tests for all of the above, plus exact replay from a seed
- [x] Rink scene, controller and keyboard input, stamina and charge bars
- [x] Tuning panel with export
- [x] Docs: `TUNING.md`, `DECISIONS.md`, `CLAUDE.md`
- [x] Checked in a browser
- [x] Commit, push, deploy green
- [x] Works on the keyboard (owner confirmed)
- [ ] Exit test on the phone with the controller: skating and shooting at an empty net is fun for 5 minutes (owner)

## Review

- Type check, 86 tests and the build pass.
- Browser check on this PC (frames driven by hand because the pane was hidden): with the keyboard the skater reached top speed, picked up the puck, sprinted (stamina drained), charged a shot, shot and scored; the goal pause and reset ran. With a simulated controller the left stick skated, RT sprinted, Menu opened the tuning panel, the d-pad chose and changed a value with hold-to-repeat, and the change was kept in the browser. Export offered `physics.json`; Reset restored the defaults. No console errors. The `?controller` page still loads.
- Not checked: real-time play at full frame rate, touch on a phone, a real controller, and above all how it feels. Those are the owner's test.
- Cut or simplified: the puck is always collected on contact (no bouncing off a skater at high speed); the skater can carry the puck into the net for a goal; no sound.

# Phase 2: 3-on-3

- [x] Six-player world, ratings table, Phase 1 tests moved to the new shape
- [x] Puck handling rules, passing (flat and saucer), control switching
- [x] Checking (body and poke), stagger, body contact
- [x] Goalie: angle play, delayed reaction, freeze or rebound, outlet pass
- [x] Skater AI: attack, support, chase, defend, backcheck; difficulty
- [x] Tests for each, plus all-AI whole games
- [x] Drawing, new buttons and keys, AI debug overlay
- [x] Checked in a browser
- [x] Commit, push, deploy green
- [x] Changed to 3 skaters and a goalie a side at the owner's request (6 skaters + 1 goalie dressed); GDD updated
- [ ] Exit test with the controller: continuous 3-on-3 with goals by both sides; you win some shifts and lose some; passes go where you meant (owner)

## Review (Phase 2)

- Type check, 172 tests and the build pass.
- All-AI games (6 seeds, 5 minutes each, both teams at level 0.5): scores 2-2, 3-2, 0-1, 1-0, 1-2, 1-2. Per game about 43 shots, 28 saves, 122 passes, 32 checks, 2.8 goals.
- Browser check (frames driven by hand): a scripted keyboard player chased the puck, carried it and shot for 3 simulated minutes against the AI; it finished 2-1 with no console errors. The debug overlay and View button toggle worked.
- Not checked: real-time play by a person, the controller, and whether it is fun or fair.
- Known rough edges for Phase 3: scoring is low against the 3 to 5 goals a side target; no one-timers; the AI never dumps the puck or changes pace; goalie stamina does nothing yet.

# Phase 3: full game and balance harness

- [x] 14 dressed players, bench and on-ice flags; existing tests moved to the new numbering
- [x] Periods, clock, overtime, game result
- [x] Faceoff timing duel
- [x] Energy, line changes at the bench door, automatic changes, LB override
- [x] Stats: goals, assists, shots, hits, time on ice, saves, goals against
- [x] Harness and `npm run balance`
- [x] Tuned to the three targets (numbers in `docs/TUNING.md`)
- [x] Scoreboard, faceoff cue, bench doors, line energy, end-of-game summary
- [x] Checked in a browser
- [x] Commit, push, deploy green
- [x] Aim assist and pass assist added at the owner's request
- [ ] Exit test: a full game plays start to finish on the phone with the controller; go / no-go on whether it is fun (owner)

## Review (Phase 3)

- Type check, 228 tests and the build pass.
- Balance over 200 games each, AI against AI at level 0.5: equal teams score 3.37 and 3.16 (target 3 to 5); the 90-rated team wins 75.5% against 70 (target about 75%); save percentage .855 and .872 (target .850 to .920). Before tuning: 1.48 and 1.36 goals, 89.0%, .904.
- Browser check (frames driven by hand): a scripted keyboard player played a whole game from the opening faceoff to the summary screen (lost 2-3); a false start locked it out of a faceoff; Q forced a line change; automatic changes happened through the game; pressing Z on the summary started a new game; a game forced to a tie went to overtime and ended on the next goal ("You win: 3 - 2 (OT)"). No console errors.
- Not checked: real-time play by a person, the controller, and whether it is fun.
- Known problems:
  - Human against AI is too easy. A scripted player that only skates to the slot and shoots wins about two games in three at the default difficulty (0.75), and more at 0.5. The AI defence does not stop a direct carrier well enough.
  - Save percentage for equal teams (.855) is only just inside the range.
  - During a line change a team is short-handed for a few seconds; the AI does not cover for that.
  - No one-timers; the AI never dumps the puck in.
- Tried and removed: slowing the puck carrier a little so defenders can catch him. It lowered scoring without stopping the scripted player.

# Phase 4: players and roster

- [x] Player model: overall, grades, cap hit
- [x] Names and the seeded league generator
- [x] Roster rules: cap, sign, release, roster limit
- [x] Lineup rules: two lines of 3 and a goalie, auto-fill, repair
- [x] Save document with version check and migration; IndexedDB; export and import
- [x] Menu system and screens: Hub, Roster, Free agents, Lineup, Play, Save and load
- [x] Dressed lineups drive the game; positions on the ice; names in the summary
- [x] Checked in a browser
- [x] Commit, push, deploy green
- [ ] Exit test: build a legal roster under the cap, dress a lineup, play a game, close the page and find everything saved (owner)

## Review (Phase 4)

- Type check, 318 tests and the build pass. The uniform-team balance series is unchanged from Phase 3 (3.37 and 3.16 goals, save percentage .855).
- Browser check, by keyboard: released a player (cap space rose), signed an A-grade free agent, was refused a second signing ("roster is full"), re-sorted the free agents, swapped a lineup spot, played and won a game (record 1-0-0, real names in the summary, opponent's name on the scoreboard), reloaded and found roster, lineup and record intact, lost a second game (1-1-0), exported the save, and started a new franchise after the confirmation. No console errors.
- Not checked:
  - Controller navigation in the menus. The browser pane was hidden, which stops the animation frames the controller polling runs on; only the keyboard path was exercised.
  - Importing a save through the file picker (the reading and checking code behind it is unit tested).
  - How the screens look: screenshots failed with the pane hidden, so layout on a phone is unseen.
- Simplifications: contract years are stored but do not count down; AI teams never change their rosters; the hidden potential rating is generated but not used yet.

# Phase 5: the season run

- [x] Modifier system in the simulation; powerups triggered in a game
- [x] Content: 12 powerups, 14 artifacts, 5 bosses, 18 events
- [x] Seeded map generator
- [x] Season state machine: strikes, bosses, playoffs, events, shop, training, loadout, season end
- [x] Save version 2 with migration from version 1
- [x] Screens: map, game preview, training, event, shop, artifact pick, playoff series, season summary, powerups, artifacts
- [x] Powerups and running boosts shown on the ice
- [x] Checked in a browser
- [x] Commit, push, deploy green
- [ ] Exit test: a whole season plays from lineup to championship or elimination (owner)

## Review (Phase 5)

- Type check, 394 tests and the build pass. The uniform-team balance series is unchanged from Phase 3.
- Automatic whole seasons (4 seeds, random legal choices, every game really simulated with an AI playing your team): all four ended, none got stuck. All four struck out, after 3 to 7 games, with 0 to 4 wins. So a starting C-grade team played by the AI does not survive region 1; whether a person does is the open balance question.
- Browser check, by keyboard: a Phase 4 save loaded and migrated; started a season; loaded a powerup on LT, used it in a game and saw its timer on the ice and the powerup leave the bag; won (30 currency); trained a player; reloaded on a game stop and landed on the same stop; lost (strike 1); visited a shop; beat a boss and picked an artifact; went through events; won two more regions and both playoff series (results forced to save time); reached "Champions!" with 4 artifacts; continued to the off-season of season 2 with artifacts kept. No console errors.
- Not checked: controller navigation and the trigger buttons (the browser pane was hidden, so only the keyboard was used); how the screens look; a season ending by strikes or playoff loss in the browser (both are unit tested).
- A mistake of mine during the check: a test script wandered into Save and load and pressed Export about 35 times. No files were written to Downloads.
- Simplifications: the map is a list of next stops with a line saying what each leads to, not a drawn map; the AI never uses powerups; rewards and prices are first guesses.

# Phase 6: gear and packs

- [x] Data tables: gear, sets, perks, packs, milestones
- [x] Gear generation, rarity table, sets, perks
- [x] Packs with guarantees and the pity timer; 100,000-pack test
- [x] Equip, level up, scrap, tape
- [x] Per-player modifiers and the four set mechanics in the simulation
- [x] Pack awards and milestones in the season
- [x] Save version 3 with migration
- [x] Screens: packs with reveal, gear inventory with filter, item actions, player gear with before-and-after preview
- [x] Checked in a browser
- [ ] Commit, push, deploy green
- [ ] Exit test: win a game, receive a pack, open it, equip a piece and see its effect on the ice (owner)

## Review (Phase 6)

- Type check, 456 tests and the build pass. The uniform-team balance series is unchanged.
- 100,000 packs: slots with no guarantee came up within half a percentage point of 60 / 28 / 10 / 2; every Silver held a Rare or better and every Gold an Epic or better; the longest run without a Legendary was exactly 24 packs.
- Browser check, by keyboard: a Phase 5 save loaded and migrated; a shutout win awarded a Silver pack; opened it with the piece-by-piece reveal; the gear screen listed the pieces and the filter cycled; the equip screen showed "Speed 71 → 74, Checking 66 → 69" before confirming; equipped a second piece from the player's own screen; scrapped two pieces for tape; level up was correctly greyed out without enough tape; after a reload the gear, tape and place in the season were intact; in the next game the geared player's shot power, speed and check strength were the highest on his team; a forced hat trick awarded a Gold pack on top of the Bronze. No console errors.
- Not checked in the browser: levelling a piece up (not enough tape; unit tested), the controller, and how the screens look.
- A team in full level-1 Legendary gear plays about like an 85-rated team (73% against 70); at level 5 about like 97 (84%).
- Simplifications: four set bonuses are stand-ins for design-doc effects the game cannot do yet (listed in DECISIONS.md); no automatic duplicate handling; AI teams and bosses wear no gear.

# Phase 7: the franchise loop

- [x] XP from games, levels, automatic point placement capped by potential
- [x] Aging table, retirement
- [x] Contracts: tick, re-sign at the current grade's cap hit, let go
- [x] League moves: AI re-signing and free agency (can sign players you let go), rookie class, pool upkeep
- [x] Quick seasons, the multi-season runner and `npm run seasons`; tuned until stable
- [x] Trades
- [x] Prestige and jersey colours
- [x] Blocked shots counted on the ice
- [x] Save version 4 with migration
- [x] Screens: off-season report, contracts, trade, prestige, jersey; level and XP on player rows
- [x] Checked in a browser
- [ ] Commit, push, deploy green
- [ ] Exit test: play season after season (owner)

## Review (Phase 7)

- Type check, 534 tests (60 new) and the build pass. The uniform-team balance series is unchanged (3.37 and 3.16 goals, save percentage .855).
- 20 franchises for 20 seasons each: no team ever short of a legal roster, none over the cap, average age 27.6 to 28.9, every grade from D to A present from year 3. The AI teams' average rises about 5 points over the first 13 years and then holds. Table in docs/TUNING.md.
- Browser check, by keyboard, on a save set up at the end of a championship season: continued to the off-season; the report showed one player up (68 to 72, now level 8) and a 37-year-old down; reloaded with two contracts pending and landed in the same place with "Start the season" and "Trade" greyed out; re-signed one for 3 seasons and let one go; the league then moved and 12 rookies arrived; signed a 20-year-old rookie; a trade for a B+ star was refused with the reason; a goalie-for-goalie trade was accepted and made; prestiged to level 1 (artifacts gone, roster kept); chose the second jersey colour and saw the skaters drawn in it on the ice; started season 2 with the game screen saying opponents play 2 points better. No console errors.
- Found and fixed during the check: free agents whose contract had run out were listed with 0 years left. They now ask for a new term.
- Not seen in the browser: an AI team signing the player I let go (he stayed in the pool that time; it is unit tested), a retirement on my own team (unit tested), the controller, and how the screens look (the browser pane was hidden, so only text was read).
- Simplifications: trades are one for one only; AI teams do not trade with each other; AI players improve by a yearly rule, not by playing; the health check settles games from team strength instead of simulating them; the first before-tuning table was not kept, only described.

# Phase 8: economy, staff, facilities, scouting and the mascot

- [x] Operating cash: ledger, per-game and per-season money, franchise value
- [x] Fire sale and the league bail-out
- [x] Facilities (six, five levels) and their effects
- [x] Staff: pool, hiring, contracts, effects through the modifier system
- [x] Scouting: potential range and hidden free agents
- [x] Three manager styles and the money report; tuned
- [x] Mascot: power, drop-in, AI and boss mascots
- [x] Five talents on the ice
- [x] Save version 5 with migration
- [x] Screens: finances, staff, facilities, mascot; drop-in notice; potential; fire sale
- [x] Checked in a browser
- [ ] Commit, push, deploy green
- [ ] Exit test: the economy screens work and the three reports look healthy (owner)

## Review (Phase 8)

- Type check, 621 tests (63 new) and the build pass. The equal-teams balance series is unchanged (3.37 and 3.16 goals, save percentage .855).
- Three 20-season money reports (20 franchises each): the cautious and balanced managers are never bailed out and franchise value grows; the spender is often forced to sell late on but is never bailed out; nobody ends with idle cash. Before and after are in docs/TUNING.md.
- The plan's starting numbers did not survive: every style was bankrupt by season 3, because income was per game and a season can be 4 games long. Sponsorship went from 4% to 18% of franchise value. The sample season in the plan showed a $2.6M loss; with the final numbers the same season makes $11.6M. The starting team is now safe, and the squeeze comes from a growing payroll and from what to build.
- Browser check, by keyboard: a Phase 7 save loaded and migrated (cash $10M, a mascot); the finances screen; built an arena level; hired a scout, was refused a second, let him go; bought a costume; forced a mascot drop-in and saw the notice, the mascot on the ice in a real game with four talents, rally cry fire twice and the spin move used; the game's money (+$1.22M) matched the finances screen and the change in cash; with cash forced to minus $2M the season was blocked, a release paid $1.57M, and after a second release the season could start; hiring a grade A scout brought the hidden free agents from 9 down to 5; a reload landed in the same place. No console errors.
- Found and fixed during the check: negative cash was written "$-2.00M"; a 36-year-old showed a potential range up to 90 (players of 31 or over now show "past his peak").
- Not seen in the browser: crowd surge, distraction and the cannon shot firing (my team never scored in that game; all five are unit tested), a boss or AI mascot on the ice (unit tested), the league bail-out (unit tested), the controller, and how the screens look (the browser pane was hidden, so only text was read).
- Simplifications: AI teams have no money; home and road only change money; trainers work by position because XP is per player; talents all trigger by themselves; the automatic managers play poorly on the ice, so their income understates what a person would earn.

# Design round: design fixes, a real look, touch controls

- [x] Difficulty choice; simulate a game; swap the spare; rewards record; save version 6
- [x] Real set bonuses (one-timer, big hit, breakaway)
- [x] Menu style: one palette and type scale, two-panel layout, player cards, rating bars, wallet strip
- [x] Grouped hub with early locks; drawn season map; rewards screen; Pucks
- [x] On-ice look: rink markings, top-down players, team colours, scoreboard, banners
- [x] Touch controls
- [x] Checked in a browser, with pictures
- [ ] Commit, push, deploy green
- [x] Play it on the phone (owner)

## Review (design round)

- Type check, 663 tests (42 new) and the build pass. The equal-teams balance series and the 20-season reports are unchanged.
- For the first time I could see the game. The app window was not open, so ordinary screenshots still timed out; instead the page rendered itself to an image and posted it to a local receiver. Every claim below about how something looks comes from those pictures, at phone-landscape size (844 x 390) for menus and 1280 x 720 for the rink.
- Seen in pictures: the hub with its groups and badges; the season map with the route drawn; the game screen with Play and Simulate; the rewards screen; roster, lineup, free agents with rating bars; finances; facilities; hiring; a pack reveal; the off-season report; the rink in play, with a goal banner, and with the touch controls over it.
- Looking found bugs that reading text never would have: labels overlapping the amounts on the finances and facilities screens; a default white scrollbar; the map too small to read; touch buttons sitting on the bottom HUD bars. All fixed.
- Driven by keyboard: simulate a game and step through its rewards; swap the spare in mid-season; change difficulty; re-sign and let go (an AI team signed the player I let go); build; a new season. By simulated touches in a real game: the virtual stick skated the player and a held Shoot registered as held. No console errors.
- Not checked: a real phone, a real finger or a real controller; the touch layout at phone size on top of the rink (seen only at 1280 x 720); one-timers, big hits and breakaway speed in live play (unit tested on the simulation); the difficulty choice on a brand-new franchise (the Settings path was used).
- Simplifications: players are simple shapes with no numbers (they are about 10 pixels across on a phone); the map shows one region at a time; the first load still starts a franchise on Pro without asking.

# Graphics round: crests, effects, arena, sound, pack opening

- [x] Team crests and jersey designs
- [x] Skating stride, skate marks, snow, shot streak, hit and post rings, goal light, banner, screen shake
- [x] Stands and crowd, board panels, adverts on the ice, lighting
- [x] Sound: event sounds, crowd and skate beds, menu sounds, settings
- [x] Pack opening; menu motion with a reduced-motion rule
- [x] Checked in pictures and by measurement
- [ ] Commit, push, deploy green
- [x] Listen to it and play it on the phone (owner)

## Review (graphics round)

- Type check, 690 tests (27 new) and the build pass. No rule changed: the balance series is unchanged.
- Seen in pictures at phone size (844 x 390): the rink with stands, crowd, board panels, on-ice adverts and the centre-ice crest; players in two-colour jerseys; the scoreboard with crests; a goal with the banner sliding in over two frames; the matchup screen with both crests; the pack opening sealed, part turned and fully turned, including a Legendary; the settings screen.
- Looking found three things to fix: a shading band along the boards that read as a second rink outline (removed); the home name squashed to nothing on the scoreboard (a scaling bug of mine); and both teams wearing so much of the same second colour that they were hard to tell apart (the main colour now dominates). Also turned cards showing green text from a clashing class name.
- Sound, without hearing it: every sound was rendered to numbers and the levels evened out (table in docs/TUNING.md); during a played stretch the counts of sounds asked for matched what was happening (a faceoff drop, pickups, a pass, a hit); switching sound off was saved to the device.
- Frame time here: 5.2 ms full detail, 4.8 ms low, against 16.7 ms available.
- Not done from the plan: numbers counting up on the rewards screen, a sweeping stick, the net bulging on a goal. The sound-synthesis checks are measurements made in the browser, not unit tests, because the test environment has no audio; the unit tests cover the event-to-sound map and the recipes' validity.
- Not checked: what any of it sounds like; smoothness of the animation (only still frames); a phone's frame rate; whether a controller button alone unlocks sound; jersey numbers (they only show on a bigger screen, seen once at 1280 x 720).
- The rink is about 7.5% smaller than before, a little more than the 6% in the plan.

# Interface round two: dashboard, icons, faces, title and end screens

- [x] Skating sound removed
- [x] Hub as a dashboard with a two-dimensional grid
- [x] Icons on every row; gear art by rarity
- [x] Player portraits and the player card
- [x] Title screen; end-of-game screen with three stars
- [x] Leftovers: count-up, net bulge, stick sweep
- [x] Checked in pictures
- [x] Commit, push, deploy green
- [x] Look at it on the phone (owner)

## Review (interface round two)

- Type check, 719 tests (29 new) and the build pass. No rule changed: the balance series is unchanged.
- Checked on an art sheet first (`?sheet`): 36 faces at two sizes, one player aged 19 to 38, every icon at 20 and 32 pixels, every gear drawing in each rarity, every crest. The faces held up, so the initials fallback was not needed. The sheet showed the shoulder pads looked like a second jersey and the skate blade was invisible; both were redrawn.
- Seen in pictures at phone size: the title screen; the dashboard, with and without contracts due; the Team group with icons; the roster with faces; the player card; the gear list; a pack opened with gear art; the end-of-game screen after a game with the three stars; the rewards screen; the rink with the goal light on.
- By keyboard: the dashboard grid moved correctly in all four directions, including from a wide button into the tiles and back. The rewards count-up finished on the right figure (+$1.59M, matching the change in cash).
- Found by looking: gear rows wrapping onto uneven second lines (now one line, with the full description in the side panel); a pack card clipping a long name; the keyboard hint showing faintly through the end-of-game screen.
- Not checked: motion (the count-up was checked by its end value, the net bulge and stick sweep only as single frames, and the stick sweep is too small to make out in a phone-size still); a real phone; free-agent and trade lists with faces (same row component as the roster, not separately pictured).
- Simplifications: faces are simple and stylised; at row size only hair, skin and colours read. The map and in-season screens keep their list layout.

# Interface round three: season screens and management screens

- [x] Pure helpers with tests: chart maths, sorting and comparing players, the season summary
- [x] Map, game poster, shop, training, event, season end
- [x] Off-season report
- [x] Lineup as the lines stand
- [x] Finances with bars and a chart
- [x] Staff, hiring and facilities as cards
- [x] Free agents with sort, filter and comparison; trade offer side by side
- [x] Mascot panel and prestige ladder
- [x] Checked in pictures
- [x] Commit, push, deploy green
- [x] Look at it on the phone (owner)

## Review (interface round three)

- Type check, 745 tests (26 new) and the build pass. No rule changed: the balance series is unchanged (3.37 and 3.16 goals a game, save percentage .855).
- Seen in pictures at phone size (844 x 390): map, game poster, shop, training, event, season end, off-season report (before and after the league's moves), lineup, choosing a player for a slot, free agents, the trade offer and its confirmation, finances, staff, hiring, facilities, mascot, prestige.
- By keyboard: a trade refused (with the reason) and a trade accepted and made; a facility built; a staff member hired; a lineup slot swapped; an event choice taken; a training session taken; a contract re-signed. No console errors.
- Found by looking: the finance bars filled the whole screen in red (a class name already used by the old controller test page; renamed); cash and value drew as one line because each was scaled to its own range (now one shared scale from zero); the prestige ladder ran off the panel (each rung is now one line).
- Not checked: buying in the shop by keyboard this round (the shop was only pictured); the chart with more than two seasons or with negative cash (covered by the unit tests of the arithmetic, not by a picture); motion; a real phone or controller.
- Different from the plan: only the rebuilt screens' drawn pieces moved to `src/ui/screens/`; the older screens' markup is still in `App.tsx`. There is no `Cards.tsx`: the cards reuse the hub's tile shape. The lineup is a formation grid, not a drawn rink with a crease and bench. Training shows the gain as text on the player's row rather than a before-and-after bar for every rating.

# Pause menu

- [x] The game freezes; resume without a stray pass
- [x] Sound and volume; controls page with the layout and the on-screen controls setting
- [x] Tuning panel opens from the pause menu
- [x] End game: forfeit in a season, plain end in an exhibition
- [x] Tests; checked in the browser by keyboard
- [ ] Commit, push, deploy green
- [x] Menu button on the controller (owner, 2026-11-14)
- [ ] The Pause button by touch (owner)

## Review (pause menu)

- Type check, 752 tests (4 new) and the build pass. No physics or balance change.
- In the browser, by keyboard, in a live game: Escape froze the simulation (0 steps over 30 frames) and resumed it (30 steps over 30 frames); resuming with the pass key held ignored the key until it was let go; sound off and the on-screen controls setting were saved to the device and took effect; the tuning panel opened from the menu and Escape closed it; ending an exhibition returned to the hub; forfeiting a season game showed "Forfeit" and lit one strike. No console errors.
- Found while checking: the menu reopened on the row last used, so a quick press toggled sound instead of resuming. It now always opens on Resume.
- Not checked: the controller's Menu button, d-pad and A/B in the pause menu (same menu code as every other screen, but not pressed on a real pad); the on-screen Pause button under a finger; the crowd dropping while paused (not listened to); pausing when the phone locks.
- Also in this stretch, since round three: powerups moved into Collection; Exhibition during a season; abandoning a season.

# First playtest: spread-out attack, long shots, faster passes

- [x] Posts in the attacking zone: net-front, wing, point
- [x] Shots from distance, feet planted
- [x] Pass speed 20 to 26
- [x] Tests; balance back inside the three targets
- [ ] Commit, push, deploy green
- [ ] Human-style player's shots on target and scoring rate, split out (not done)
- [ ] Play it: does the attack look spread out, do passes feel right? (owner)

## Review (first playtest)

- Type check, 762 tests (12 new) and the build pass. Balance, 200 games: 3.06 and 3.27 goals, 75.5%, save percentage .852: all three targets met.
- Measured before and after with one script: all three attackers within 7 m of the net fell from 4% of zone time to 0%; long shots rose from 0.5 to about 2 a team a game.
- Honest limits: long shots almost never score (0.02 a game), and passes made in the zone did not fall (about 10 a team a game, as before). If the passing back and forth still looks too busy, the lever is how readily a carrier passes (`passAwareness`), which this change did not touch.
- Two wrong turns, both caught by measuring: a wind-up that let the shooter skate into the slot (scoring doubled), then an early release that made the shot harmless (scoring fell by a third).
- Seen in one picture from a live game: the carrier in the corner, one teammate in front of the net, one high. The browser sampling was of the human's own AI teammates; I did not get a picture of the opponent in the same shape, though it is the same code.
- Not done from the plan: the report on the human-style player's shots on target and scoring rate per shot; only its wins and goals were measured. Not checked: how any of it feels with a controller.

# Cartoon players on the ice

- [x] Pose and shapes, pure and tested; proportions in the look table
- [x] Art sheet: every pose large, and a row at game size
- [x] In the game: depth order, shadow, control ring with a direction tick, stick to the blade
- [x] Goalie, standing and down
- [x] Frame time brought back down (cached sprites)
- [ ] Commit, push, deploy green
- [ ] Look at it moving on the phone (owner)

## Review (cartoon players)

- Type check, 777 tests (15 new) and the build pass. Drawing only: the simulation and balance are untouched.
- Looked at on the art sheet first, twice. The first version had the legs hidden under the body and only a sliver of face; the proportions were changed and it was looked at again. The outline was white, which vanished against the ice; it is now dark.
- Seen in the game at phone size (844 x 390), from a live game stepped by hand: a faceoff, open play, players near the net, a goalie down on his knees, and a 4x close-up of a group of skaters.
- Frame time: painting the shapes every frame took it from about 5 ms to 12.4 ms. Painting each pose once and reusing it as a sprite brought it back to about 6 ms (noisy: 4.4 to 7.4 over three runs). Up to about 180 small pictures were made in two minutes of play.
- Not checked: motion (the stride changes in 8 steps, which may look choppy; only still frames were seen); a real phone's frame rate; jersey numbers (they only show on a bigger screen); the off-balance tilt and the wind-up pose in a real game (seen on the art sheet only); a picture of a goal with the new figures.
- Different from the plan: the plan said Phaser graphics would paint the shapes; that was too slow, so they are painted into cached textures instead. No picture of a crowd at the net or of a goal was kept.
