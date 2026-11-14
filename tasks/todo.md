# Phase 0: setup

Built, deployed and checked with a simulated controller. Still open:

- [ ] Exit test on the phone with the real controller, at `?controller` (owner)
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
- [ ] Commit, push, deploy green
- [ ] Exit test: build a legal roster under the cap, dress a lineup, play a game, close the page and find everything saved (owner)

## Review (Phase 4)

- Type check, 318 tests and the build pass. The uniform-team balance series is unchanged from Phase 3 (3.37 and 3.16 goals, save percentage .855).
- Browser check, by keyboard: released a player (cap space rose), signed an A-grade free agent, was refused a second signing ("roster is full"), re-sorted the free agents, swapped a lineup spot, played and won a game (record 1-0-0, real names in the summary, opponent's name on the scoreboard), reloaded and found roster, lineup and record intact, lost a second game (1-1-0), exported the save, and started a new franchise after the confirmation. No console errors.
- Not checked:
  - Controller navigation in the menus. The browser pane was hidden, which stops the animation frames the controller polling runs on; only the keyboard path was exercised.
  - Importing a save through the file picker (the reading and checking code behind it is unit tested).
  - How the screens look: screenshots failed with the pane hidden, so layout on a phone is unseen.
- Simplifications: contract years are stored but do not count down; AI teams never change their rosters; the hidden potential rating is generated but not used yet.
