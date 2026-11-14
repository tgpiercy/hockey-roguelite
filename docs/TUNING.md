# Tuning

The values that set the on-ice feel live in `src/data/physics.json`. Change them live with the tuning panel (Menu button, Tab key or the on-screen Tune button), then use Export JSON and replace `src/data/physics.json` with the downloaded file.

Distances are in metres, speeds in metres per second, times in seconds. Changes made after the starting values are logged at the bottom.

## Starting values (Phase 1, 2026-11-13)

Aim: classic arcade hockey. Quick, slightly slippery, never floaty.

### Rink and nets

| Value | Start | In hockey terms |
| --- | --- | --- |
| rink.length / rink.width | 52 / 26 | A little shorter than a real rink, so 3-on-3 stays busy |
| rink.cornerRadius | 7 | How round the corners are |
| rink.goalLineFromEnd | 4 | Room behind the net |
| rink.boardBounce | 0.6 | How lively the boards are: 1 keeps all the puck's speed, 0 kills it |
| net.mouthWidth / net.depth | 2.6 / 1.3 | Bigger than a real net, for arcade scoring |
| net.postRadius | 0.12 | Thickness of the posts |
| net.postBounce | 0.7 | How hard the puck rings off the post |
| net.nettingBounce | 0.15 | The netting swallows most of the puck's speed |

### Skater

| Value | Start | In hockey terms |
| --- | --- | --- |
| skater.acceleration | 28 | First-step quickness: about a third of a second to top speed |
| skater.topSpeed | 9.5 | Normal skating speed |
| skater.glideDrag | 0.8 | How fast a coasting skater slows; lower is more slippery |
| skater.brakeDecel | 22 | How hard the skater stops when the stick is pulled against travel |
| skater.turnRateSlow | 9 | How sharply the skater cuts from a near standstill |
| skater.turnRateFast | 3.2 | How sharply the skater turns at top speed; lower means wider arcs |
| skater.facingTurnRate | 14 | How fast the body (and the puck on the stick) swings round to the stick direction |
| skater.overspeedDrag | 3 | How quickly a sprint bleeds back to normal speed |
| skater.sprintSpeedBoost / sprintAccelBoost | 1.35 / 1.25 | How much faster sprinting is |
| skater.wallBounce | 0.1 | How much the skater rebounds off the boards |
| skater.radius | 0.55 | Body size |

### Stamina

| Value | Start | In hockey terms |
| --- | --- | --- |
| stamina.drainPerSecond | 0.28 | A full bar lasts about 3.5 seconds of sprinting |
| stamina.recoverPerSecond | 0.18 | About 5.5 seconds to refill from empty |
| stamina.recoverDelay | 0.6 | Pause after sprinting before recovery starts |
| stamina.lockoutUntil | 0.25 | After running dry, sprint is unavailable until the bar is a quarter full |

### Puck

| Value | Start | In hockey terms |
| --- | --- | --- |
| puck.drag / puck.slideDecel | 0.35 / 1.5 | How fast a loose puck dies on the ice |
| puck.pickupRadius | 1 | How close the skater must be to collect the puck |
| puck.pickupCooldown | 0.35 | Time after a shot before the shooter can collect it again |
| puck.carryForward / carrySide | 0.9 / 0.45 | Where the puck sits on the stick |
| puck.carryFollow | 25 | How tightly the puck sticks to the blade in turns |
| puck.radius | 0.16 | Drawn and collided larger than a real puck, so it can be seen on a phone |

### Shooting

| Value | Start | In hockey terms |
| --- | --- | --- |
| shot.tapTime | 0.18 | A press shorter than this is a plain wrist shot |
| shot.chargeTime | 0.9 | Hold this long for the hardest shot |
| shot.wristSpeed / shot.maxSpeed | 22 / 38 | Speed of a tap and of a full wind-up, for a skater with full shot power |
| shot.powerFloor | 0.6 | A skater with no shot power still shoots at 60% of those speeds |
| shot.maxSpreadDegrees / minSpreadDegrees | 14 / 1.5 | How far a shot can stray from the aim, for the least and most accurate skater |
| shot.skaterSpeedShare | 0.3 | How much of the skater's own speed carries into the shot |
| game.goalPauseSeconds | 1.5 | Celebration pause before the reset |

## Phase 2 values (2026-11-13)

These were added for 3-on-3 and set only so that both sides can score; Phase 3 tunes them properly against the balance targets.

### In `physics.json` (editable in the tuning panel)

