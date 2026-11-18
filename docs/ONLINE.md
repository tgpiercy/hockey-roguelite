# Live games across devices: can it be done, and how

Asked for by the owner on 2026-11-18. Nothing here is built. This says what the game already has, what stands in the way, and the order to try it in, with a point early on where it can be dropped cheaply.

## The short answer

Yes, for two people who know each other, and most of the way with what the game already has. The first step that proves or kills it is small: one round of work, no server, no dependency. A public league of live games is a much bigger thing and comes last, if at all.

## What the game already has

| Piece | Where | Why it matters |
| --- | --- | --- |
| Two people in one game | `world.human2`, `step(world, input, tuning, input2)` | Co-op and versus already work with two controllers on one phone. Online is the same game with the second input arriving over a wire. |
| A fixed step | 60 steps a second, nothing else moves the game | Both phones can agree on "step 4,812". |
| A game as plain data | `packWorld`, `unpackWorld` in `src/sim/snapshot.ts` | The whole game can be sent to the other phone. Measured: 35 KB as text, 0.04 ms to make. |
| A game run again from its inputs | `src/game/replay.ts`, `tests/replay.test.ts` | On one device the same inputs give the same game, step for step. |
| A simulation with no screen | `src/sim` imports nothing from the browser | Lag and loss can be tested in Vitest with two worlds and a made-up wire, before any phone is involved. |

## What stands in the way

1. **Two phones may not agree on the arithmetic.** The simulation calls sine, cosine and the like 81 times. Browsers are not required to give the same last digit for those, so an Android phone and an iPhone running the same inputs can drift apart. Add, multiply and square root are safe. So "send only the inputs and trust both sides" (lockstep) is not safe as the game stands. Either one phone is in charge and corrects the other, or those 81 calls are replaced with our own versions.
2. **Finding each other.** Browsers can talk phone to phone (WebRTC, built in, no dependency), but they need a go-between for the first handshake. Either the two players pass a code by hand (no server at all; clumsy), or a very small service holds a room code for a minute (a free-tier host, which is a new thing to run and needs the owner's yes).
3. **Some pairs cannot connect directly.** On mobile data in particular, roughly one pair in five to ten needs a relay to carry the traffic. Free relays are unreliable; a dependable one costs a little each month. On home Wi-Fi at both ends it usually just works.
4. **Lag.** A round trip between two phones is commonly 60 to 150 ms, on top of the Bluetooth controller's own delay. Arcade hockey with checks judged on timing will feel that unless your own skater moves at once on your own screen.
5. **A full snapshot is too big to send often.** 35 KB twenty times a second is 700 KB a second. The moving parts (14 players and a puck: where, how fast, which way) are a few hundred bytes; the full state need go only at faceoffs and after a correction.
6. **I cannot play it.** The test browser is one window. I can prove the wire logic with tests and two tabs on this PC; how it feels on two phones only the owner and a friend can say.

## Three ways to build it

| Way | How it works | Feel | Work | Risk |
| --- | --- | --- | --- | --- |
| **A. One phone in charge** | The host runs the game. The guest sends his controls and is sent the moving parts 20 to 30 times a second, drawn smoothed. | Host: perfect. Guest: every move late by the round trip. | Least | Unfair to the guest; fine for co-op, poor for versus. |
| **B. One in charge, guest runs ahead** (recommended) | As A, but the guest's phone also runs the game on his own controls at once, and is pulled back into line when the host's word arrives. | Both feel their own skater at once; the other side's players may jump a little when a guess was wrong. | Middle | Corrections that show. Does not need the two phones to agree to the last digit. |
| **C. Both equal, with roll-back** | Both run the game; each guesses the other's controls and re-runs the last few steps when the truth arrives. | Best, and fair. | Most | Needs the 81 calls replaced and proved identical on every browser, and a fast copy of the world many times a second. |

B is A plus one layer, so A is not wasted work, and C can follow B if B's corrections are too visible.

## The order, with a way out after each step

| Step | What | Needs from the owner | Done when |
| --- | --- | --- | --- |
| **0. Prove it on a wire that is not there** (done 2026-11-18, see the end) | Two worlds in a test, joined by a made-up connection with lag and loss dialled in. Way A, then B. Counts: bytes a second, how far the guest's picture is from the truth, how often it is corrected. | Nothing | Numbers in `docs/TUNING.md` for 50, 100 and 200 ms; a yes or no on going on. |
| **1. Two real devices, codes passed by hand** | Exhibition only. Host shows a code, guest pastes it and shows one back. No server. Same Wi-Fi first, then two homes. | Two devices and a second person for an evening | A whole exhibition game played, and the owner's word on how it felt. **The cheap place to stop.** |
| **2. Room codes** | A four-letter code in place of the pasted ones. | Yes to a small free-tier service to hold the codes, and to a relay if step 1 showed pairs failing | Joining takes under ten seconds. |
| **3. Losing the line** | The game pauses when the other side drops, picks up again from a full snapshot, and is forfeited after a while. | Nothing | Pulling the plug mid-game and plugging back in carries on. |
| **4. Co-op in a season** | A friend joins your season game as your line-mate. Your franchise, your save; his phone is a controller with a picture. | Nothing | A season game played together counts as any co-op game does. |
| **5. Leagues** | Clubs uploaded, a table, fixtures between people. Needs accounts of some kind and a place to keep results. | A real back end: its own decision, later | Not planned in detail. |

## What it would not be

- Not strangers matched at random: that needs many players on at once, and protection against cheating that a browser game cannot give.
- Not more than two people.
- Not a change to the single-device game: every step above leaves the simulation as it is, or adds to it behind an option.

## Costs to be clear about

- Steps 0 and 1: no hosting, no dependency, nothing to pay.
- Step 2 on: one small service to run and keep running; a relay may cost a few dollars a month if mobile-data play matters.
- Anything added to the world must stay plain data, as it must already for kept games and replays.

## Step 0, done (2026-11-18)

Built: `src/sim/online.ts` (the host, the guest, the messages), `tests/harness/online.ts` (the made-up wire), `tests/online.test.ts`, and `npm run measure -- online`. The numbers are in `docs/TUNING.md`, "Two devices on a made-up wire". Nothing in the game uses it yet.

How it works, as built (way B):

- The host runs the game. Twenty times a second it sends a short word: the controls it used for the last twelve steps (its own and the guest's), where every player and the puck are, and a few facts that cannot be a little wrong (the random generator, the score, the stage of the game, who has the puck).
- The guest keeps two games. One follows the host's exactly, by running the same steps with the controls the host says it used; the host's figures are then written over its own, which is what copes with phones that disagree in the last digit. The other is that game run on ahead with the guest's own controls and the host's last known ones: that is the picture.
- The guest sends its controls every frame, the last ten each time, so a lost message costs nothing. It keeps itself just far enough ahead that each input reaches the host a little before its step.
- If words are lost for longer than twelve steps, or the facts differ, the guest asks for the whole game. The host also sends it at every faceoff.

The answer: **go on to step 1.** The two stayed together at every lag and loss tried; the guest's own skater is right; 16 KB a second is little. What step 1 must add before it is fair to judge the feel:

1. The drawing eases a correction in over a few frames; it must not snap.
2. Goals, whistles and the horn are shown and sounded on the host's word, not on the guest's guess.
3. The host sees everything with no delay and the guest's opponent is guessed: versus is a little unfair to the guest. Co-op is not.
