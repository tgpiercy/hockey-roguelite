# Phase 0: setup

- [x] Install Node.js LTS (v26.13.1)
- [x] Scaffold: package.json, tsconfig (strict) plus DOM-free tsconfig for core and sim, Vite config, folders
- [x] Seeded random number generator in `src/core/rng.ts` with tests
- [x] Rule test: no forbidden imports or DOM in core and sim; no `Math.random` anywhere
- [x] Controller test page: rink, square on the left stick, read-out of every button and axis, connect message
- [x] Web app manifest and placeholder icons
- [x] GitHub Actions workflow: type check, test, build, deploy to Pages
- [x] `CLAUDE.md`
- [x] Install dependencies, pin versions, record Phase 0 decisions in `docs/DECISIONS.md`
- [x] Type check, tests and build pass locally
- [x] Page checked in a browser (simulated controller)
- [x] Commit and push
- [ ] Pages switched on (owner) and deploy green
- [ ] Exit test on the phone (owner)

## Review

- Type check, 24 tests and the production build pass locally.
- A deliberate bad file in `src/core` (Phaser import, `src/game` import, `document`, `Math.random`) failed three rule tests and the DOM-free type check; it was removed afterwards.
- Browser check on this PC with a simulated controller: the connect message shows, then the read-out lists 4 axes and 17 buttons with the right labels and highlights pressed ones; no console errors. The movement code moves the square at the set speed, ignores readings inside the dead zone and stops at the boards.
- Not checked: the square moving on screen frame by frame (the browser pane was hidden, which pauses animation), and a real controller on a real phone. Both are covered by the phone test.
- First deploy run: install, type check, tests and build passed on GitHub; the Pages step failed because Pages was not yet switched on.
- The built script is about 1.4 MB (363 kB compressed) because it includes all of Phaser. Fine for now; revisit in Phase 9 with offline caching.
