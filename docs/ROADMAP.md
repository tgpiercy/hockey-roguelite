# Roadmap: refining the whole of Third Line

Approved by the owner on 2026-11-15. Rounds are ticked here as they finish.

- [ ] Round 1: looks and sound. First part done 2026-11-15:
  - [x] The sound page (`?sound`) and every sound measured; five quiet tunes brought up to the others
  - [x] Players a step larger (the owner's choice from three sizes)
  - [x] The goal banner a third smaller and higher up; the spare line sitting on its bench
  - [x] Menus at phone size: the Standings list no longer spills over the top bar, the hub's nine tiles fit, long titles shortened, a card name no longer broken in two
  - [ ] The owner listens to the sound page and says which sounds and tunes are wrong; those are redone
  - [ ] Ice that wears through a period; glass and boards with depth
  - [ ] A goalie's kick save and post hug; a pose of his own for a knocked-down skater
  - [ ] One pass over every menu for consistency (cards, units, where the cost is shown)
  - Dropped: a number on the back (unreadable at phone size; it now shows on the body only when players are drawn large). A boss's named player has no sign of his own: each team's best skater wears the captain's band, which is close to the same man.
- [ ] Round 2: health of the code
- [ ] Round 3: how the hockey feels
- [ ] Round 4: learning the game

## Context

Third Line is feature-complete well beyond its first design: the hockey, the season run, the franchise, the club, the theme, twelve bosses, redrawn players. What it has not had is refinement. Three facts frame this plan:

- **Your play finds what my measurements miss.** In one evening you found a 12–3 game, weak team-mate checks, a goalie scoring on himself and a helmet that looked wrong. None showed in 1,363 passing tests.
- **Much has never been seen or heard by a person.** The music and every sound were made unheard. Many screens and all the new bosses' tells have only been checked by tests.
- **The code has grown fast.** One menu file is 3,270 lines; the game is a single 1.9 MB download; the tuning document is 1,041 lines with old numbers mixed among current ones; the lessons file the working rules ask for does not exist.

You chose the order: **looks and sound, then the health of the code, then how the hockey feels**; learning the game comes after. You chose long rounds with a report at the end of each.

Each round below is one stretch of work: built, tested, looked at in the test browser at phone size, documented, committed, deployed, then reported with pictures and numbers. Between rounds you play; what you find goes to the front of the next round.

## Round 1: looks and sound

**Players (finishing the redesign).**
- What was left out: a number on the back, a pose of his own for a knocked-down skater, a goalie's kick save and post hug, a sign for a boss's named player.
- At phone size the visor, vents and strap vanish. Try the players a step larger (`playerScale` in `rinkLook.json`) and show you both before choosing.

**The rink.**
- Ice that looks like ice (scuffs that build up through a period, a fresh sheet after it), glass and boards with depth, nets with mesh, benches with the spare line sitting on them, a crowd that stands for a goal.
- The scoreboard and the on-ice words checked for overlap with play at phone size (a goal banner currently covers a third of the rink).

**Menus.**
- Every screen photographed at 844 x 390 and checked for the faults already seen once: titles cut off ("Game against Coldwate…"), a hub tile below the fold, lists that need scrolling to reach the main action.
- One pass for consistency: every choice a card, every number with its unit, the same place for "what this costs" on every screen.

**Sound and music.**
- A sound page (`?sound`, like the art sheet): every sound and every tune with a play button, so you can listen to each in a minute and tell me which are wrong. This is the only way they get judged.
- Before you listen: each sound rendered offline and checked for clipping, loudness against the others, and length. Faults found that way are fixed first.
- Then the ones you reject are redone.

## Round 2: health of the code

No change to how the game plays or looks; every step is proved by the tests passing and by before-and-after pictures being identical.

| Item | What | Why |
| --- | --- | --- |
| Split the menu file | **Done** (as `src/ui/pages/`, ten files; `App.tsx` is 415 lines; 23 screens compared before and after, identical). `src/ui/App.tsx` (3,270 lines) becomes one file per group of screens under `src/ui/screens/`, with `App.tsx` keeping only which screen is showing. | Every menu change today risks every other menu. |
| A smaller, faster start | **Done** (first download 414 kB, was 1.9 MB). The rink engine (most of the 1.9 MB) is loaded when the first game starts, not when the title screen opens; the art and sound sheets load only when asked for. Measured: size and time to the title screen, before and after. | The title screen should appear at once on a phone. |
| Measurements as commands | **Done** (`npm run measure`). The one-off measurements I have been writing and deleting (breakaways, goals against by kind, the script against each boss, styles, rinks) become kept harness functions with one command each, like `npm run balance`. | So a number in the docs can be re-run, by either of us, after any change. |
| The tuning document | `docs/TUNING.md` split into "what the numbers are now and why" and a history. Superseded figures leave the first part. | It is the reference for every tuning decision and is hard to trust at 1,041 lines. |
| Lessons file | `tasks/lessons.md`, as your working rules require, written from this project's corrections so far and kept from now on. | It does not exist. |
| Old saves | A stored save from each save version is kept as a test fixture and loaded on every test run. | "Never break old saves" is a rule with no fixture behind it. |
| A frame-time read-out | In the pause menu's tuning panel: frames a second and the slowest frame of the last ten seconds, on the device. | Every speed figure so far is from a desktop pane. You can read me the phone's. |
| Housekeeping | Unused data keys, the leftover `tmp_saves/` folder, test timeouts that sit at their limit. | |

## Round 3: how the hockey feels

- **Done: a second measuring player that plays like a newcomer** (`--player novice`; numbers in `docs/TUNING.md`; Rookie was re-set against it on the owner's choice; Pro and All-Star stay). Was: Today's script defends tirelessly and wins 36 games in 40 where you lost 12–3, so its numbers flatter the game. A "novice" beside it: slower to react, misses checks, loses the puck. Difficulty is then set against both.
- **Cover behind the play.** The AI takes about 25 shots a game with none of your skaters between the shooter and your net. One team-mate stays back when you attack and gets back first when the puck turns over. Measured by that count falling.
- **Whatever your play has found by then**, first.
- **Loose ends already on file:** shops rarely cost more than a season earns; the season-over screen and the trophy room count a top scorer differently; Pro's first region is cleared 73 to 88% of the time depending on the boss drawn; the Wall and the Marathon cannot be answered by any script, so their answers have never been shown to work in play.
- **The new bosses' tells**, seen in a game for the first time and adjusted.
- Then Rookie, Pro and All-Star are re-set once, against both measuring players, and written down as targets.

## Round 4: learning the game

- A short first game that teaches skate, pass, shoot and check one at a time, then the newer moves as they come up.
- The season's screens opened in order over the first season, not all on day one.
- A page that says what every sign on the rink means (rings, pips, bars, bands).

## What you do between rounds

- Play a few games on the phone and say what felt wrong, in a line each.
- After round 1: listen to the sound page.
- After round 2: read me the frame-time figures from the phone.
- Still owed from earlier: two real controllers together.

## How each round is verified

- `npm run typecheck`, `npm test`, `npm run build` before every commit; each commit pushed and the deploy confirmed.
- Pictures at phone size of everything that changed on screen, sent with the report.
- Numbers for anything that changes play, in `docs/TUNING.md`, with what was and was not measured.
- Decisions in `docs/DECISIONS.md`; `CLAUDE.md` kept true; `tasks/todo.md` and `tasks/lessons.md` updated.
- This file is ticked as each round finishes.

## Risks

- **Taste.** Looks and sound are judged by you, not by tests. Where there is a real choice (player size, a rink style, a tune) I show options and ask, as with the players and the helmet.
- **Round 2 can break things quietly.** Splitting a 3,270-line file is the riskiest item here; it is done in small steps with the tests run after each, and nothing else changes in the same commits.
- **Long rounds delay your corrections.** You chose them; if a round runs past about a day's work I stop at the last finished part and report.
- **I still cannot play.** The novice player in round 3 narrows that, but your games remain the real test.

## The plan after the research (2026-11-16)

The research report `reports/Sports game lessons and pitfalls.md` (kept on this machine, not in the repository) reviewed the game against the pitfalls of sports games and lists 33 improvements, rated. The owner chose the order below; it replaces the order of rounds 3 and 4 above.

| Round | What | State |
| --- | --- | --- |
| First contact | Ask the difficulty and who switches on a first start; the help written down; the Wall and the Marathon out of the first region; a mercy rule; momentum not cut by a goal against; a boss loss ending the season as a handicap (the owner's choice); old saves as test fixtures; frame times in the pause menu; how each goal was scored on the summary | **Done** |
| The hockey and the difficulty | Cover behind the play; a linemate at the net and a pass that pays; assists as named settings in steps, with each difficulty a preset of them; a tier between Rookie and Pro; the difficulties re-set against both measuring players and the owner's results | Next |
| Subtraction and the economy | Decide, system by system, what a new player should not meet or the game should not have; make Pucks scarce; a test that tries to fleece the trade AI | |
| Teaching | A staged first game; screens opened in order; a page of the rink's signs; hints for the basics | |
| Presentation and practicalities | Commentary from parts; a crowd that follows the game; a game in progress kept when the page is hidden; touch as its own scheme | |

For the owner to judge by playing after the first-contact round: whether holding control feels better than automatic switching; whether the mercy rule ends games at the right lead; whether momentum still feels earned; the frame figures from the phone (pause menu, top line); and what the two goal lines on the summary say about where goals come from.