| Value | Start | In hockey terms |
| --- | --- | --- |
| game.opponentDifficulty | 0.5 | How sharp the other team is, 0 easy to 1 hard |
| pass.speed / pass.saucerSpeed | 20 / 17 | Speed of a flat pass and of a saucer pass |
| pass.saucerHoldTime | 0.25 | Hold A this long for a saucer pass |
| pass.aimConeDegrees | 150 | How far off line a teammate can be and still be picked as the target |
| pass.receiveRadius / interceptRadius | 1.3 / 0.7 | How close the receiver, or an opponent in the lane, must be to take a pass |
| check.bodyRange / minClosingSpeed | 1.5 / 2.5 | How close and how fast you must be closing for a body check |
| check.bodyBaseChance / pokeBaseChance | 0.6 / 0.3 | How often a body check or a poke check works between equal players |
| check.ratingSwing | 0.4 | How much checking against puck control shifts those odds |
| check.cooldownSeconds | 0.9 | Wait between checks |
| check.staggerSeconds | 0.7 | How long a checked skater is off balance |
| check.pokeRange | 1.9 | Reach of a poke check |
| body.handleSpeed | 16 | The fastest puck a skater rated 70 can collect; anything faster deflects off him |
| goalie.creaseHalfWidth | 1.6 | How far side to side the goalie will go |
| goalie.holdSeconds | 1 | How long a goalie holds a frozen puck before passing it out |
| goalie.shotSpeedThreshold | 10 | A loose puck faster than this, heading for the net, is treated as a shot |

### In `ratings.json` (effect at rating 0 and at rating 100)

| Rating | Effect | 0 | 100 |
| --- | --- | --- | --- |
| speed | top speed and acceleration scale | 0.79 | 1.09 |
| shooting | shot power and accuracy | 0 | 1 |
| passing | pass speed scale; scatter in degrees | 0.72; 12 | 1.12; 1 |
| checking | check strength | 0 | 1 |
| puck control | resistance to checks; fastest puck he can collect (scale) | 0; 0.65 | 1; 1.15 |
| stamina | drain scale; recovery scale | 1.35; 0.65 | 0.85; 1.15 |
| goalie reflexes | reaction delay in seconds; speed across the crease | 0.5; 1.5 | 0.1; 4.5 |
| goalie positioning | how much net he covers (radius); how far out he plays | 0.3; 0.7 | 0.6; 1.3 |
| goalie rebound control | fastest shot he can freeze; share of speed left in a rebound | 6; 0.55 | 30; 0.2 |

AI ranges (easy to hard) and positioning distances are in `src/data/ai.json`.

## Phase 3 balance (2026-11-13)

Measured with `npm run balance`, AI against AI at level 0.5, 200 games each, teams swapping ends every game.

| Target | Before tuning | After tuning |
| --- | --- | --- |
| Equal teams (70 against 70) score about 3 to 5 goals each | 1.48 and 1.36 | 3.37 and 3.16 |
| A 90-rated team beats a 70-rated team in about 75% of games | 89.0% | 75.5% |
| Save percentage between .850 and .920 | .904 | .855 (equal teams), .872 (90 against 70) |

Other numbers after tuning, equal teams: about 34 shot attempts per team per game, overtime in 17.5% of games.

What moved, and why:

- **Rating effects were flattened.** A 20-point rating gap was worth far too much. Speed now runs from 0.93 to 1.03 (was 0.79 to 1.09), shot power and accuracy from 0.49 to 0.79 (was 0 to 1), check strength and puck security the same, passing and stamina similarly narrowed. A rating of 70 still gives exactly the plain physics values.
- **Goalies** react faster (0.19 s at rating 0 to 0.12 s at 100) but cover less net (radius 0.31 to 0.37) and cross the crease more slowly (2.6 to 3.3 m/s). Reaction time turned out to be the lever that decides whether a shot taken on the rush goes in.
- **The AI attacks more directly**: it carries to 3 m from the goal line and shoots on the move, aims for the corners (0.3 m inside the post) with less aim error, shoots through tighter lanes, holds the puck for at most 2.5 seconds in the zone, and passes and checks less often.

Human against AI is a separate question and is not settled. `npm run balance -- --naive` plays a scripted stand-in for a simple human (chase the puck, skate to the slot, shoot at the near corner; never pass, check or change lines) against the AI:

| AI level | Scripted player's record over 60 games | Goals per game |
| --- | --- | --- |
| 0.75 (the default) | 41 wins, 19 losses | 4.95 for, 3.63 against |

