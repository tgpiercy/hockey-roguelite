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
- [ ] Commit, push, deploy green
- [ ] Exit test on the phone: skating and shooting at an empty net is fun for 5 minutes (owner)

## Review

- Type check, 86 tests and the build pass.
- Browser check on this PC (frames driven by hand because the pane was hidden): with the keyboard the skater reached top speed, picked up the puck, sprinted (stamina drained), charged a shot, shot and scored; the goal pause and reset ran. With a simulated controller the left stick skated, RT sprinted, Menu opened the tuning panel, the d-pad chose and changed a value with hold-to-repeat, and the change was kept in the browser. Export offered `physics.json`; Reset restored the defaults. No console errors. The `?controller` page still loads.
- Not checked: real-time play at full frame rate, touch on a phone, a real controller, and above all how it feels. Those are the owner's test.
- Cut or simplified: the puck is always collected on contact (no bouncing off a skater at high speed); the skater can carry the puck into the net for a goal; no sound.
