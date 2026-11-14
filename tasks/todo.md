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
- [ ] Page checked in a browser
- [ ] Commit and push
- [ ] Pages switched on (owner) and deploy green
- [ ] Exit test on the phone (owner)

## Review

- Type check, 24 tests and the production build pass locally.
- A deliberate bad file in `src/core` (Phaser import, `src/game` import, `document`, `Math.random`) failed three rule tests and the DOM-free type check; it was removed afterwards.
- Not checked: the page has not been opened in a browser on this PC. The first real check of the controller page is the phone test.
- The built script is about 1.4 MB (363 kB compressed) because it includes all of Phaser. Fine for now; revisit in Phase 9 with offline caching.
