# Where Third Line stands

Written on 2026-11-19, when the owner paused this line of work to polish other things. Read this first when picking the work up again. The detail is in `docs/ROADMAP.md` (the rounds), `docs/ONLINE.md` (live play), `docs/TUNING.md` (every measurement) and `docs/DECISIONS.md` (what was decided and why).

## The graphics round (2026-11-19, after the pause)

The owner picked the work up again for one round on the picture: the rink drawn with depth and light, movement that flows, big moments, and menus that move. Five commits on `main`, **not pushed** (the push was declined in the session): push them to deploy. What was built, what was seen and what was only tested is under "Review (the graphics round)" in `tasks/todo.md`; what is left over is the unticked line above it. One question is waiting on the owner: whether to draw the rink at the phone's full sharpness (device pixels), which costs frame time.

## The state of the code (as it was at the pause)

- `main` is at `8686355` ("Live play, step 1"), pushed, and the deploy of it succeeded. The game at https://tgpiercy.github.io/hockey-roguelite/ is that commit.
- At that commit: the type check passes, 1,651 tests in 95 files pass, the build passes.
- Nothing is half-built. No branch, no open change.
- Three folders sit in the project uncommitted, on purpose: `reports/` and `research_notes/` (the research of 2026-11-16) and `tmp_saves/` (left over from looking at screens; safe to delete by hand).

## What was last built

Live play between two devices, steps 0 and 1 of `docs/ONLINE.md`: an exhibition game, one device hosting and the other joining with an invitation link and an answer code passed by hand. Same Wi-Fi only. No server, no new dependency. How to try it is at the end of `docs/ONLINE.md`.

It was checked between two tabs on one PC. It has not been played on two real devices, on a phone, over a real connection, or by a person in either seat.

## Waiting on the owner

These are things only playing on the real devices can settle. None blocks anything else.

| What | Where | What to say afterwards |
| --- | --- | --- |
| Two devices on the same Wi-Fi, with a second person | Exhibition, "Two devices" | Did they connect; did the other skater look jumpy; did anything feel late or unfair to the guest |
| The sound page | the link with `?sound` on the end | Which sounds and tunes are wrong |
| Frame times on the phone | pause menu, top line | The figures |
| Two controllers together on one device | any game, second controller joined on the menus | Whether both seats work |
| Offline play | open once with a connection, then with none | Whether it opens |
| A season game kept and picked up again | leave a season game part-way, come back | Whether "Carry on" resumes it |
| The two skates with a controller | Practice | Whether each step can be done and makes sense |
| The game in general | a few games | What felt wrong, a line each |

## Decisions that are open

- **Two homes.** Playing across two homes needs a public address-finding service (STUN) listed under `iceServers` in `src/data/online.json`. The owner chose same Wi-Fi first; the question comes back after the two-device evening.
- **Room codes (step 2 of live play).** Needs a yes to a small free-tier service to hold the codes. Not started.
- **Shop prices.** Shops rarely cost more than a season earns. Counted, not changed.

Settled, though `docs/ROADMAP.md` still calls it open: the difficulties. On 2026-11-18 the owner chose Semi-Pro eased at the start and climbing to Pro, and left the other three as they are.

## Not done, and nobody waiting on it

- `docs/TUNING.md` is still one long history (about 1,600 lines); the split into "what the numbers are now" and a history has not been made.
- Co-op difficulty has not been measured.
- Replays have no markers.
- Live play steps 3 to 5 (picking up after the line drops, co-op in a season, leagues).
- Left out by the owner's choice, not to be picked up without asking: a crowd that follows the game; a touch scheme of its own; everything in the "Removed on 2026-11-16" list in `CLAUDE.md`.

## Picking it up again

1. Read this file, then the owner's findings from the table above, if any: they go first.
2. `npm install`, `npm run typecheck`, `npm test` to confirm the starting point.
3. Put the next round's choices to the owner as questions before building.
