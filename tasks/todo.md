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
- [ ] Exit test: continuous 3-on-3 with goals by both sides; you win some shifts and lose some; passes go where you meant (owner)

## Review (Phase 2)

- Type check, 172 tests and the build pass.
- All-AI games (6 seeds, 5 minutes each, both teams at level 0.5): scores 2-2, 3-2, 0-1, 1-0, 1-2, 1-2. Per game about 43 shots, 28 saves, 122 passes, 32 checks, 2.8 goals.
- Browser check (frames driven by hand): a scripted keyboard player chased the puck, carried it and shot for 3 simulated minutes against the AI; it finished 2-1 with no console errors. The debug overlay and View button toggle worked.
- Not checked: real-time play by a person, the controller, and whether it is fun or fair.
- Known rough edges for Phase 3: scoring is low against the 3 to 5 goals a side target; no one-timers; the AI never dumps the puck or changes pace; goalie stamina does nothing yet.