So the default opponent is still too easy for anyone who plays directly. That needs a real player's judgement before more tuning.

### New values in `physics.json`

| Value | Start | In hockey terms |
| --- | --- | --- |
| period.seconds / period.count | 120 / 3 | Length and number of periods |
| period.breakSeconds | 2 | Pause between periods |
| faceoff.minWaitSeconds / maxWaitSeconds | 0.8 / 1.8 | How long the linesman holds the puck before the drop |
| faceoff.windowSeconds | 1 | Time to go for the puck before it just lies loose |
| faceoff.falseStartLockSeconds | 0.5 | Lock-out for pressing before the drop |
| faceoff.drawSpeed | 12 | Speed of the puck drawn back to the winger |
| bench.doorX / bench.doorRadius | 4 / 1.3 | Where each bench door is along the top boards, and how close counts as "at the door" |
| bench.changeCooldownSeconds | 4 | Wait before another automatic change |
| energy.drainPerSecond / sprintDrainPerSecond | 0.02 / 0.02 | How fast a shift tires a skater; sprinting doubles it |
| energy.benchRecoverPerSecond | 0.03 | How fast the bench restores him |
| energy.tiredBelow | 0.6 | Energy level under which he starts to fade |
| energy.minSpeedScale / minShotScale / minCheckScale | 0.8 / 0.75 / 0.6 | How much speed, shot power and check strength are left at zero energy |
| energy.changeBelow / changeMargin | 0.5 / 0.15 | When the automatic change kicks in, and how much fresher the bench must be |
| energy.goalieDrainPerSecond / goalieReactionPenalty | 0.0008 / 0.4 | How slowly a goalie tires, and how much later a spent goalie reacts |
| goalie.smotherReach | 1.2 | A goalie smothers a puck carried this close to him |
| game.opponentDifficulty | 0.75 | Raised from 0.5 |
| aimAssist.strength | 1 | How much your shot is steered to the open corner: 1 is fully, 0 is off |
| aimAssist.coneDegrees | 100 | How close to the net (total width of the cone) your stick must point for the assist to act |
| aimAssist.cornerInset | 0.35 | How far inside the post the assisted shot is aimed |
| passAssist.strength | 1 | Pass assist on (above 0) or off (0) |
| passAssist.laneClearance | 1 | An opponent this close to the passing lane blocks it |
| passAssist.blockedPenaltyDegrees | 40 | How much a blocked lane counts against a teammate, as if he were this many degrees further off your aim |
| passAssist.roomCap / roomDegreesPerMetre | 6 / 5 | With the stick centred: how much a teammate's open space counts |

## Gear and balance (Phase 6, 2026-11-13)

Gear adds rating points, so its effect can be read off the balance harness by rating a whole team higher. Against a 70-rated team, AI against AI at level 0.5, 100 games each:

| Team A | Roughly what it stands for | A wins |
| --- | --- | --- |
| 85 | Every player in six level-1 Legendary pieces (about +15 on each rating) | 73% |
| 97 | The same gear at level 5 (about +27, held at the top of the scale) | 84% |

That leaves out perks and set bonuses, which add a little more. The base numbers for equal teams are unchanged by this phase (3.37 and 3.16 goals, save percentage .855).

## Change log

| Date | Value | From | To | Why |
| --- | --- | --- | --- | --- |
| 2026-11-13 | goalie positioning cover radius (ratings.json) | 0.5 to 0.9 | 0.3 to 0.6 | All-AI games averaged under 1 goal per 5 minutes; now about 3 |
| 2026-11-13 | check.bodyBaseChance | 0.75 | 0.6 | Puck carriers were stripped almost at once |
| 2026-11-13 | check.pokeBaseChance | 0.45 | 0.3 | Same |
| 2026-11-13 | check.cooldownSeconds | 0.6 | 0.9 | Same |
| 2026-11-13 | AI checkEagerness (ai.json) | 0.3 to 0.95 | 0.2 to 0.8 | Same |
| 2026-11-13 | player.shotPower, player.accuracy | 0.7 | removed | Replaced by the shooting rating (70 gives the same 0.7) |
| 2026-11-13 | ratings.json and ai.json | Phase 2 values | see "Phase 3 balance" above | To meet the three balance targets |
| 2026-11-13 | game.opponentDifficulty | 0.5 | 0.75 | A simple direct player beat 0.5 easily |
