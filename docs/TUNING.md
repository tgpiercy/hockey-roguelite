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

## League health over 20 seasons (Phase 7, 2026-11-14)

`npm run seasons -- --seeds 20 --years 20` runs 20 franchises for 20 seasons each with an automatic manager. Games are settled from team strength (a 20-point edge wins 75%, as the Phase 3 series measured), not simulated, so it takes about a second. The table is the league just before each season starts, averaged over the 20 franchises; "illegal" and "over cap" are totals.

| Year | S | A+ | A | B+ | B | C+ | C | D | Average age | Free agents | Your team | AI teams | Illegal rosters | Over cap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.0 | 0.0 | 0.0 | 2.3 | 12.7 | 33.2 | 45.6 | 10.3 | 28.1 | 24 | 68.1 | 71.6 | 0 | 0 |
| 5 | 0.2 | 0.5 | 1.6 | 8.1 | 18.0 | 38.8 | 30.0 | 6.8 | 27.6 | 35 | 71.1 | 74.2 | 0 | 0 |
| 10 | 0.3 | 0.6 | 3.0 | 12.1 | 25.0 | 39.4 | 19.3 | 4.4 | 28.2 | 35 | 74.4 | 75.9 | 0 | 0 |
| 15 | 0.1 | 0.7 | 4.2 | 15.6 | 30.4 | 34.0 | 14.1 | 5.0 | 28.7 | 36 | 76.8 | 76.5 | 0 | 0 |
| 20 | 0.1 | 0.7 | 5.0 | 16.5 | 28.9 | 32.4 | 11.7 | 8.8 | 28.3 | 35 | 77.2 | 75.6 | 0 | 0 |

What it shows:

- No team was ever short of 7 skaters and a goalie, and none was ever over the cap, in 400 franchise-seasons.
- The average age stays between 27.6 and 28.9: rookies replace retirees.
- Every grade from D to A is present from year 3 on. The league starts with nobody above B+ and grows a top end over the first ten years.
- The AI teams' average overall rises from 71.6 to about 76.5 by year 13 and then holds. So the league does get about 5 points stronger over its first decade before it settles.
- The automatic manager's team catches the league at about year 14 and ends 1.6 points ahead. That manager never uses gear, artifacts or good judgement, so a person will get ahead sooner; prestige is the answer to that.

Before tuning (first run of the same report): A and B+ players had nearly vanished by year 20 because AI players grew too slowly off the ice to replace the stars who aged out; some AI teams sat over the cap; and the automatic manager was once left a skater short because nobody in the pool fitted under its cap. I did not keep that first table, so only the description is recorded here. What changed:

| Value | From | To | Why |
| --- | --- | --- | --- |
| `aging.json` aiGrowth, young (rating points a year, to age 25) | slower | 6 to 16 | Stars were not being replaced |
| `aging.json` aiGrowth, prime (to age 29) | none | 0 to 4 | Same |
| AI team over the cap after re-signing | stuck | releases its most expensive contract | Cap deadlock |
| Free-agent pool | could run out of cheap players | always at least 6 skaters and 2 goalies at $1.5M or less, 3 goalies in all | A team with no cap room could not fill its roster |
| Pool trimming | by overall | oldest first, cheap players protected | Kept the pool from filling with veterans |
| `offseason.json` replacementOverall | higher | 45 | Emergency fill-ins must be cheap enough for any team |

The numbers above for XP, aging, rookies and trades are first guesses that produce a stable league; none has been felt by a person playing yet.

## The economy over 20 seasons (Phase 8, 2026-11-14)

`npm run seasons` now also runs each franchise under three automatic managers and reports the money. Cautious: cheap staff, builds only with 60% of a season's bills in reserve. Balanced: better staff, 30% in reserve. Spender: buys whatever it can afford the moment it can. All figures are $M at the start of each season, averaged over 20 franchises; "lowest" is the worst single franchise; fire sales and bail-outs are counts out of 20.

**Before tuning** (sponsorship at 4% of franchise value):

| Manager | Year | Cash | Value | Payroll | Facility levels | Your team | Fire sales | Bail-outs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cautious | 2 | 1.2 | 96.2 | 14.8 | 0.0 | 66.5 | 7 | 0 |
| Cautious | 5 | 0.1 | 77.6 | 11.9 | 0.0 | 65.2 | 20 | 15 |
| Cautious | 20 | 0.0 | 24.2 | 11.8 | 0.0 | 65.2 | 20 | 20 |
| Balanced | 5 | 0.1 | 77.0 | 11.9 | 1.0 | 65.3 | 20 | 15 |
| Balanced | 20 | 0.0 | 23.5 | 11.8 | 1.0 | 65.1 | 20 | 20 |
| Spender | 5 | 0.0 | 68.1 | 16.5 | 2.0 | 68.0 | 20 | 18 |
| Spender | 20 | 0.0 | 21.9 | 28.7 | 2.0 | 75.1 | 20 | 19 |

Every style was bankrupt by season 3 and stayed there. The cause: almost all income was per game, but a season that ends on three strikes is only 4 to 6 games, while salaries are the same however long the season lasts.

**After tuning** (sponsorship at 18% of franchise value):

| Manager | Year | Cash | Lowest | Value | Payroll | Facility levels | Staff | Your team | Fire sales | Bail-outs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cautious | 1 | 10.0 | 10.0 | 100.0 | 16.9 | 0.0 | 0.0 | 68.1 | 0 | 0 |
| Cautious | 5 | 13.3 | 9.4 | 111.6 | 18.6 | 3.0 | 3.8 | 69.5 | 0 | 0 |
| Cautious | 10 | 15.5 | 10.0 | 121.2 | 22.2 | 6.3 | 3.2 | 72.2 | 0 | 0 |
| Cautious | 20 | 13.9 | 2.8 | 131.8 | 25.0 | 7.6 | 1.6 | 73.5 | 0 | 0 |
| Balanced | 1 | 7.1 | 7.0 | 101.3 | 16.9 | 0.9 | 4.0 | 68.1 | 0 | 0 |
| Balanced | 5 | 7.4 | 3.8 | 107.4 | 19.0 | 2.6 | 3.3 | 69.8 | 0 | 0 |
| Balanced | 10 | 6.7 | 0.6 | 113.9 | 22.3 | 4.5 | 2.1 | 72.1 | 0 | 0 |
| Balanced | 20 | 6.6 | 0.9 | 123.8 | 23.8 | 5.8 | 1.0 | 72.6 | 0 | 0 |
| Spender | 1 | 1.0 | 1.0 | 103.0 | 16.9 | 2.0 | 4.0 | 68.1 | 0 | 0 |
| Spender | 5 | 1.1 | 0.0 | 106.8 | 18.9 | 4.5 | 2.9 | 69.8 | 4 | 0 |
| Spender | 10 | 1.9 | 0.0 | 113.4 | 23.2 | 6.3 | 2.9 | 72.8 | 9 | 0 |
| Spender | 20 | 1.3 | 0.0 | 123.1 | 29.3 | 7.3 | 1.9 | 75.6 | 16 | 0 |

What it shows:

- The cautious and balanced managers never need the league to step in, and the cautious one is never forced to sell. The balanced one has an occasional fire sale in the full table (one franchise in a few of the years).
- The spender, who keeps no reserve, is forced to sell in most seasons late on but is never bailed out. That is the intended price of spending everything.
- Nobody piles up cash: the cautious manager holds about $14M at year 20 with only 7.6 of 30 facility levels built, so there is always more to buy.
- Franchise value grows about 25% to 30% over 20 seasons.
- These managers play badly on the ice (random map choices, games settled from strength, a team that stays below the league average), so their seasons are short. A person who wins more games will earn more than this.

**The sample season promised in the plan**, from the real code with the final numbers: the starting team, 13 games (7 home, 6 road), 8 wins, 2 milestones, no playoffs, nothing built or hired.

| Revenue | | Expenses | |
| --- | --- | --- | --- |
| Tickets | $9.00M | Player salaries | $16.95M |
| Merchandise | $1.95M | Travel | $0.90M |
| Sponsorship | $18.00M | Mascot | $0.50M |
| Milestone bonuses | $1.00M | Staff and upkeep | $0 |
| **Total** | **$29.95M** | **Total** | **$18.35M** |

That is a profit of $11.6M, where the plan's first numbers gave a loss of $2.6M. A season that ends after 5 games still makes about $4M on the starting payroll. So the starting team is safe; the squeeze comes as the payroll grows toward the $35M cap and from choosing between players, staff and buildings ($270M to build everything).

## Set bonuses and difficulty (design round, 2026-11-14)

| Value | Where | Now | Note |
| --- | --- | --- | --- |
| One-timer window | `physics.json` shot.oneTimerWindow | 0.5 s | After receiving a pass meant for him |
| One-timer shot scale | `sets.json` Sniper 4 | 1.2 | On top of counting as fully charged |
| Big-hit closing speed | `physics.json` check.bigHitClosingSpeed | 5 m/s | The ordinary body check needs 2.5 |
| Breakaway speed scale | `sets.json` Burner 4 | 1.12 | With the puck and nobody ahead |
| Difficulty level shift | `season.json` difficulties | -0.2, 0, +0.15 | Added to every opponent's AI level, held between 0 and 1 |
| Simulate penalty | `season.json` simPenalty | 4 rating points | Taken off your side in a simulated game |

All are first guesses. The three set mechanics are off for a player without the set, so the equal-teams balance series is unchanged (3.37 and 3.16 goals, save percentage .855) and the 20-season reports are unchanged.

## Sound levels (graphics round, 2026-11-14)

Nobody has listened to these yet. Each sound was rendered to numbers in the browser (an offline audio render at master gain 0.6) and adjusted until none was silent, none clipped, and the foreground sounds sat in the same range. "Heard" is how long the sound stays above a quiet threshold; the tail fades out, so it is shorter than the recipe's length.

| Sound | Heard | Peak before | Peak after | What changed |
| --- | --- | --- | --- | --- |
| pass | 0.03 s | 0.15 | 0.25 | Louder |
| shot | 0.07 s | 0.60 | 0.35 | A band of noise instead of everything above 900 Hz, which measured as pure hiss |
| post | 0.22 s | 0.34 | 0.34 | |
| save | 0.07 s | 0.22 | 0.22 | |
| hit | 0.12 s | 0.33 | 0.34 | |
| poke | 0.03 s | 0.04 | 0.17 | Was nearly inaudible |
| tap (pickup) | 0.02 s | 0.02 | 0.09 | Was nearly inaudible; still the quietest by design |
| drop (faceoff) | 0.02 s | 0.11 | 0.22 | Louder |
| whistle | 0.26 s | 0.23 | 0.23 | |
| horn | 0.88 s | 0.38 | 0.38 | |
| roar | 1.35 s | 0.19 | 0.28 | Lower and narrower, so it is a roar and not a hiss |
| groan | 0.69 s | 0.09 | 0.22 | Was nearly inaudible |
| chime, tick, select, back | 0.02 to 0.27 s | 0.09 to 0.15 | unchanged | |
| reveal, legendary | 0.11, 0.69 s | 0.15 | unchanged | |

Frame time on this PC at 844 x 390, sim step and drawing together, averaged over 600 frames: 5.2 ms with full detail, 4.8 ms with low detail (a frame at 60 a second has 16.7 ms). Low detail saves little here because the crowd is still drawn, only held still. A phone is slower; that is untested.

## Spread-out attack, long shots and faster passes (2026-11-14)

Asked for by the owner after a first game on the phone: attackers crowded the front of the net and passed back and forth there, and passes felt slow.

What changed:

- **Posts in the attacking zone.** Past the blue line (9 m from centre) the two skaters without the puck take two of three posts: net-front (3.5 m out), the wing (7 m out, 8 m wide, on the side away from the puck) and the point (1.5 m inside the blue line). A carrier out wide counts as the wing. The defenceman takes the point. A carrier holds up 7 m out when a teammate is already in front of the net.
- **Shots from distance.** In the zone, beyond normal range, with a clear lane: he plants his feet (the stick barely tilted) and winds up. Chance each time he thinks 0.10 to 0.25, range 11 to 16 m, wind-up 0.4 to 0.8 of a full charge (easy to hard).
- **Pass speed** 20 to 26 m/s; saucer pass 17 to 22.

Measured over 60 all-AI games at level 0.5, per team per game (the same script before and after):

| | Before | After |
| --- | --- | --- |
| Share of zone time with all three attackers within 7 m of the net | 4% | 0% |
| Share with two or more within 7 m | 10% | 4 to 5% |
| Shots from beyond normal range | 0.5 | about 2 |
| Goals from those | 0.01 | 0.02 |
| Passes made inside the zone | 10.0 | about 10 |

So the crowd at the net is gone and long shots are four times as common, but long shots almost never score (a goalie stops a straight shot from distance), and the number of passes in the zone did not fall.

What was learned on the way: a first version let the shooter skate in while winding up, which turned every "long shot" into a hard shot from the slot (6.3 goals a team at level 0.8). Releasing early instead made them harmless and cost possessions (2.2 goals). Planting the feet is what keeps the shot at distance.

Balance after, 200 games each:

| Target | Before | After |
| --- | --- | --- |
| Equal teams score 3 to 5 each | 3.37 and 3.16 | 3.06 and 3.27 |
| 90 beats 70 about 75% of the time | 75.5% | 75.5% |
| Save percentage .850 to .920 | .855 | .852 (equal teams), .864 (90 against 70) |

The scripted human-style player (skates to the slot and shoots; never passes) against the AI, 60 games each:

| AI level | Where the player meets it | Record | Goals for and against |
| --- | --- | --- | --- |
| 0.3 | Rookie, first region | 52 wins, 8 losses | 5.95 and 2.32 |
| 0.5 | Pro, first region | 46 wins, 14 losses | 4.92 and 2.93 |
| 0.75 | Exhibition; Pro, later regions | 34 wins, 26 losses | 4.28 and 3.58 |

At 0.75 that is closer than before this change (41 wins, 19 losses), so the AI is a little harder to beat by simply driving the net. Shots on target per shot were not split out for the scripted player; that part of the plan is still to do.

## Longer poke check (2026-11-14)

Asked for by the owner: a poke check should work from a distance, with the stick. `check.pokeRange` went from 1.9 m to 2.8 m. The body check (inside 1.5 m while closing, which staggers) is unchanged, and so is the poke's chance.

Balance after, two seeds of 200 games each:

| Target | Before | Seed "balance" | Seed "second" | Both |
| --- | --- | --- | --- | --- |
| Equal teams score 3 to 5 each | 3.06 and 3.27 | 3.10 and 3.23 | 3.38 and 3.17 | in range |
| 90 beats 70 about 75% of the time | 75.5% | 69.5% | 80.5% | 75.0% |
| Save percentage .850 to .920 | .852 | .849 | .844 | .847 |

The win rate swings 11 points between two seeds, so 200 games is too few to read it closer than that; together they sit on the target. The save percentage is just under its floor on both seeds (by .001 and .006). It was left alone: the gap is about the size of the noise, and nothing was retuned.

Scripted human-style player against the AI, 60 games: at level 0.5, 47 wins and 13 losses (4.75 goals for, 2.98 against); at 0.75, 37 wins and 23 losses (3.60 for, 3.15 against).

## Deeper gameplay: new moves and AI (2026-11-14)

Built after the research report put the hockey itself first. New moves: the one-timer as a basic move, a deke, big hits, more rebounds. AI: a slot guard, a goalie who steps out on a straight-on carrier, teammates who get open, team styles.

What moved, in numbers:

| Value | From | To |
| --- | --- | --- |
| shot.oneTimerPower (new) | gear only | 1.25: a one-timer is a full wind-up and a quarter harder |
| deke (new) | none | 0.3 s of slipping checks, 2.5 s cooldown, 0.2 stamina, a 5 m/s sidestep |
| check.knockdownSeconds (new) | none | 1.5 s on the ice after a body check thrown at 5 m/s closing speed or more (a stagger is 0.7 s) |
| goalie.reboundToSlot (new) | rebounds straight back out | pulled halfway toward straight up the ice |
| goalie rebound control: fastest shot he can freeze | 6 to 30 | 6 to 22: more rebounds |
| goalie.challengeDepth (new) | none | 0.5 m further out on a carrier within 10 m and 4 m of centre; he now meets a shot at the depth he is standing at |
| goalie positioning: net covered (radius) | 0.31 to 0.37 | 0.28 to 0.34 |
| AI passAwareness, easy end | 0.08 | 0.15 |
| AI dekeChance (new) | none | 0 to 0.08 each time it thinks under pressure |
| AI styles (new) | none | rush, cycle, dump and chase: see `ai.json` |

How often each new thing happens, per team per game, AI against AI at level 0.5 (120 games):

| | Per team per game |
| --- | --- |
| One-timer shots / goals | 2.9 / 0.28 |
| Goals within 2.5 s of a rebound | 0.47 |
| Big hits | 1.4 |
| Dekes (AI) | 4.2 |
| Checks, of which pokes | 52, of which 48 |

Balance after, 200 games on each of two seeds:

| Target | Before this round | After | Met? |
| --- | --- | --- | --- |
| Equal teams score 3 to 5 each | about 3.2 | 3.41 and 3.31; 3.65 and 3.59 | yes |
| 90 beats 70 about 75% of the time | 75.0% | 84.0% and 77.3% (80.6% together) | a little high |
| Save percentage .850 to .920 | .847 | .811 and .801 | **no: about .04 under** |
| Scripted slot-and-shoot player wins about half at the default level (0.75) | 37 of 60 | 80 of 150 (53%), 4.19 goals for and 3.87 against | yes |

The scripted player on easier settings, 150 games each: level 0.5 (Pro, first region) 108 wins; level 0.3 (Rookie, first region) 134 wins.

Why the save percentage fell: goals are unchanged, but fewer shots now reach the goalie (defenders in the slot block and poke more), and to keep scoring in range the goalies were made to cover slightly less net. It was left there on purpose: the owner had said the goalie seemed to save a lot. If it reads as leaky in play, the lever is the goalie's cover radius, with scoring then lifted another way.

How the slot-and-shoot pattern was closed: the scripted player and the AI took the same number of shots; the script simply converted more (14.5% against 10.2%) from straight in front. Adding defenders did not change that. What did was the goalie holding the depth he had stepped out to when the shot came, where before he drifted back to his line. The script and the AI now convert alike (11.8% and 11.7%).

Team styles are not equal in strength. Over 120 games with the three styles meeting each other: rush teams scored 4.13 a game with 46 passes, cycle teams 2.86 with 83 passes, dump-and-chase teams 2.06 with 52 passes. So the styles do play differently, but a dump-and-chase team is plainly weaker and a rush team stronger at the same ratings. That needs a tuning round.

Lessons: 60-game samples swing by about 9 wins either way, so the script was measured at 150 games; and a goal-rate change of 0.3 cannot be read from fewer than about 120 games.

## Momentum, tips, give and go, the goalie pull and boss tricks (2026-11-14)

New numbers, all in `physics.json` unless noted:

| Group | Values |
| --- | --- |
| momentum | goal 0.45, big hit 0.2, one-timer 0.12, save 0.06 of a full meter; drains 0.004 a second; an opposing goal halves it; on fire for 8 s: shot power +0.12, speed x1.06 |
| tips | screen: an attacker within 3 m of the goalie and 0.8 m of the puck's line makes him react 1.5 times slower; tip: within 1.3 m of a teammate who is within 7 m of the net, a shot of 12 m/s or more is redirected at the open side, give or take 4 degrees, keeping 92% of its speed |
| giveGo | a second press of pass within 0.5 s; lasts up to 3 s |
| pull | allowed in the last 25 s of regulation when behind by 1 or 2 |
| boss | the Gale's burst is 1.25 times speed for 2 s |
| `ai.json` emptyNetRange | the AI shoots at an empty net from up to 16 m |

How often each happens, AI against AI at level 0.5, 120 games:

| | Per game |
| --- | --- |
| On-fire spells | 1.2 a team |
| Tips / tip goals | 0.73 / 0.30 a team |
| Goalie pulls | 1.11 a game |
| Goals into an empty net | 0.63 a game |
| Goals by the team with the extra skater | 0.14 a game |

So pulling the goalie costs the trailing AI team far more often than it pays, by about four to one. It makes for a tense finish, but it is not a good bet at these numbers.

Balance, 200 games on each of two seeds:

| Target | Before this round | After | Met? |
| --- | --- | --- | --- |
| Equal teams score 3 to 5 each | 3.3 to 3.65 | 3.88 and 3.73; 3.83 and 4.25 | yes |
| 90 beats 70 about 75% of the time | 84.0% and 77.3% | 76.5% and 80.0% | a little high |
| Save percentage .850 to .920 | .811 and .801 | .792 and .783 | **no** |
| Scripted slot-and-shoot player wins about half at 0.75 | 80 of 150 | 79 of 150 | yes |

The save percentage fell again because every empty-net goal is a goal with no save, and tips beat goalies who have already moved. The scripted player on easier settings, 150 games: level 0.5, 104 wins; level 0.3, 136 wins.

A bug found by measuring: the momentum meter filled and then the per-step drain took it just under full before the check, so no team was ever on fire in 100 games. The check now comes first.

## Tap to poke, hold to hit; more shoot assist (2026-11-14)

Both asked for by the owner.

**Checking.** A tap of Check is a poke. Holding it for `check.bodyHoldSeconds` (0.25 s) and letting go is a body check, if the carrier is within arm's reach by then; otherwise that too is a poke. The check is thrown when the button comes up. Whether a hit counts, and whether it is a big hit, is judged by the fastest the checker closed on the carrier while the button was held, not by his speed at release: by then the two have usually bumped and stopped. The AI taps to poke and starts its hold early enough to let go as it arrives.

**Shoot assist** (the human's shots only):

| Value | From | To |
| --- | --- | --- |
| aimAssist.coneDegrees: how far off the net the stick may point and still be helped | 100 | 150 |
| aimAssist.cornerInset: how far inside the post the shot is aimed | 0.35 m | 0.25 m |
| aimAssist.spreadScale (new): how much the shot strays, against an unassisted one | 1 | 0.5 |

A first attempt aimed further inside the post (0.5 m) with the same reduced scatter, on the idea that more shots would be on target. It cut the scripted player from 4.2 goals a game to 1.1: every shot went exactly where the goalie already was, and the scatter had been what beat him. Aiming nearer the post is what helps.

Scripted slot-and-shoot player, 150 games each:

| AI level | Where met | Before | After |
| --- | --- | --- | --- |
| 0.75 | Exhibition; Pro, later regions | 79 wins, 4.54 goals a game | 101 wins, 6.01 goals |
| 0.5 | Pro, first region | 104 wins, 5.44 goals | 133 wins, 7.71 goals |
| 0.3 | Rookie, first region | 136 wins, 6.95 goals | 149 wins, 11.36 goals |

So the "wins about half at the default level" target from the earlier round is no longer met: the stronger assist was asked for and it makes a player who simply drives the net and shoots win two games in three. AI against AI is unchanged by the assist: 3.92 and 3.79 goals, save percentage .791, the 90 team winning 78%.

## Check assist for the player (2026-11-14)

The owner reported that checking seemed ineffective: often nothing happened at all, and body checks rarely came off. The fix chosen was to help the player only, the way aim assist does; the AI's checking is unchanged. The numbers are the `checkAssist` group in `physics.json`, and apply to the skater the human controls.

| Value | AI | Player |
| --- | --- | --- |
| How far round his front a poke reaches | 80 degrees | 220 degrees |
| Chance a poke works, before ratings | 0.30 | 0.50 |
| Chance a body check works, before ratings | 0.60 | 0.75 |
| Hold needed for a body check | 0.25 s | 0.15 s |
| Reach of a body check | 1.5 m | 1.9 m |
| Closing speed a body check needs | 2.5 m/s | 1.2 m/s |
| Wait after a check that reached nobody | 0.9 s | 0.3 s |

`checkAssist.strength` at 0 switches all of it off.

By keyboard in a live game, 15 tries each against a carrier placed beside the player: a tap from behind, from the side and from in front reached him every time and freed the puck 8, 8 and 9 times (with the old 80 degree arc the taps from behind and the side reached nobody). Hold and release coming in from behind: 12 thrown, 12 loose pucks, 9 staggers. Hold and release while skating away from a carrier who is also leaving reaches nobody, as it should: the puck is over 3 m away by the time the button comes up.

AI against AI is unchanged (3.92 and 3.79 goals). The scripted player never checks, so its figures do not move either; how much the assist helps a real player win is not measured.

## Shot fake, shot block and hints (2026-11-14)

Asked for by the owner: new moves for the player, and on-screen reminders of the moves.

**Shot fake** (`fake` in `physics.json`). Pass pressed during a wind-up of at least `minCharge` (0.15 s) cancels the shot and passes nothing. A goalie within `range` (14 m) whom the shooter is facing is stuck where he is for `biteSeconds` (0.4 s) at a reaction time of `fullBiteReaction` (0.16 s), less for a quicker goalie, at most 1.5 times as long for a slower one. Opponents within `defenderRange` (4 m) cannot check for `defenderFreezeSeconds` (0.5 s). `cooldownSeconds` is 1.2.

**Shot block** (`block`). A skater without the puck who has held Check for `braceAfterSeconds` (0.35 s), with the other team's carrier at least `minCarrierDistance` (3 m) away, is braced: he moves at no more than `maxSpeed` (2 m/s), and an opponent's shot within `reach` (1.3 m, against a body's 0.71 m) stops with `keepSpeed` (8%) of its speed. It adds `momentum.block` (0.08) to the meter.

**Hints** (`src/data/hints.json`): each retires after 3 uses; a hint stays up at least 2.5 s and the next waits 3 s.

Measured: AI against AI is unchanged to the digit (200 games: 3.92 and 3.79 goals, save percentage .791), because the AI neither fakes nor braces. In a live game by keyboard: a fake left the puck with the shooter and the goalie bitten for 0.33 s; five shots at a braced player were all blocked. How many more goals a fake is worth to a real player is not measured: the scripted player does not use it.

## Ratings matter more; player kinds and talents (2026-11-14)

First stage of the "choices matter" round. A review found ten rating points changed play by about 1%.

**What each rating does** (`ratings.json`). Every range is steeper and passes through the same value at 70, so an average player is untouched.

| Effect | Per 10 points before | Per 10 points now |
| --- | --- | --- |
| Top speed and acceleration | 1% | 2.1% |
| Shot power (shot speed) | 0.03 (1.4%) | 0.058 (2.6%) |
| Accuracy | 0.03 | 0.051 |
| Pass speed | 2% | 3.7% |
| Check strength, puck security (check odds) | 0.03 (1.2 points) | 0.08 (3.2 points) |
| Energy drain and recovery | 2% | 3.7% |
| Goalie reaction | 7 ms | 9.7 ms |
| Goalie cover | 1.9% | 2.9% |
| Goalie stamina: how fast he tires | nothing | 6.9% |

Full widening (about twice these steps) made a 90 team beat a 70 team 96.5% of the time, so it was set at just over half of that.

AI against AI, level 0.5, 200 games each:

| Series | Before | Now |
| --- | --- | --- |
| 70 against 70 | 3.92 and 3.79 goals, save % .791 | 4.01 and 4.17 goals, save % .782 (the same within noise: equal teams are untouched) |
| 80 against 70 | not measured | 80 wins 69.5%, 4.80 to 3.10 goals |
| 90 against 70 | 90 wins 78% | 90 wins 89%, 5.59 to 2.27 goals |

Save percentage is still under the .850 target for equal teams; the better team's goalie is at .858.

`offseason.json` `quick.ratingPointsFor75Percent` goes from 20 to 12, so a simulated game gives 20 points 86%, in line with the ice.

**Player kinds** (`playerKinds.json`): sniper, playmaker, speedster, enforcer, two-way; reflex, positional and steady goalies. A new player's ratings lean by about 12 points toward his kind. The kind shown is worked out from the ratings, so it follows how he develops. **Talents**: a new player may carry his kind's talent; the chance runs from 0 for a D grade to 1 for an S.

League health (6 seeds, 8 years, three manager styles): no bail-outs, team strength and cash follow the same paths as before.

## Roster decisions (2026-11-14)

Second stage of the "choices matter" round.

| Rule | Value | Where |
| --- | --- | --- |
| Payroll limit (yours only) | 17% of the club's value plus 50% of its cash, never above the cap | `economy.json` `payroll` |
| Always allowed | a player at or under `cheapCapHit` ($1.5M), and any signing while you cannot ice a team | `offseason.json`, `scouting.ts` |
| Contract length | +5% a year for each extra year at 25 or younger; -5% at 31 or older; flat between | `offseason.json` `contract` |
| Dead cap | half the cap hit of a player released under contract, until the end of the coming season; none in a fire sale | `league.json` `deadCapShare` |
| Trade value | minus 1.5 for each $1M a player is paid above his grade's price; credit for room to grow cut from 0.5 to 0.3 a point | `offseason.json` `trade` |
| Roster | 8 skaters (was 7); the eighth is 60 for you, strength - 8 for AI teams | `league.json` |
| Balanced line | +0.04 puck security and check strength for the skaters of a line with a forward and a defenceman | `league.json` `lineBonus` |
| Gear level | each level above the first makes the piece's perk 10% stronger | `gear.json` `perkPerLevel` |
| 2-piece sets | Enforcer +0.1 check strength; Burner +3% top speed; Playmaker +8% pass speed; Brick Wall reacts 8% sooner (each was +5 to a rating) | `sets.json` |
| Skill points | your players' level-ups bank 3 points each for you to place | `xp.json` |

A new club has a limit of $22.0M against a payroll of $18.3M, so the best free agent ($8.4M) no longer fits beside the second best; before, both did.

**Why the limit, and not a lower cap.** Measured first: the top AI teams already sit at $34.5M of the $35M cap, and your starting team at $16.9M. Lowering the cap or raising pay would weaken the top of the league, not squeeze you. So the squeeze is an owner's limit that grows with the club.

League health, automatic managers, 10 seeds and 12 years: no bail-outs under any style; cash and value follow the earlier paths. The automatic managers' teams finish near 70 against a league average of 74.5 (before this stage, about 72 at year eight): the limit holds back a manager who does not win. A player who wins raises the club's value and so the limit; that has not been measured, because the automatic manager cannot do it.

## The season run: paths, strikes, artifacts, training (2026-11-14)

Third stage of the "choices matter" round. All in `season.json` unless said.

| Rule | Before | Now |
| --- | --- | --- |
| Links between steps (`branchChance`) | each stop led straight on, and across half the time | every stop leads to every stop on the next step |
| Game steps | two teams from the same tier, same pay | one plain game, one elite game: a team from the next tier up (the strongest of this tier in the last region), +3 ratings, AI level +0.1 |
| Elite win | none | 20 more Pucks and a choice of 2 artifacts, in place of the chance of a powerup |
| Beating a boss | Pucks and an artifact | also wipes a strike |
| Wiping a strike in a shop | 120 Pucks | 70 |
| Artifacts | kept until prestige; 14, all flat bonuses | cleared when a season starts; 24, ten of them a strength with a cost |
| Champion's prize artifact | one | none (it would be cleared at once) |
| Training | +3 to every rating of one player | that, or +10 to one rating, or (skaters) a trait: big hits, breakaway speed, one-timer |
| Scouting report | none | 35 Pucks in any shop, or the "scout's notebook" event: the next boss's team is 4 ratings weaker and its AI level 0.15 lower |
| Events | five had an option that was always better | charity donation buys two games of speed; the veteran lifts everyone by 1 or the worst by 4; returning the wallet pays off three times in five; the two wagers are near even |

Not measured: how far a real player's run gets now. The automatic seasons use random legal choices and games settled from strength; the league check over 8 seeds and 8 years runs clean with no illegal rosters.

## The club on the ice, and the round's final measurements (2026-11-14)

Fourth and fifth stages of the "choices matter" round.

| Rule | Before | Now |
| --- | --- | --- |
| Arena (`facilities.json` `homeIce`) | ticket money only | also, in home games, +0.6% top speed and +4% bench recovery a level |
| Training centre | XP and aging | also +0.008 accuracy and 3% tighter passes a level, in every game |
| Promoter, per grade step | tickets and sponsorship 3%, merchandise 4% | 1.5% and 2% |
| Prestige (`prestige.json`) | harder opponents, better packs | also sponsors pay 1% more of the club's value a level, and one facility level is free each climb |
| Mascot | takes a random skater's place | you see it before the game and choose who sits, or send him home |
| Off-season report | players and news | also what the club did: extra XP, aging saved, extra money, the medical wing, home ice |

End of the round, AI against AI at level 0.5, 200 games:

| Series | Result |
| --- | --- |
| 70 against 70 | 3.88 and 3.90 goals, save percentage .788 |
| 90 against 70 | the 90 team wins 90.5%, 5.76 to 2.16 goals |

Targets: equal teams 3 to 5 goals each (met). Save percentage .850 to .920 (missed, as before the round: .788). A 90 team beating a 70 team was 75% in the original targets; it is now 90.5% by design, since ratings were made to matter.

League health, 10 seeds and 12 years, automatic managers at the start of year 12:

| Style | Cash | Value | Payroll | Your team | League | Fire sales (year 12) | Bail-outs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cautious | $11.2M | $108.9M | $21.6M | 69.6 | 74.6 | 0 | 0 |
| Balanced | $6.9M | $107.5M | $20.0M | 68.6 | 74.4 | 0 | 0 |
| Spender | $1.0M | $109.6M | $18.5M | 67.0 | 74.3 | 5 of 10 | 0 |

The styles now end in different places: the cautious manager, who keeps cash, is allowed the biggest payroll and has the best team; the spender builds the most and can afford the fewest players. All three sit below the league average, because the automatic manager does not win and so its club's value, and with it the payroll limit, barely grows. Whether a player who wins keeps pace with the league has not been measured.

## The deke goes round the defender (2026-11-15)

The owner found the deke "does not beat anyone" and chose a deke that picks its own direction.

| Value (`deke` in `physics.json`) | From | To |
| --- | --- | --- |
| Direction | where the stick points | round the nearest defender within `threatRange` (5 m): `sideDegrees` (60) off the line to him, to the side the stick is pushed (`stickSide` 0.35), else the side with more room |
| impulse | 5 | 6.5 |
| windowSeconds (checks at him miss) | 0.3 | 0.45 |
| cooldownSeconds | 2.5 | 1.8 |
| Stamina | refused below 0.2 stamina | always allowed; it takes what is left |
| Defenders within `beatRange` (3.5 m) | untouched | lose half their speed; an AI defender cannot check for `beatSeconds` (0.6) |

Measured headless, a sprinting carrier against one AI defender, 300 tries each, counting how often he got past with the puck:

| Deke pressed at | No deke | Old | New |
| --- | --- | --- | --- |
| 1.6 m (late) | | 298 | 291 |
| 2.4 m | | 296 | 300 |
| 3.2 m | 164 | 292 | 300 |
| 4.5 m (early) | | 290 | 295 |
| 3.2 m, a second defender behind | | 288 | 300 |

So against the AI the old deke already worked when it fired: the new one is a little better, and clearly better with a second defender. The likelier cause of the complaint is that the old deke silently did nothing with stamina under 0.2 (a player who sprints a lot is often there) or inside its 2.5 second wait. Both are changed. This is a guess from the code, not something seen on the owner's phone.

AI against AI after the change (the AI dekes by the same rules), 200 games: 3.90 and 4.19 goals, save percentage .782.

## Loose ends and new content (2026-11-15)

**Line shifts** (`energy.heavyShift` 0.12 in `physics.json`): a line set to play more changes at energy 0.38, not 0.50; the other line then changes at 0.62. Even shifts are unchanged.

**Trades by position** (`offseason.json` `trade`): a player at a position the other team has 3 or fewer of is worth 2 more to it; 5 or more, 2 less; no team will drop below 2 forwards or 2 defencemen.

**Content added** (data only, apart from the small rules noted):

| Kind | Before | Now | New |
| --- | --- | --- | --- |
| Bosses | 5 | 8 | Frostgate Trappers (passes that cannot be picked off), Saltmarsh Shadows (every skater has the spin move), Cinder Peak Furnace (on fire at the start of every period: new stat `periodStartHeat`) |
| Powerups | 12 | 18 | One touch, Ghost passes, Afterburner, Sledgehammer, Sticky glove, Spark (fills the momentum meter: new effect `fillHeat`) |
| Talents | 5 | 10 | Quick release, Threader, Jets, Crusher, Engine: each kind of skater now has two and a new player gets one of them |
| Events | 19 | 27 | eight, two with new effects: skill points for Pucks, an artifact for a strike |
| Artifacts | 24 | 30 | Showman, Shot blocker, Giant killers, All in, Trap game, Deep bench (new stats `fakeBiteScale`, `blockReachScale`, and the season stats `eliteGain`, `eliteBump`) |

Elite games can no longer be simulated: like bosses, they have to be played.

After the round, AI against AI at level 0.5, 200 games, equal teams: 4.08 and 4.20 goals, save percentage .778 (before: 3.88 and 3.90, .788). The small rise is within the noise of 200 games; the new talents do not apply to the harness's uniform teams. League health, 10 seeds and 12 years: no bail-outs; teams and cash as before.

Not measured: how hard the three new bosses are to beat. The Furnace starts each period with the on-fire boost (about eight seconds of harder shots and faster skating), three times a game.

## A living league, commentary and music (2026-11-15)

**The league** (`standings.json`): a win is 2 points, an overtime loss 1; a one-goal game between AI teams goes to overtime 20% of the time; the playoffs take 4 teams (you and the best 3 AI teams); a rival's game pays 15 more Pucks; 2 map losses to one team make it a rival; at most 2 rivals; an award for one of yours pays $0.75M and 1 skill point.

AI games are settled from team strength by the same curve as Simulate. Over 40 rounds the strongest team finishes above the weakest and at least one of the top three teams by strength is in the top four of the table (tested).

**Commentary** (`commentary.json`): one line at most every 2.2 seconds unless something bigger happens; a line shows for 2.6 seconds. Sixteen kinds of call with two to five wordings each.

**Music** (`music.json`): eight pieces. The theme is 16 bars at 104 beats a minute (about 37 seconds) and loops; the others last under 6 seconds. Overall music level 0.5 before the player's volume; the theme dips to 0.35 under a short piece.

League health (6 seeds, 6 years) is unchanged: the table and bracket do not change who is strong, only whom you meet.

## Two players (2026-11-15)

No tuning numbers changed. The proof that a one-player game is untouched: the same series run before and after the change gave identical results.

| Series (level 0.5, equal teams) | Before | After |
| --- | --- | --- |
| AI against AI, 200 games | 4.08 and 4.20 goals, save percentage .778 | the same |
| Scripted player, 100 games | 84 wins, 7.59 to 3.81 goals | the same |

Co-op is two people against the same AI, so it is easier than playing alone; nothing was retuned for it.

## Team tactics and first pick of free agents (2026-11-15)

**Tactics** (`ai.json` `tactics`). Each row is 200 games, all AI, equal teams rated 70 at level 0.5, with team A on the setting shown and team B on Balanced. Win rates on 200 games move about 7 points by chance.

| Team A's setting | A wins | A's goals | B's goals | Shots A / B |
| --- | --- | --- | --- | --- |
| Balanced (no tactics) | 55% | 3.88 | 3.73 | 34.5 / 33.5 |
| Forecheck: Press | 45% | 4.05 | 4.21 | 37.7 / 33.0 |
| Forecheck: Sit back | 59% | 4.16 | 3.73 | 32.5 / 34.6 |
| Attack: Rush | 52% | 4.20 | 4.05 | 37.0 / 32.9 |
| Attack: Cycle | 47% | 3.81 | 3.98 | 33.2 / 33.8 |
| Attack: Crash | 57% | 4.57 | 3.83 | 35.6 / 34.0 |
| Defence: Collapse | 47% | 3.93 | 4.08 | 33.4 / 35.2 |
| Defence: Man-to-man | 50% | 4.13 | 4.24 | 37.6 / 33.1 |

How it got there. The first versions of Press, Cycle and Man-to-man were simply worse (43%, 39% and 35%). Press then swung to 63% when its two chasers were made to check every time, and came back to 45% with `pressCheck` at 0.6: it is sensitive to that one number. Cycle uses its own gentler style (`cycleStyle`: pass 1.15, long shots 1.0) because the league's cycle style was too weak. Man-to-man's presser now sprints and always checks, and its markers stand in the passing lane.

What the table does and does not show. Every setting changes goals for and against by a few tenths, so the choices are real, and none is far ahead. Crash and Sit back come out a little better than Balanced and Press, Cycle and Collapse a little worse; the differences are inside or near the noise. These are all-AI games: with a person on the ice a setting can be worth more or less than this (Cycle feeds the puck to you; Press leaves you to cover behind it). Balanced is identical to having no tactics: the standard series (4.08 and 4.20 goals, save percentage .778) is unchanged.

**First pick of free agents.** The pool opens when a season ends, with the new rookies; AI teams make their moves when you start the next season. League health, 10 seeds and 12 years: no bail-outs; the automatic managers' teams finish at 70.3, 69.2 and 68.4 against a league at about 74.8 (before: 69.6, 68.6, 67.0): first pick helps a little, and the payroll limit still decides most of it.

## The mascot as a visitor (2026-11-15)

`mascot.json`: `baseChance` 0.10, `missStep` 0.05, `trailBy` 2. By arithmetic a rising chance hits about one roll in four.

200 all-AI games, equal teams rated 70 at level 0.5, both with a mascot (two talents) whose run of misses carries from game to game, against the same 200 seeds with none.

| | No mascots | Mascots rated 88 | Mascots rated 94 |
| --- | --- | --- | --- |
| Arrivals per team per game | 0 | 0.30 | 0.32 |
| Games with a mascot on either side | 0 | 52% | 53% |
| Goals per game (A / B) | 4.01 / 3.88 | 3.90 / 4.05 | 3.87 / 4.01 |
| A team two or more behind at a period start that does not lose | 9% (16 of 179) | 9% (16 of 169) | 5% (10 of 182) |
| The same, when he came | | 5% (2 of 41) | 11% (5 of 47) |
| The same, when he did not | | 11% (14 of 128) | 4% (5 of 135) |
| His goals | | 30 in 113 minutes on the ice | 38 in 121 |

What it shows. He turns up in about half of all games for one side or the other. On the ice he scores about 0.27 to 0.31 goals a minute, against about 0.22 for an ordinary skater in these games: better, not overwhelming. In all-AI play he does not measurably change how often a two-goal deficit is recovered: the differences above are a handful of games either way. So the fear that he would swing games too far is not borne out here; if anything he is a small help. With a person controlling him it may be more. These rows were measured before his line was made to take the faceoff on arrival, which gives him a little more ice time.

## A stronger mascot, defence that pays, conditional artifacts (2026-11-15)

**The mascot's visit boosts** (`mascot.json` `visit`): speed x1.18, acceleration x1.3, shot power +0.3, accuracy x1.5, check strength x1.6, puck security x1.6, for him alone. Measured over 200 all-AI games by sending him on every time a team was two or more behind at a period start, against no mascots at all:

| | Two-behind moments | Did not lose | His goals a minute |
| --- | --- | --- | --- |
| No mascots | 167 | 8% (13) | |
| First try (speed x1.12, shot +0.2, accuracy x1.3, checks x1.4) | 175 | 13% (23) | 0.50 |
| As shipped | 161 | 15% (24) | 0.45 |

So when he comes, a two-goal deficit is recovered about twice as often as without him, which was the target. The samples are small (a dozen or two games each way), so "about twice" is the most that can be said. An ordinary skater scores about 0.22 a minute in these games.

**Momentum from defending** (`physics.json` `momentum`): `steal` 0.08, `evade` 0.06, `windUpSteal` 0.2. The standard series after the change: 4.03 and 4.28 goals a game, save percentage .780, overtime in 11% (before: 4.08, 4.20, .778). No measurable change to scoring.

**The new artifacts**, each over 100 all-AI games between equal teams with team A holding it. Win rates on 100 games move about 10 points by chance; with none, A won 50%.

| Artifact | A wins | Note |
| --- | --- | --- |
| Comeback kings | 50% | |
| Lockdown | 58% | |
| Closers | 52% | |
| Sudden death | 50% | Only matters in overtime |
| Deadlock breakers | 46% | |
| Home cooking | 65% | Measured as if always at home. Cut from 20% to 12% afterwards; not re-measured |
| Answer back | 64% | Cut from 8% for 12 s to 5% for 10 s afterwards; not re-measured |
| Killer instinct | 51% | |
| Feed off the hit | 52% | |
| Springboard | 54% | |
| Pickpockets | 45% | |
| Tic-tac-toe | 47% | |
| Goalie project: reward / handicap | 61% / 38% | Reward cut from 12% to 8% afterwards |
| Two-a-days: reward / handicap | 56% / 27% | Handicap cut from 25% to 15% afterwards |
| New system: reward / handicap | 51% / 56% | The handicap (wider passes) does not hurt the AI measurably |
| Sponsor's demands: handicap | 57% | The reward is Pucks. The handicap (weaker shots) does not hurt the AI measurably |

What it shows. Most are within noise of even, as intended: they change when a team is strong, not how strong. Four were out of line and were cut; the cuts are not re-measured. Two bargain handicaps do not show as handicaps in all-AI play; they may for a person.

## Rinks and the shootout (2026-11-15)

100 all-AI games on each rink, equal teams rated 70 at level 0.5. No game got stuck on any of them.

| Rink | Goals a team | Shots a team | Save percentage | Minutes of play | Overtime |
| --- | --- | --- | --- | --- | --- |
| Standard | 3.97 | 33.7 | .784 | 6.7 | 15% |
| First to three | 2.06 | 18.4 | .800 | 3.6 | none |
| The pond (44 x 22 m, slippery, one line) | 3.83 | 38.9 | .832 | 6.7 | 15% |
| Heavy puck | 3.35 | 32.0 | .809 | 6.7 | 16% |
| Lively puck | 3.53 | 32.2 | .798 | 6.8 | 14% |
| Big nets (3.0 m; 3.5 m gave 9.7 goals a team) | 6.45 | 33.9 | .663 | 6.9 | 11% |

What it shows. The AI plays a whole, sensible game on each. The pond has more shots and fewer of them go in; heavy and lively pucks each cost about half a goal a team; big nets add about two and a half. First to three is a little over half a game. Whether the pond feels slippery enough, or the pucks different enough, is for a person to say.

**Shootout.** All-AI shooters score on 19% of turns and a shootout takes about 37 seconds of play (12 turns). The AI shoots early from range; a person who dekes or fakes should do better. A first try at giving the goalies an edge stopped every shot, so they have none.

## Run features and the league health check (2026-11-15)

`npm run seasons -- --seeds 10 --years 12`, before and after bounties, the ringer, stickers and recipes (the automatic manager hires the first free ringer; it plays no bounties, since its games are settled from strength).

| Manager, at year 12 | Your team before | after | Club value before | after | Bail-outs |
| --- | --- | --- | --- | --- | --- |
| Balanced | 69.2 | 69.5 | $106.5M | $109.0M | none |
| Spender | 68.3 | 68.3 | $110.5M | $110.0M | none |

The league stays at about 74.8. A free ringer wins the automatic manager a few more games a season, which shows as a little more club value; nothing else moves.

Not measured: how many Pucks a person now earns in a season. Bounties (6 to 15 a game), loans (20), rink bonuses (6) and handicap pay all add to it, against a shop where a strike repair costs 70. That needs a played season to judge.

## The passing chain and the replay (2026-11-15)

**Passing chain** (`physics.json` `chain`: `max` 3, `windowSeconds` 4). The standard series, 200 games:

| `reactionPerStep` | Goals a team | Save percentage |
| --- | --- | --- |
| Before the chain | 4.03 / 4.28 | .780 |
| 0.07 | 4.39 / 4.40 | .762 |
| 0.03 (shipped) | 4.21 / 4.14 | .779 |

At 0.07 it added about a quarter of a goal a team, so it was cut. At 0.03 scoring is where it was, within noise: in all-AI play the chain is close to cosmetic. Whether a person who passes on purpose feels it is for play to say.

**Replay.** A copy of the game takes 0.16 ms on the development PC and is 32 KB; one is taken a second. Not measured on the phone. A re-run from a copy matches the live game exactly, step for step, in an all-AI game and in one with scripted inputs (`tests/replay.test.ts`).

## The five complaints, measured (2026-11-15)

Players of the nearest comparable game still hold five faults against it. These are our numbers, from `tests/harness/checks.ts`: 100 games a row with the scripted player (who skates to the slot and shoots, and never passes, checks or presses switch) against equal teams rated 70.

| | Rookie | Pro | All-Star |
| --- | --- | --- | --- |
| Scripted player wins | 80% | 67% | 54% |
| Your goalie's save rate | .784 | .744 | .748 |
| Their goalie's save rate | .773 | .761 | .794 |
| A linemate has room (2.5 m clear) while you carry in their end | 94% | 90% | 97% |
| A linemate is within 6 m of the net while you carry in their end | 2% | 2% | 3% |
| A linemate is standing still then | 1% | 1% | 1% |

- **Switching.** On automatic, control moved to a team-mate who had the puck 47 times a game without a press: that is the rule (control follows the puck), not a fault, but it is what players of the other game call being handed the wrong skater. On the new hold setting it was 0.15 times a game. About 11 more moves a game are line changes and about 14 are faceoffs, where you take the draw.
- **Team-mates.** They keep moving and stay open. They are almost never at the net when this player carries the puck in: he rushes and shoots from ten metres before anyone arrives. With a player who holds the puck longer this may read differently; it is the one thing here worth watching in real play.
- **Goalies.** Equal ratings, and on Rookie and Pro the two save rates are within two points. On All-Star theirs stops .794 and yours .748: nothing about either goalie changes, but sharper opponents take better shots at yours. A player would see his goalie let in more, which is the complaint.
- **Checks**, from one fixed position, 3,000 tries each:

| | AI skater | Your skater | Yours, checking 80 against control 60 | Yours, 60 against 80 |
| --- | --- | --- | --- | --- |
| Poke | 30% | 49% | 55% | 43% |
| Body check | 62% | 74% | 81% | 68% |

A poke by your skater is close to a coin toss from the same spot, which is where "inconsistent" would come from. A body check lands three times in four.

**Whole seasons**, 40 on each difficulty, the scripted player in every game with a new franchise (your team averages 67 against a league at 70.6), plain choices between games:

| | Rookie | Pro | All-Star | The survey's benchmark |
| --- | --- | --- | --- | --- |
| Beat the first region's boss | 90% | 70% | 68% | about 75% |
| Won the title | 12% | 8% | 5% | about 50% |
| Games won of games played | 6.8 of 10.0 | 4.8 of 8.4 | 3.8 of 7.2 | |

**After the owner's three decisions** (same measurements, re-run):

- *Your poke is settled by position.* From within 2.2 m of the puck, anywhere but behind the carrier, it takes the puck every time; at full stretch or from behind, never. A better checker against a worse puck-handler reaches a little further. The AI's poke is still a roll (about 30%).
- *A linemate goes to the net.* On the Balanced attack, your first helper heads for the net front once you are 6 m past centre. Tried from centre ice first: the scripted player's wins fell from 69 to 41 in 100 on the same games, because the helper left the lane where loose pucks fall. From 6 m: 70 wins, and a linemate is at the net 6% of the carry time, up from 2%.
- *Rookie is easier late on.* Opponents' thinking drops a further 0.2 in region two and 0.3 in region three and the playoffs, and you have two more strikes. 40 Rookie seasons: first region cleared 92%, title 60% (before: 90% and 12%). Pro and All-Star are as they were.

The first region is at the benchmark on Pro. The title is far below it: a first-season club strikes out in the second or third region nearly every time. The benchmark comes from a game where every run starts level; ours starts a weak club that is meant to grow over seasons, so the two are not the same thing. Not changed yet: the owner decides.

## The lone carry-in, the trade exploit and gear's worth (2026-11-16)

### The lone carry-in

`npm run measure -- carry --games 60 [--player script|passer|novice]`: a 67 team against a 70 team at level 0.5. It says where a stand-in's shots and goals come from.

Before any change, 5.8 of the script's 6.4 goals a game came from one place: a shot off the carry from 6 to 10 m straight in front, 25 times a game, 23% of them in. A defender stood between the shooter and the net for 16% of those shots, and none ever went down to block. The passer's goals came from one-timers 3 to 6 m in front: 5.3 a game, 80% in.

| | Script: goals a game | its 6 to 10 m shot goes in | Passer: goals a game | its one-timer in front goes in | All-AI, goals a team |
| --- | --- | --- | --- | --- | --- |
| Before | 6.40 | 23% | 5.72 | 80% (5.3 a game) | about 3.0 |
| A man held back against a lone rush, AI shot blocking, goalies that read a pass | about 4.4 | 13 to 14% | about 6.7 | 52 to 54% (9 a game) | 3.1 to 3.3 |

What was built, and what each does:

- **A man held back against a lone rush** (`planDefend`). With the carrier leading the rush himself, one of the two defenders off the puck drops into the lane. A defender is now between shooter and net for about 60% of the script's shots.
- **AI shot blocking** (`wantsBlock`). The man in the lane goes down and stays down while the shot is in flight: about 5 blocks a game against the script. This is what cuts the script's goals; holding the man back without blocking did nothing (6.95 goals).
- **Goalies read a pass** (`passRead` 1, `passSlide` 1.6). Holding a man back frees the pass: with it, and no change to goalies, the passer went from 5.7 to about 9 goals a game. With the goalie playing the receiver's angle as soon as the pass leaves, and moving faster, the one-timer in front goes in 52% of the time in place of 70 to 80%. Reading the pass only after his reaction time, or only moving faster, did nothing: by the time he saw the pass the shot was gone.

Tried and taken out, each measured:

| Tried | Script | Passer | Why it went |
| --- | --- | --- | --- |
| Every team holds a man back all the time | 4.2 | 8.7 to 9.1 | Frees the pass |
| The chaser, once passed, marks a man and leaves the carrier | 5.0 | 11.45 | An unpressed carrier passes at will |
| The man nearest who is still goal-side goes to the carrier | 5.9 | 8.2 | He leaves the lane and is passed |
| The marker stands in the passing lane | 4.2 | 8.8 | He does not intercept |
| The man on the carrier cuts across to the lane | 6.8 | 6.05 | He is behind the carrier and cannot get there |
| A weaker one-timer (`oneTimerPower` 1.0) | | 8.35 | The shot's speed is not what beats the goalie |
| The goalie steps further out (`challengeDepth` 1.0, 1.5; the owner's idea) | 4.3, 3.65 | 8.8, 9.0 | It does cut the lone shot (to 10% at 1.5), and it leaves the goalie further from the pass. Left at 0.5. Tried again on 2026-11-17 with goalies reading the pass (below): the same trade. |

Not measured: a person. The numbers say passing is now the better play by half again, where the two were level.

### The goalie stepping out, tried again (2026-11-17)

With goalies reading the pass, 80 games each (all-AI: 120):

| `challengeDepth` | Script: goals, its 6 to 10 m shot goes in | Passer: goals, its one-timer in front goes in | All-AI, goals a team |
| --- | --- | --- | --- |
| 0.5 (shipped) | 4.30, 14% | 7.10, 55% | 3.08 and 3.24 |
| 1.0 | 4.86, 15% | 6.95, 61% | 2.92 and 3.31 |
| 1.5 | 3.64, 10% | 7.60, 68% | 3.10 and 2.96 |
| 0.5, and 1.0 more when the carrier has nobody of his within 9 m of the net | 4.67, 14% | 6.96, 59% | 3.15 and 3.17 |

Stepping out still trades the lone shot for the pass: at 1.5 the carrier loses a goal in six and the passer's one-timer goes in 68% of the time in place of 55%. The carrier is already the weak play (3% of Pro titles) and the passer the strong one, so this would widen the gap. Stepping out only against a carrier with nobody to pass to did nothing: a team-mate is nearly always within reach of the net. Left at 0.5, and the conditional rule was not kept.

### What it does to the difficulties

30 seasons each (`npm run measure -- seasons`); a sample this size swings about 8 points.

| Difficulty, stand-in | Before: first region, title | Now: first region, title |
| --- | --- | --- |
| Rookie, newcomer | 93%, 5% | 90%, 7% |
| Rookie, script | 100%, 80% | 100%, 87% (after the two easings below; 63% before them) |
| Semi-Pro, script | 100%, 75% | 100%, 43% |
| Pro, script | 100%, 27% | 80%, 3% |
| Pro, passer | not measured | 100%, 73% |

- **A person, 2026-11-17:** the owner's first region on Pro went 4-3 lost in overtime, 3-2 won late, and a 4-3 win over the boss, and felt even. Pro is left as it is.
- The two stand-ins have moved far apart on Pro: the one that only carries and shoots almost never wins the title now, and the one that passes wins three in four. A person is somewhere between, and nearer the passer the better he gets. The difficulties were not re-set: which stand-in Pro is set against is the owner's call.
- Rookie was kept where it was for the newcomer by two things: opponents at the bottom of the scale hardly block (`blockEagerness` from 0), and below `holdBackFrom` they do not hold a man back. Without them the newcomer cleared the first region 77% of the time.

### How far a season gets, by region (2026-11-17)

30 seasons each, with every change of this round and the next in (`npm run measure -- seasons`, which now reports each region and the playoffs). A sample this size swings about 9 points, and more between runs: Pro for the passer read 73% titles a day earlier and 47% here, with nothing between that should have moved it so far.

| Difficulty, stand-in | Region 1 | Region 2 | Region 3 and the playoffs | Title |
| --- | --- | --- | --- | --- |
| Pro, passer | 100% | 67% | 53% | 47% |
| Pro, script (carries and shoots) | 90% | 60% | 27% | 10% |
| Pro, newcomer | 17% | | 0% | 0% |
| All-Star, passer | 97% | 60% | 50% | 37% |
| All-Star, script | 77% | 37% | 10% | 0% |

- The second region is where most seasons end, on both difficulties and for both stand-ins. A season that clears the third region reaches the playoffs every time.
- All-Star can be won by passing (about one title in three) and not by carrying alone. It is a step harder than Pro, not a wall.
- The owner's own Pro games (a first region of three one-goal games, a 4-3 loss to open the second) sit between the two stand-ins, where a person should be.

### Trading

`tests/fleece.test.ts` plays a manager who does nothing but trade, taking whatever gains most.

- By the other teams' own measure of worth, he never gains: that held before and holds now.
- Trading only for overall today, he gained 50 to 60 points across a roster of nine in one off-season (nearly 7 a player): a 67 for a 79 aged 38, a 66 for a 75 aged 38. Teams priced an old star by his years and sold his present for nothing.
- Now a team wants `futurePerPoint` (1.5) of future worth for each point of overall it gives up today. The same manager gains about 20 points across nine players, and his roster is worth 45 to 60 less by their measure.

### Gear's worth

`npm run measure -- gear --games 100`: every player of a 70 team in a full kit of real pieces of one rarity, rolled as packs roll them, perks and set bonuses included, against a plain 70 team, all AI at 0.5.

| Kit | About, on each skater rating | Wins | Goals |
| --- | --- | --- | --- |
| Common, level 1 | +2 | 48% | 3.27 to 3.21 |
| Rare, level 1 | +6 | 67% | 3.44 to 2.65 |
| Epic, level 1 | +10 | 92% | 4.84 to 1.56 |
| Legendary, level 1 | +15 | 97% | 5.60 to 1.63 |
| Legendary, level 5 | +27 | 100% | 6.89 to 0.15 |

The Phase 6 figure (+15 on every rating wins 73%) left perks and set bonuses out, and they are most of it: a full Epic kit wins nine games in ten. Taken apart (`--part ratings|perks|sets`), each of the three alone won about 73% for Epic and 82 to 93% for Legendary, and together they compound.

**Reined in, on the owner's choice** (aim: full Epic about 70%, full Legendary about 80%). 160 games each:

| Kit | About, on each skater rating | Wins | Goals |
| --- | --- | --- | --- |
| Common, level 1 | +1 | 52% | 3.36 to 3.17 |
| Rare, level 1 | +3 | 57% | 3.44 to 2.90 |
| Epic, level 1 | +4 | 71% | 3.78 to 2.54 |
| Legendary, level 1 | +7.5 | 81% | 4.44 to 2.34 |
| Legendary, level 5 | +10.5 | 89% | 4.11 to 1.24 |

What changed:

| | Was | Now |
| --- | --- | --- |
| Points a boost: Common, Rare, Epic, Legendary | 2, 3, 4, 5 | 1, 1.5, 1.75, 2.5 |
| Points a level | 1 | 0.25 |
| A perk's gain a level | 10% | 5% |
| What a level costs (points, times `cashPerPoint`): Common | 10, 15, 20, 30 | 3, 4, 5, 8 |
| Rare | 20, 30, 45, 60 | 5, 8, 11, 15 |
| Epic | 40, 60, 90, 120 | 10, 15, 23, 30 |
| Legendary | 80, 120, 180, 240 | 20, 30, 45, 60 |
| Every perk, and every set bonus that is a number | as written | about three tenths of it (rounded to tidy figures) |
| Brick Wall, 3 pieces | saves the first goal of every period | saves the first goal of the game (`gameAutoSaves`) |

- The automatic save each period was the worst of it: about three goals a game taken off, every game, for as long as the pieces were worn. The same ability is still an artifact (one season) and the Wall's trick.
- The abilities a set of four switches on (big hits knock the puck loose, passes that cannot be picked off) are whole: they are what a set is for.
- A piece's points are now fractions and the rating it gives is the rounded sum, so one Rare piece is +2 on a rating and two are +3.
- Gear already owned is worth less from this change on; nothing in a save changes.
- A level gives a quarter of what it gave, so on 2026-11-17 it was made to cost a quarter of what it cost: taking a Legendary piece from level 1 to 5 is $3.1M where it was $12.4M.

### The league over twenty seasons

`npm run seasons -- --seeds 20 --years 20`, re-run after the removals of the subtraction round and this round's trade rule: no illegal roster and nobody over the cap in any year; the league's average stays between 70.6 and 74.9; the cautious manager is never in a fire sale, the balanced one has two franchises in one at year 20, and the spender lives in it as before, with four bail-outs across the twenty years (the last table had none).


## Change log

## The sponsor's target and the cup (2026-11-15)

| Number | Value | Where |
| --- | --- | --- |
| Sponsorship when the target is met | 15% more | `economy.json` `expectation.bonus` |
| Sponsorship when it is missed | 10% less | `expectation.penalty` |
| Wins asked for | 0.8 of last season's, plus one, between 3 and 9 | `expectation.shareOfLastWins`, `minWins`, `maxWins` |
| A cup tie won | 10 more Pucks | `season.json` `cupCurrency` |
| Large puck | 1.6 times the size, with a ring | `rinkLook.json` `bigPuckScale` |

`npm run seasons -- --seeds 20 --years 20` with the target in force (the automatic managers' seasons are settled from strength, so they meet the target in some seasons and miss it in others):

| Manager | Cash at year 20 | Lowest cash | Club value | Facility levels | Your team | League | Fire sales in year 20 | Bail-outs, all years |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cautious | $9.1M | $1.7M | $116.5M | 3.6 | 69.3 | 73.2 | 1 of 20 | 0 |
| Balanced | $4.6M | $0.3M | $116.9M | 4.3 | 69.4 | 73.1 | 2 of 20 | 0 |
| Spender | $1.7M | $0.0M | $120.8M | 8.3 | 69.3 | 73.2 | 10 of 20 | 0 |

No bail-outs under any style. I did not keep a run from just before this change to set beside it, so this table is the new baseline and not a before-and-after; the spender living in the fire sale is as the earlier tables had it.

Not measured: how often a person meets the target, or how often the cup tie lies on the road a person would choose anyway.

## The balance round (2026-11-15)

**Save percentage.** The .850 to .920 target is retired by the owner's decision. About 4 goals a side from about 35 shots is .78, and that is the figure to hold. Earlier sections that call .78 a miss are history.

**Pro.** 100 seasons each, the scripted player, a new franchise, plain choices (`measureSeasons`):

| Pro's shift in regions 2 and 3, and the playoffs | Extra strikes | First region cleared | Title | Seasons |
| --- | --- | --- | --- | --- |
| none (before) | 0 | 70% | 8% | 40 |
| -0.10, -0.15, -0.15 | 0 | 70% | 10% | 40 |
| -0.15, -0.20, -0.20 | 0 | 70% | 13% | 40 |
| -0.15, -0.20, -0.20 | 1 | 83% | 15% | 40 |
| -0.25, -0.35, -0.35 | 0 | 70% | 15% | 40 |
| -0.25, -0.35, -0.35 | 1 | 83% | 20% | 40 |
| -0.30, -0.40, -0.40 | 0 | 70% | 27% at 40, 18% at 100 | 40 and 100 |
| **-0.33, -0.43, -0.43 (shipped)** | 0 | 70% | **27%** | 100 |
| -0.35, -0.45, -0.45 | 0 | 70% | 40% | 40 |

An extra strike lifts the first region to 83% and was left out, so the first region stays at the benchmark. The title rate is steep in the shift: 0.05 either way is ten points or more, and 40 seasons swing by about seven points, so read the shipped line as "between 20 and 35%". With the shift, a Pro opponent in region two thinks at 0.32 and in region three at 0.37, below the first region's 0.5: later teams are stronger, not sharper. All-Star, 40 seasons after the style change below: first region 70%, title 0 of 40 (before: 68% and 2 of 40).

**AI styles** (`ai.json` `styles`), 120 games a pairing, equal teams at 70:

| | Before | After |
| --- | --- | --- |
| Numbers (pass, long shot, dump) | rush 0.7, 0.6, 0 · cycle 1.5, 1.5, 0 · dump 1, 1, 0.5 | rush 0.85, 0.85, 0 · cycle 1.1, 0.9, 0 · dump 0.9, 0.85, 0.15 |
| Rush against cycle | 70% wins, 4.72 to 3.36 goals | 59%, 4.13 to 3.52 |
| Rush against dump | 75%, 4.54 to 2.68 | 52%, 4.08 to 3.92 |
| Cycle against dump | 55%, 3.63 to 3.20 | 59%, 4.20 to 3.69 |

What the first pass showed: fewer passes and fewer long shots simply win, so a style that leans far toward either is weaker. The three now lean a little each way. 120 games swing by about nine points, so 59% is not proof of an edge. The Rush attack tactic uses the rush numbers: against Balanced over 200 games it now wins 50% (4.38 to 4.35 goals; it was 52%).

**Pucks in a season.** 40 seasons each with the scripted player (`measureSeasons` now counts them). The script buys one thing it can afford at each shop and nothing else, so "spent" is its habit, not a limit:

| | Rookie | Pro |
| --- | --- | --- |
| Games won of games played | 10.5 of 13.5 | 7.5 of 10.4 |
| Pucks earned | 536 | 386 |
| Shops reached | 1.9 | 1.6 |
| Shops where something could be afforded | 1.9 | 1.5 |
| Pucks spent (one item a shop) | 83 | 66 |
| Pucks left at the end | 453 | 321 |

A powerup costs 40 to 55 and a strike repair 70, so emptying a shop is about 200 Pucks. A Pro season's 386 Pucks would empty nearly every shop it reaches: price is rarely the thing that stops a purchase. Not changed: whether shops should bite harder is the owner's call. (These first 40 Pro seasons won 37% of titles; the same seeds are the lucky end of the 100 above, which is the figure to trust.)

**Replay cost.** One whole exhibition game stepped by hand in the test pane at 844 x 390, full rink detail, replays on (22,888 live frames and 1,584 replay frames): a live frame took 5.3 ms on average and a replay frame 3.8 ms. Showing a replay costs no more than playing. The recorder's copy of the world once a second is inside the live figure, which is the same 5 to 8 ms measured before replays existed. The longest single frames (up to about a second) came at the start of each batch of stepping and are the test pane, not the game. A desktop pane is not a phone: this says replays are not the expensive part, not that the phone holds 60 frames a second.

## The content round (2026-11-15)

**New rinks**, 100 all-AI games each at level 0.5, equal teams:

| Rink | Goals a team | Shots a team | Save percentage | Overtime |
| --- | --- | --- | --- | --- |
| Standard (same seeds' series) | 4.24 and 3.86 | 34 | .777 | 15% |
| The long sheet (length 58) | 3.40 and 3.59 | 29 | .781 | 15% |
| Thin air (drain 0.03) | 3.31 and 3.41 | 32 | .813 | 17% |
| Small nets (mouth 2.25) | 2.08 and 2.51 | 35 | .879 | 17% |

All three finish every game and the AI plays them without getting stuck.

**Boss tricks against a plain equal team**, AI on both sides, 100 games each (the trick's modifiers on a 70 team, against a 70 team):

| Boss | Wins | Goals |
| --- | --- | --- |
| The Wall | 100% | 4.48 to 0.36 |
| Marathon | 77% | 5.90 to 3.34 |
| Trappers | 63% | 4.41 to 3.43 |
| Hammers | 54% | 3.97 to 3.42 |
| Pickets (new; block reach then 0.8) | 67% | 4.76 to 3.48 |
| Night Shift (new; then 1.07 and 0.1) | 61% | 4.82 to 3.99 |
| Granite (new) | 51%, then 58% with puck security 0.12 | 4.47 to 3.81 |

**The scripted player against each boss**, 40 games each, its 67 team against a 73 team with the trick (the Carnival's mascot is not in this measure):

| Wall | Marathon | Hammers | Gale | Marksmen | Furnace | Trappers | Shadows | Granite | Pickets | Night Shift | Carnival |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0% | 10% | 35% | 45% | 50% | 53% | 57% | 60% | 43% | 50% | 57% | 63% |

The new four sit inside the old range. After this the Pickets' block reach went to 1 and the Night Shift's late boost to 1.1 speed and 0.14 shot power.

**What the bigger boss pool did to the season measure, and Pro's number.** The script never beats the Wall and almost never the Marathon: it cannot play the answers (quick shots; passing through a press). With eight bosses a season met one of those two in 64% of seasons; with twelve, in 45%. So the script's results rose with no change to difficulty:

| Pro's shift (regions 2, 3, playoffs) | Bosses | First region cleared | Title | Seasons |
| --- | --- | --- | --- | --- |
| -0.33, -0.43, -0.43 | 8 | 70% | 27% | 100 |
| -0.33, -0.43, -0.43 | 12 | 88% | 39% | 100 |
| -0.30, -0.40, -0.40 (two new bosses stiffened) | 12 | 88% | 39% | 100 |
| **-0.20, -0.30, -0.30 (shipped)** | 12 | 88% | **29%** | 100 |

Rookie with twelve bosses, 40 seasons: first region 93%, title 60% (unchanged). The lesson: the season measure is mostly a count of how often the script meets a boss it cannot answer. Of the seasons that avoid both, the script now wins about half on Pro. A person who learns the two answers will do better than 29%; how much better only play will show. The first region at 88% is above the 75% benchmark for the same reason and was left: the first region has no shift to turn.

League health after the round (10 seeds, 12 years): no bail-outs under any manager style.

## The players round (2026-11-15)

Frame time in the test pane at 844 x 390, full detail, about 2,600 frames of an exhibition game stepped by hand each time (a desktop pane, not a phone):

| | Mean frame | Pictures kept after 45 seconds | Pixels to a body radius |
| --- | --- | --- | --- |
| Before (one shape for all, measured in the replay check) | 5.3 ms | not counted | 17 |
| New figure, a look for each player, same sharpness | 6.6 ms | 363 | 17 |
| New figure, sharper (`textureScale` 3, shipped) | 7.8 ms | 289, capped at 320 | 26 |

Each player now has his own pictures, so there are several times as many; each is about 135 by 150 pixels (some 80 KB), so the cap of 320 is about 25 MB. Past the cap the longest unused are dropped. The single frames of over half a second in each run came at the start of a batch of stepping, as in earlier measurements.

## Goalie assist (2026-11-15)

The owner's report: 12 goals against in a first-region game, most with an opponent in alone.

One AI skater alone from centre ice against a goalie, 100 tries each, no person on either team (so no assist): the goalie stops most of them at every rating.

| Opponent's level | Goalie 60 | Goalie 68 | Goalie 76 | Goalie 85 |
| --- | --- | --- | --- | --- |
| 0.3 | 17 goals | 18 | 12 | 11 |
| 0.5 | 20 | 20 | 17 | 15 |
| 0.65 | 10 | 11 | 9 | 8 |
| 0.8 | 8 | 8 | 8 | 8 |

So one breakaway is not the trouble; how many there are is. Whole games, the scripted player's 67 team against a 70 team at level 0.5, 40 games, the other team's shots split by whether the shooter had none of your skaters between him and your net:

| `goalieAssist` (reaction, extra depth) | Goals against a game | Clear-path shots a game | Scored | Other shots | Scored |
| --- | --- | --- | --- | --- | --- |
| none (before) | 4.50 | 25.1 | 15% | 10.2 | 8% |
| 0.6, 0.5 | 1.85 | 24.5 | 4% | 10.4 | 7% |
| **0.8, 0.25 (shipped)** | 3.50 | 24.4 | 10% | 10.7 | 11% |

Seven shots in ten against a person's team come with a clear path, and before the change four goals in five did. The shipped setting makes that chance about as dangerous as any other shot. With the player idle (never touching the controls) the AI scored 3.8 a game before. At opponent level 0.3 (Rookie's first region) the script conceded 3.67 before.

What this does not show: why a person concedes 12 where the script concedes 4.5. The script defends tirelessly; a person new to the game does not, and the skater a person controls is always the nearest one to the puck, so a slow reaction is a free lane. If games are still lopsided after this, the next lever is the team-mates' cover behind the play, not the goalie.

**Team-mates' checks and the boss rule, measured with the goalie assist in place.** Whole games as above (script, level 0.5, 40 games):

| | Before today | After |
| --- | --- | --- |
| Your AI team-mates' checks that land | not counted (30% base on a poke) | 47%, 31 thrown a game |
| The opponents' checks that land | | 36%, 78 thrown a game |
| Goals for and against | 6.42 and 4.50 | 7.10 and 3.23 |

Seasons with the script (`measureSeasons`), all of today's changes together, a boss loss ending the run on Pro:

| | First region cleared | Title | Seasons |
| --- | --- | --- | --- |
| Pro, before today | 88% | 29% | 100 |
| Pro, after | 73% | 19% | 100 |
| Rookie, before today | 93% | 60% | 40 |
| Rookie, after | 93% | 78% | 40 |

On Pro the easier games and the harsher boss rule nearly cancel for the script; on Rookie, which keeps the rematch, the script now wins nearly four seasons in five. The script is a strong, tireless defender and wins 36 single games in 40 at this level; the owner lost 12 to 3 and then 4 to 3 to a boss. The numbers above are the script's, not a person's.

## Sound levels, measured (2026-11-15)

Every sound and tune rendered off-line at full volume on the sound page (`?sound`), before the game's own volume: the loudest moment (1 would distort), and the length.

| Sound | Peak | Seconds | | Sound | Peak | Seconds |
| --- | --- | --- | --- | --- | --- | --- |
| horn | 0.63 | 1.26 | | groan | 0.37 | 0.89 |
| shot | 0.58 | 0.09 | | poke | 0.29 | 0.04 |
| hit | 0.57 | 0.16 | | chime | 0.25 | 0.34 |
| post | 0.56 | 0.29 | | reveal | 0.24 | 0.15 |
| roar | 0.46 | 1.69 | | legendary | 0.24 | 0.86 |
| pass | 0.42 | 0.04 | | select | 0.19 | 0.09 |
| whistle | 0.39 | 0.36 | | back | 0.18 | 0.05 |
| save | 0.37 | 0.09 | | tap | 0.16 | 0.02 |
| drop | 0.37 | 0.03 | | tick | 0.15 | 0.02 |

Nothing distorts. On-ice sounds are two to four times the menu sounds, as intended.

| Tune | Peak before | Peak now |
| --- | --- | --- |
| theme | 0.20 | 0.20 |
| win | 0.19 | 0.19 |
| fanfare | 0.15 | 0.19 |
| loss | 0.11 | 0.20 |
| goalFor | 0.10 | 0.21 |
| organ | 0.08 | 0.20 |
| goalAgainst | 0.07 | 0.18 |
| reveal | 0.06 | 0.19 |

Found: five of the eight tunes were half as loud as the theme or less, and the two goal stings a sixth of the horn they play beside. Their track gains were raised so every tune peaks near 0.2. The theme measures 18.5 seconds a pass, not the 37 an earlier note says. Whether any of it is pleasant is for the owner's ears: nothing here measures that.

## A second man to the puck, and the new shop (2026-11-15)

**What a person's team gives up** (`measureDefence` in `tests/harness/defence.ts`), 40 games, a 67 team against a 70 team at level 0.5:

| | Script, before | Script, after | Idle, before | Idle, after |
| --- | --- | --- | --- | --- |
| Goals for and against | 6.58 and 2.73 | 6.80 and 2.75 | 0 and 2.42 | 0 and 2.13 |
| Shots against | 31.4 | 28.8 | 27.2 | 26.2 |
| ...with nobody within 3 m of the shooter | 11.5 | 8.7 | 12.9 | 12.8 |
| Goals from those | 0.78 | 0.80 | 1.18 | 1.05 |
| Your AI team-mates' checks, a game | 33 | 37 | 21 | 19 |

For the script, a quarter fewer shots are let go with nobody on the shooter; goals against did not move. For an idle player almost nothing changes, and that is the control scheme, not the rule: control jumps to whichever of yours is nearest the puck, so the team-mate who goes to the carrier becomes the one you hold, and with the controls untouched he stops. With "Player switching: hold" that does not happen. A person who moves at all sits between these two columns. This is a modest gain, not a cure.

**Shop prices** (`powerups.json`, `season.json`): powerups 30 to 60 became 50 to 100; a strike wiped 70 to 110; scouting 35 to 55; new: a top-shelf artifact 150, a second chance 120, a reroll 20, 40, 60.

Seasons with the script (it buys one thing it can afford at each shop, never the top shelf, a reroll or insurance; it takes no powerup of its own):

| | First region | Title | Pucks earned | Spent | Left | Shops reached | Could afford something |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pro, 100 seasons | 75% | 23% | 336 | 87 | 248 | 1.6 | 1.2 |
| Rookie, 40 seasons | 95% | 78% | 567 | 143 | 424 | 2.3 | 1.9 |

A Pro season now earns enough for about one of the dear things (the artifact, or insurance and a powerup) and not all of them; at the first shop of a season there is often nothing it can afford. Rookie, where seasons run long, still ends with Pucks to spare. Not measured: a person who saves for the top shelf, and the effect of a powerup that recharges all season, which the script never presses.

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
| 2026-11-14 | aging.json, offseason.json | first guesses | see "League health over 20 seasons" above | To keep the league stable for 20 seasons |
| 2026-11-14 | pass.speed, pass.saucerSpeed | 20, 17 | 26, 22 | Passes felt slow to the owner |
| 2026-11-14 | ai.json: zone posts, longShotRange, longShotChance, longShotCharge, plantTilt | none | see "Spread-out attack" above | Attackers crowded the net |
| 2026-11-14 | one-timer, deke, knock-down, rebound, goalie challenge, cover radius, AI styles | see "Deeper gameplay" above | | New moves and AI after the research report |
| 2026-11-14 | momentum, tips, giveGo, pull, boss groups | none | see "Momentum, tips..." above | New mechanics |
| 2026-11-15 | energy.heavyShift (new); trade position numbers (new) | none | 0.12; 3, 5, 2, 2 | Loose ends from earlier rounds |
| 2026-11-15 | deke: direction, impulse, window, cooldown, stamina rule | see above | see above | The owner found the deke did not beat anyone |
| 2026-11-14 | ratings.json ranges; quick.ratingPointsFor75Percent | see above; 20 | steeper through the same value at 70; 12 | Ratings barely changed play |
| 2026-11-14 | fake, block (new groups), momentum.block | none | see above | New moves asked for by the owner |
| 2026-11-14 | checkAssist (new group) | none | see above | The owner found checking ineffective; help the player only |
| 2026-11-14 | aimAssist cone, inset, spreadScale | 100, 0.35, none | 150, 0.25, 0.5 | The owner asked for more shoot assist |
| 2026-11-14 | check.bodyHoldSeconds (new) | none | 0.25 | A body check needs the button held; a tap is a poke |
| 2026-11-14 | check.pokeRange | 1.9 | 2.8 | The owner wanted a poke check that works from a stick length away |
| 2026-11-14 | economy.json sponsorShareOfValue | 0.04 | 0.18 | Every manager style was bankrupt by season 3: income was per game but seasons can be 4 games long |

## Two measuring players, and what each difficulty is to them (2026-11-16)

`npm run measure -- seasons --player script|novice --difficulty rookie|pro|allstar --games 40`: a new franchise, plain choices, 40 seasons each. A 40-season sample swings by about 7 to 10 points.

The **script** carries the puck in and shoots for the open corner; it never passes or checks and never makes a mistake at what it does. The **newcomer** (`NOVICE` in `tests/harness/bot.ts`) reacts a quarter of a second late, steers roughly, does nothing a fifth of the time, and shoots from too far with a short wind-up. In single games on a 67 team against a 70 team it wins 17 of 40 at AI level 0.3 and 7 of 40 at 0.5 (goals 2.35 to 2.42, and 1.38 to 2.95). It was very sensitive while being set: one step either way made it win 18 of 30 or score 0.9 a game. Read it as a floor.

| Difficulty | Player | First region cleared | Title | Wins of games | Pucks earned, spent, left |
| --- | --- | --- | --- | --- | --- |
| Rookie | script | 95% | 78% | 11.0 of 12.7 | 567, 143, 424 |
| Rookie | newcomer | 58% | 0% | 2.6 of 8.2 | 126, 45, 81 |
| Pro | script | 80% | 35% | 7.9 of 9.0 | 399, 112, 287 |
| Pro | newcomer | 13% | 0% | 0.9 of 3.4 | 42, 9, 33 |
| All-Star | script | 63% | 5% | 4.8 of 6.2 | 230, 91, 140 |
| All-Star | newcomer | 5% | 0% | 0.6 of 3.1 | 28, 4, 24 |

What it says:
- The two players are a long way apart, and a real person is somewhere between. The owner's own games (a 12-3 loss, then a 4-3 loss to a boss) sit nearer the newcomer on Pro.
- Rookie is not gentle enough for a true newcomer: it clears the first region a little over half the time and never wins a title, while the script wins three in four.
- Pro ends a newcomer's season in the first region seven times in eight. With a boss loss ending the run, that is what Pro now means.
- Nothing was changed here. Where each difficulty should sit against the two players is the owner's decision.

Not measured: a person. The newcomer never uses a powerup, a deke, a pass or a check, and never changes lines by hand.

### Rookie re-set against the newcomer (2026-11-16)

The owner chose to ease Rookie only: the newcomer should clear the first region about three times in four and win a title about one season in ten. Only Rookie's `levelShift` was moved (opponents' thinking; nothing else).

| Rookie `levelShift` | Newcomer: first region | Newcomer: title | Newcomer: wins of games | Script: first region, title |
| --- | --- | --- | --- | --- |
| -0.2 (was) | 58% | 0% | 2.6 of 8.2 | 95%, 78% |
| **-0.35 (now)** | 70% | 5% | 5.0 of 10.7 | not measured at this setting |
| -0.4 | 85% | 22% | 6.8 of 12.5 | 93%, 75% |
| -0.45 | 85% | 25% | 6.6 of 12.0 | not measured |

-0.35 is the nearer of the two to the target and on the careful side of it, since a real beginner plays better than the newcomer does. -0.4 and -0.45 are the same within the sample's swing (later regions are already at the lowest level the AI has). The script's title rate did not move between -0.2 and -0.4 (78% and 75%): for a player who already beats the AI, Rookie is no easier than it was. Pro and All-Star are unchanged.

## After the first-contact round (2026-11-16)

Three rule changes that move the season numbers: a boss loss ends the season only under the "One meeting" handicap; the Wall and the Marathon never guard the first region; momentum is not cut by a goal against. Forty seasons each, as before; a sample this size swings 7 to 10 points.

| Difficulty | Player | First region cleared | Title | Wins of games | Before this round (first region, title) |
| --- | --- | --- | --- | --- | --- |
| Pro | script | 100% | 60% | 10.0 of 12.2 | 80%, 35% |
| Pro | newcomer | 25% | 0% | 1.0 of 4.3 | 13%, 0% |
| All-Star | script | 98% | 5% | 6.0 of 9.8 | 63%, 5% |

What it says:
- Pro is now a good deal easier for a player who already beats the AI: the script clears the first region every time and wins three titles in five. Most of that is the two walls leaving the first region and a boss loss no longer ending the run; which of the two counts for more was not measured apart.
- For the newcomer Pro is still hard: one season in four gets past the first region.
- The owner's earlier aim for Pro was a title about one season in four for the script. That aim is no longer met. Re-setting it belongs to the next round (the difficulties are to be re-set against both players and the owner's own results), and with the "One meeting" handicap as the way to ask for the old rule.
- Rookie was not re-measured after this round; its changes are the same two, both in the player's favour.

## The hockey and the difficulty round (2026-11-16)

### The four difficulties, as they stand

Forty seasons each (`npm run measure -- seasons --player script|novice --difficulty rookie|semipro|pro|allstar`); a sample this size swings 7 to 10 points. Every difficulty gives the help in full.

| Difficulty | Opponents' level by region, playoffs | Strikes | Script: first region, title | Newcomer: first region, title |
| --- | --- | --- | --- | --- |
| Rookie | 0.15, 0.10, 0.15, 0.25 | 5 | 100%, 80% | 93%, 5% |
| Semi-Pro | 0.35, 0.30, 0.35, 0.45 | 4 | 100%, 75% | 43%, 0% |
| Pro | 0.50, 0.55, 0.65, 0.75 | 3 | 100%, 27% | 18%, 0% |
| All-Star | 0.65, 0.80, 0.95, 1.0 | 3 | 98%, 5% (measured before this round's other changes) | 5%, 0% (measured before the first-contact round) |

- Pro's easing by region was halved (`regionShift` 0, -0.1, -0.15; playoffs -0.15; it was 0, -0.2, -0.3 and -0.3). With the old easing every region of Pro was played at about level 0.5, and the script won 60% of titles once the walls left the first region. At 27% it is back at the owner's aim of about one in four.
- Semi-Pro is `levelShift` -0.15 with Pro's old easing and one more strike.
- For the script the step from Semi-Pro to Pro is large (75% to 27%) and the step from Rookie to Semi-Pro is small; for the newcomer it is the other way round (93%, 43%, 18%). A person is between the two.
- All-Star was not re-measured after the last-man rule or the grace; neither should move it much.

### What a person's team gives up, and the last man back

`npm run measure -- defence --games 200`, a 67 team against a 70 team at level 0.5. "Open lane" is a shot with none of your skaters within 1.5 m of the line from shooter to net; "on the rush" is within 4 s of their getting the puck.

| Stand-in | Rule | Goals against | Shots against | Nobody ahead of the shooter | Open lane (on the rush) |
| --- | --- | --- | --- | --- | --- |
| Script | before | 2.58 | 30.0 | 21.9 | 16.7 (8.4) |
| Script | last man back | 2.66 | 29.6 | 15.1 | 14.9 (6.8) |
| Newcomer | before | 3.48 | 37.7 | 26.7 | 22.9 (12.5) |
| Newcomer | last man back | 3.42 | 35.3 | 17.8 | 19.0 (9.9) |
| Nobody at the controls | before | 2.50 | 27.0 | 15.3 | 17.5 (11.6) |
| Nobody at the controls | last man back | 2.12 | 25.3 | 11.5 | 15.8 (10.7) |

Uncovered shots fall by about a third; goals against do not follow, except with nobody at the controls. A man standing in the lane four metres out does not stop the shot often enough to show. Half of the open lanes are still rushes. Kept as a modest gain; the cover is not cured.

### What each step of help is worth

100 games each, a 67 team against a 70 team. (The first row of aim "part" is the blend that was thrown away.)

| Stand-in, level | All full | Aim part (blend, discarded) | Aim part (you choose the side) | Aim off | Goalie off | Check off | All off |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Script, 0.5: wins, goals for | 89, 6.35 | 16, 1.20 | 98, 8.02 | 86, 5.62 | 85, 6.69 | 88, 6.71 | 78, 5.38 |
| Script, 0.8: wins, goals for | 82, 5.70 | 5, 0.73 | 91, 7.04 | 63, 4.51 | 77, 6.16 | 80, 6.12 | 50, 4.03 |
| Newcomer, 0.3: wins, goals for | 44, 2.26 | 26, 1.50 | 52, 2.44 | 16, 1.02 | 33, 2.24 | 29, 1.83 | 9, 0.93 |

- The script scores more when it picks the side itself than when the game picks the open corner: it shoots short-side from beside the post. So the aim help is not what makes the solo carry-in pay, and the difficulties were not built from the steps of help.
- With every help off, the script still wins half its games at level 0.8.
- For the newcomer the aim help is worth the most by far.

### Passing against carrying

100 games, level 0.5, all help full.

| Stand-in | Goals for | Shots | One-timers: shots, goals |
| --- | --- | --- | --- |
| Script (never passes) | 6.33 | 36.8 | 0, 0 |
| Passer (passes to the man at the net, shoots first-touch) | 6.35 | 17.1 | 11.0, 6.0 |

A cross-ice one-timer scores on 55% of tries; a solo shot on 17%. The two plays are level only because the solo play shoots twice as often. Passing is not unrewarded for a person, whatever the all-AI measurement of the chain said.

### Tried and taken out

Goalies standing on the line that halves the angle between the posts (short side first): the script went from 6.35 goals a game to 9.42 with the help at full (the far side opened), and all-AI games from about 3 goals a team to 4.8 and 5.3, save percentage 0.724. Reverted.

Not measured: a person. Whether Pro at 27% for the script is right for the owner is for his games to say.

## The subtraction round (2026-11-16)

Eight systems were removed and Pucks were cut (see `docs/DECISIONS.md`). Forty seasons each, after all of it:

| Difficulty | Player | First region cleared | Title | Wins of games | Pucks earned, spent, left | Shops reached, could afford something at |
| --- | --- | --- | --- | --- | --- | --- |
| Pro | script | 95% | 38% | 8.5 of 11.4 | 295, 118, 176 | 2.2, 1.6 |
| Rookie | newcomer | 90% | 10% | 5.8 of 11.8 | 174, 76, 98 | 2.1, 1.0 |

- Pro's title rate for the script reads 38% here against 27% before the removals. The two are within the swing of a 40-season sample of each other, and the removals that touch play (no chain, no opponents' goalie pull, no temperaments) are small; it was not measured apart which, if any, moved it.
- "Left" overstates the surplus: the scripted shopper buys one thing it can afford and moves on. Two shops' shelves (an artifact at 150, a strike wiped at 105, powerups at 50 to 100, a report at 55, a reroll) hold several times what a season now earns, so a person has to choose.
- The newcomer can afford something at one shop in two.
- The money health check (`tests/club.test.ts`, 20 seasons, three styles) passes with the payroll limit gone because the careful automatic managers keep the same share-of-value prudence as their own rule. What a person does with a cap of room and no owner's limit was not measured.
- Not re-measured after this round: Semi-Pro and All-Star seasons, the defence counts, `npm run seasons`.

## The gameplay round (2026-11-17)

Four parts, chosen by the owner: team-mates in attack, opponents that differ, loose pucks and rebounds, bosses you can answer. New measurement: `npm run measure -- shape` (a team-mate open near the net, what becomes of rebounds, the last minute of a one-goal game); `measure -- bosses` now takes any stand-in and one boss.

### What was built

| Part | What | Where |
| --- | --- | --- |
| Loose pucks | A loose puck within 8 m of either net is chased by a team's nearest two (the second from within 7 m). Not a shot on its way. | `scrambleRadius`, `scrambleReach` |
| Team-mates | A man without the puck whose spot is covered tries either side and then a step out (3 m); a person's man at the net does it too. | `openSpot`, `getOpenBack` |
| Team-mates | On a person's team, with two or more opponents in its half, the first helper goes long over centre. | `stretchX` 6, `stretchAgainst` 2 |
| Styles | Rush: a man races to the net early, carriers hold the puck 0.7 as long, check 0.8, long shots 0.7. Cycle: hold 1.5 as long, pass 1.25, check 0.9. Dump and chase: two hunters in the other end, check 1.5, dump 0.25, long shots 1.1. | `styles` in `ai.json` |
| The score | In the last 60 s of the last period an AI team a goal or more behind sends two after the puck and checks 1.4 times as readily; one ahead sits back and collapses. | `late` in `ai.json` |
| The Wall | Shields are spent by any shot on goal (`shieldBurn`), as its card always said. Cover radius 1.2 to 1.12, reaction 0.85 to 0.9. | `bosses.json` |

### Styles against each other (150 games a pairing, equal teams at 70)

| Pairing | Before the round | After |
| --- | --- | --- |
| Rush v cycle | rush 44%, 3.19 to 3.42 | rush 57%, 4.11 to 3.77 |
| Rush v dump | rush 60%, 3.13 to 2.62 | rush 65%, 3.95 to 3.26 |
| Cycle v dump | cycle 64%, 3.52 to 2.83 | cycle 47%, 3.03 to 3.20 |
| Rush v no style | | 57%, 4.18 to 3.54 |
| Cycle v no style | | 47%, 3.34 to 3.59 |
| Dump v no style | | 48%, 3.24 to 3.47 |

A sample of 150 swings about four points. Rush is a little the strongest and its games have the most goals; dump and chase is no longer plainly the weakest (it takes 41 shots a game, most of them dumps). The run before the last two fixes had all six rows between 49 and 55%.

### Rebounds, as found (200 all-AI games)

About 12 a game for each side; the shooters get 47%, the defenders 52%; a goal inside three seconds 0.53 a game (one goal in six). That was judged healthy and the rebound's physics were left alone. The second chaser did not move these numbers; what it changes is that a person's line-mate goes for the rebound with him.

### The last minute (200 all-AI games)

In games with one side a goal up with 60 s left (about one game in three): the side ahead scored again 0.3 to 0.7 times a game and the side behind 0.6. Goals over the whole game did not move (3.2 a side), nor did the script's (4.70 to 3.02 with it, 4.72 to 3.02 without).

### What it did to difficulty

| Measure | Before the round | After |
| --- | --- | --- |
| All-AI, 200 games | 3.21 and 3.33 goals, overtime 16% | 3.43 and 3.23 |
| Script, 200 games (a 67 team v 70, level 0.5) | 4.37 for, 2.83 against | 4.62 for, 2.88 against |
| Passer, same | 7.22 for, 1.98 against (60 games) | 6.09 for, 2.58 against (200 games) |
| Script's shots blocked | 4.6 a game | 3.3 |
| Rookie, the newcomer, 30 seasons | first region 90%, title 7% | first region 97%, title 10% |
| Pro, the passer, 30 seasons | title 47% (and 73% in an earlier run) | title 47%; first region 100%, second 73%, third 57% |
| Pro, the script, 30 seasons | title 10% | title 3% (one season in 30 against three); first region 87%, second 57%, third 13% |

Read as: no measurable change for the script or the newcomer; the passer scores about a goal less, mostly because a second defender now goes for the rebound. Thirty seasons swing about ten points, so the script's Pro title rate is not shown to have moved.

### Tried and taken out, or cut back

- **The stretch man on AI teams.** With it the script scored 5.03 to 5.19 against 4.37 before: the man gone long was a defender missing when the puck turned over. With it off, 4.53. It is now a person's team only.
- **The second chaser going for a shot in flight.** Defenders left the shooting lane. A shot on its way is no longer a loose puck.
- **Style extras and the late push on the easiest opponents.** With them the newcomer cleared Rookie's first region 67 to 70% of the time (30 seasons) against 90% before. Opponents below `holdBackFrom` now play none of it: 97%.

### Bosses (100 all-AI games; the script 40 games each, its 67 team against a 73 team with the trick)

| Boss | Trick wins, AI v AI | Script beats it | Before the round |
| --- | --- | --- | --- |
| The Wall | 80% | 10% | 100%, 0% |
| Gale | 81% | 48% | 79%, 35% |
| Hammers | 56% | 57% | 63%, 50% |
| Marathon | 65% | 33% | 82%, 45% |
| Marksmen | 52% | 63% | 65%, 50% |
| Trappers | 73% | 63% | 63%, 48% |
| Shadows | 56% | 75% | 44%, 78% |
| Furnace | 48% | 70% | 64%, 68% |
| Granite | 58% | 70% | 56%, 65% |
| Night Shift | 70% | 53% | 65%, 50% |
| Carnival | 60% | 70% | 52%, 73% |
| Pickets | 59% | 53% | 60%, 57% |

Forty games swing about eight points; this table was taken before the last two fixes.

**The Wall.** Its card said the shields stop "the first three shots on goal of every period" and to "burn them with quick shots". The code spent a shield only on a shot that would have scored, so quick shots burned nothing: the trick won 100 of 100 all-AI games, 3.29 to 0.23, and the script never beat it. Now any save uses one up. With that alone: script 8%, passer 35%. With its goalie eased as well (60 games each): script 17%, passer 43%. It is still the hardest boss for a player who only carries in, and fair for one who passes. It stays out of the first region.

**The Marathon.** The card says "pass through them". Three stand-ins, 60 games each, after the round: the script (carries) 30%, the passer 22%, the outlet stand-in (passes to the furthest man up the ice when pressed in its own half) 22%. Before the stretch man existed the passer won 18% and the outlet stand-in 5%, so having a man to pass to helps; but passing out of the press has not been shown to beat carrying through it. The script's 30 to 45% says the Marathon is no longer a boss that cannot be answered (it was 10% when it was kept out of the first region). The card's advice is unproven and was left as written.

## The balance round (2026-11-17, second)

Three findings from the gameplay round's measurements, chosen by the owner: passing against carrying, Rookie's later regions, Pucks and the shops.

### Passing against carrying

| | Script (carries) | Passer | Its one-timer from 3 to 6 m in front | All-AI |
| --- | --- | --- | --- | --- |
| Before | 4.62 for, 2.88 against | 6.09 for, 2.58 against | 51% go in | 3.43 and 3.23 |
| A marked one-timer strays | 4.62 for, 2.99 against | 5.21 for, 2.85 against | 40% go in | 3.33 and 3.17 |

200 games each. The rule (`oneTimerCrowd`): a first-touch shot gets up to 16 degrees of extra scatter for an opposing skater within 2.2 m of the shooter, all of it inside 1 m. The gap between passing and carrying went from 1.5 goals a game to 0.6. Nothing else moved. On Pro the passer's title rate over 40 seasons is 43% (it was 47% over 30): inside the noise, so the season is not yet shown to be harder for a passer, only the single game.

### Rookie after the first region (the newcomer stand-in)

| | Region 1 | Region 2 | Region 3 | Title | Seasons |
| --- | --- | --- | --- | --- | --- |
| Before | 97% | 60% | 17% | 10% | 30 |
| A boss win wipes every strike | 87% | 50% | 23% | 7% | 30 |
| And later opponents 3 and 5 points below their ratings (shipped) | 88% | 78% | 53% | 22% | 40 |

Rookie's opponents already think at about 0.1 to 0.15 in every region, the floor, so there was nothing left to take from their thinking: what rises through a season is their ratings. Wiping strikes did almost nothing by itself. Rookie now breaks the rule that a difficulty changes thinking only, and its description says so.

**Found on the way, not acted on:** on Semi-Pro the newcomer clears the first region 38% of the time and the second 10% (40 seasons). The step from Rookie (88%) to Semi-Pro is a cliff for that stand-in.

### Pucks and the shops

The season stand-in bought one powerup a shop and nothing else, so its "Pucks left" overstated the problem. A second shopper was added (`--shopper`): a strike back, then the artifact, then a report on the boss, then powerups while the Pucks last.

| Pro, 30 to 40 seasons | Earned | Spent | Left | Shops reached | Could afford something at |
| --- | --- | --- | --- | --- | --- |
| Passer, one powerup a shop, before | 353 | 113 | 240 | 2.1 | 1.6 |
| Passer, sensible shopper, before | 297 | 133 | 164 | 2.3 | 1.4 |
| Script, sensible shopper, before | 192 | 96 | 96 | 2.0 | 1.2 |
| Passer, sensible shopper, after | 302 | 169 | 173 | 2.4 | 1.9 |
| Script, sensible shopper, after | 224 | 139 | 125 | 2.1 | 1.7 |
| Rookie newcomer, sensible shopper, after | 251 | 136 | 155 | 2.3 | 1.5 |

Even buying everything sensible, half the Pucks were left: they are won after the last shop (a boss pays 25, a playoff win 30), and the first shop is reached with one game's pay. Two changes:

- **A season starts with 40 Pucks.** Shops where something can be afforded went from 1.2 to 1.4 of about 2.2 to 1.7 to 1.9.
- **Pucks left over buy a pack** when the season closes: 100 a Bronze, 200 a Silver. With 125 to 175 left in an average season that is a Bronze most seasons and a Silver after a strong one. (First set at 60 and 140, which made a Silver the usual result; raised.)

Not done: a shop before the playoffs, and re-pricing. Gear's worth was not measured again with the extra pack a season; `npm run measure -- gear` and `npm run seasons` should be run if gear starts to feel strong.

## The difficulty and boss round (2026-11-18)

The numbers below were brought to the owner before anything in the difficulty table was changed. The owner then chose candidate B for Semi-Pro and left Rookie, Pro and All-Star as they are.

### The four difficulties, as found (40 seasons each; a new franchise; 40 seasons swing 8 to 10 points)

How far each stand-in got: first region / second / third / title.

| Difficulty | Newcomer | Script | Passer |
| --- | --- | --- | --- |
| Rookie | 88 / 78 / 53 / 22% | 100 / 100 / 100 / 100% | 100 / 100 / 100 / 100% |
| Semi-Pro | 27 / 3 / 0 / 0% | 100 / 93 / 75 / 50% | 100 / 93 / 85 / 60% |
| Pro | 8 / 0 / 0 / 0% | 85 / 40 / 13 / 5% | 95 / 65 / 50 / 43% |
| All-Star | 8 / 0 / 0 / 0% | 65 / 25 / 3 / 3% | 93 / 45 / 18 / 8% |

Two cliffs: the newcomer from Rookie to Semi-Pro (88% to 27% of first regions), and the script from Semi-Pro to Pro (a title 50% to 5%). Passing is worth far more on Pro (43% against 5%) than anywhere else.

### Two Semi-Pro candidates (40 seasons each); B is now Semi-Pro

| | Opponent levels (regions, playoffs) | Newcomer | Script | Passer |
| --- | --- | --- | --- | --- |
| As shipped | 0.35, 0.30, 0.35, 0.45 | 27 / 3 / 0 / 0% | 100 / 93 / 75 / 50% | 100 / 93 / 85 / 60% |
| A | 0.25, 0.30, 0.35, 0.45 | 50 / 8 / 3 / 0% | 95 / 80 / 63 / 43% | 100 / 93 / 88 / 68% |
| B | 0.25, 0.35, 0.45, 0.55 | 50 / 5 / 0 / 0% | 95 / 85 / 63 / 38% | 100 / 88 / 85 / 65% |

An easier first region doubles the newcomer's chance of clearing it and moves nothing else beyond the noise. B climbs toward Pro's levels (0.5, 0.55, 0.65, 0.75) where A stays flat.

### Every boss against two stand-ins (120 stand-in games each, its 67 team against a 73 team with the trick; 300 all-AI games)

| Boss | Trick wins (AI v AI) | Script beats it | Passer beats it |
| --- | --- | --- | --- |
| Wall | 86% | 20% | 32% |
| Gale | 79% | 41% | 52% |
| Hammers | 58% | 63% | 69% |
| Marathon (drain 0.85) | 51% | 64% | 65% |
| Marksmen | 58% | 63% | 68% |
| Trappers | 67% | 58% | 63% |
| Shadows | 53% | 67% | 82% |
| Furnace | 49% | 69% | 69% |
| Granite | 62% | 69% | 70% |
| Night Shift | 66% | 48% | 66% |
| Carnival | 53% | 57% | 83% |
| Pickets | 58% | 53% | 68% |

Leaving the Wall aside (kept out of the first region), the script's range is 41 to 69% and the passer's 52 to 83%. The Gale is the hardest that can be drawn first.

### The Marathon

Before: the script beat it 29%, the passer 17%, the outlet stand-in (passes up the ice when pressed in its own half) 13%, over 24 games each. Passing out halved the strips in its own half (41 to 22 a game) and the goals after one (2.0 to 0.8) and still lost: the lever was that skaters draining at 0.4 never tired. Drain 0.7: 45 / 55 / 23% (40 games). Drain 1.0: 70 / 80 / 50%. **Drain 0.85, shipped: 55 / 65 / 30% over 60 games, 64 / 65% over 120.** Passing out of the press is still not shown to beat carrying out; the card now says either.

### Tried and put back

The Gale at 5% faster in place of 8%: the script 48 to 38%, the passer 53 to 42% over 60 games, all inside the noise, so 8% stays.

## Two devices on a made-up wire (2026-11-18)

Step 0 of `docs/ONLINE.md`. `npm run measure -- online [--seconds N]`: a host and a guest in one process (`src/sim/online.ts`), joined by a wire that holds each message for the lag and loses some. Versus, the script in both seats, 180 seconds each, numbers in `src/data/online.json` (the host's word 20 times a second). Distances are metres between the guest's picture and what the host's game turned out to be at the same tick: the usual, and (the 95th in a hundred).

| Wire (round trip, lost) | Own skater | Their skater | Everyone else | Puck | Their skater jumps over 0.3 m, a minute | Biggest jump per word | Without running ahead, every move late by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None | 0.00 (0.00) | 0.01 (0.04) | 0.00 (0.00) | 0.02 (0.01) | 0.7 | 0.01 (0.06) | 67 ms |
| 50 ms, 1% | 0.00 (0.01) | 0.03 (0.19) | 0.00 (0.00) | 0.03 (0.03) | 20 | 0.03 (0.15) | 133 ms |
| 100 ms, 2% | 0.00 (0.02) | 0.09 (0.45) | 0.00 (0.00) | 0.09 (0.54) | 52 | 0.06 (0.29) | 210 ms |
| 200 ms, 3% | 0.02 (0.09) | 0.23 (1.05) | 0.02 (0.03) | 0.16 (1.28) | 81 | 0.11 (0.46) | 337 ms |
| 200 ms, 10% | 0.02 (0.11) | 0.19 (1.01) | 0.02 (0.03) | 0.19 (1.72) | 80 | 0.11 (0.59) | 340 ms |

- **Sent:** 16 KB a second down, 2.8 up, at every lag. The whole game (35 KB) went 3 to 6 times in three minutes, at faceoffs; the guest never had to ask for it, even with one message in ten lost.
- **Cost on this PC:** 5 to 12 ms a second for the guest's corrections (40 to 350 steps run again a second). A phone is several times slower; not measured on one.
- **Ended agreed** (same tick, score and clock) in every row.
- **Phones that disagree:** with a random 0.000000001 m, and then 0.0001 m, added to every position on the guest's copy at every step, the two stayed together and no whole game was asked for. Only positions were disturbed; a real phone may also differ in figures the host's word does not carry.
- **The line dropping for two seconds:** the guest asked for the whole game once and carried on agreed.
- **The score or the stage of the game wrong on the guest's picture:** none of the frames up to 100 ms, 0.1 to 0.2% of them at 200 ms (a goal seen a moment before the host said no, or after it said yes).

What it says: the guest's own skater is drawn where it really is, and the AI skaters almost exactly. The error is the other person's skater, and the puck when he shoots or passes, because his controls can only be guessed until they arrive. At 100 ms he is usually 9 cm off and one time in twenty half a metre; at 200 ms a metre. The corrections are small and frequent (about one a second over 0.3 m at 100 ms), so the drawing will have to ease them in, not snap. Without running ahead (way A) every move of the guest's would be 0.2 seconds late at 100 ms.

Not measured: a real connection, a real phone's speed, a person in either seat (the script steers smoothly; a person's stick moves more suddenly, which makes the guess worse), and how any of it feels.

## Two tabs joined for real (2026-11-19)

Step 1 of `docs/ONLINE.md`: the same host and guest, now inside the game, joined by a real browser-to-browser line (WebRTC) between two tabs on this PC. Both tabs were driven by hand from the same clock at about 30 frames a second (the test browser will not run two tabs at full speed), each with made-up key presses, for 1,500 frames. The line between two tabs on one machine has no lag to speak of, so this checks the wiring, not the feel.

| What | Figure |
| --- | --- |
| Guest's own skater, drawn against the host's game at the same tick | 0.015 m on average, 0.17 m at worst |
| The host's skater on the guest's screen (with the easing) | 0.075 m on average; over 0.3 m in 3% of frames |
| Puck | 0.10 m on average |
| Score at the end of the stretch | 1-2 on both |
| Whole game asked for again | never |
| Cost of the guest's net work | 0.5 ms a frame (a word from the host taken in: 0.4 ms, 7 to 9 steps run again) |
| How far the guest's picture ran ahead of the host's last word | 8 steps (130 ms) at these frame rates |
| The invitation link, the answer | about 680 and 630 letters |

Also seen working between the two tabs: a tab that is hidden pauses the game for both, with "The other player has paused." on the other; resume clears it; the guest ending the game returns him to Exhibition and leaves the host playing on with the AI in his place.

A first try gave the guest's own skater 0.6 m out. That was the test, not the game: the test browser ran the front tab at 36 frames a second and the back one at 1, so the guest could not keep up. It did show one real fault, now fixed: a guest whose host goes quiet ran its picture on alone without end. It now stops `maxLeadSteps` (45, three quarters of a second) ahead and says it is waiting.

`npm run measure -- online` after that change, 60 seconds each: 100 ms and 2% lost gives own 0.01, their skater 0.07 (0.44), puck 0.08 (0.54), as before.

Not measured: two separate devices, a phone, real lag, a person in either seat.

## Frame rate on the phone (2026-11-21)

The owner's phone ran the game at about 22 frames a second. Measured on this PC in the test browser at 844 x 390, the game stepped by hand at 60 steps a second, a full-detail exhibition game on the standard rink from the opening faceoff. Read the ratios, not the figures: nothing here was measured on a phone.

Where a frame went before, 300 frames at a time:

| Part | Milliseconds a frame |
| --- | --- |
| Phaser putting the frame on the screen | 20 to 23 |
| of which the crowd (about 777 people, some 3,100 shapes) | about 18 |
| Our own drawing (`draw()`) | 4.5 to 5.5 |
| of which new player pictures (one on 3 frames in 4, about 3 ms each) | about 3.5 |
| Scars, marks, nets, texts together | under 1 |
| The whole frame | 24 to 28 |

The pause menu's "drawing takes" figure timed `draw()` alone, so it said about 5 ms while a frame took 25: the crowd's cost is paid inside Phaser, after `draw()` returns. Half of a new picture's 3 ms was Phaser's canvas texture reading every pixel back when it is made.

What changed:

- **The crowd** is small pictures moved each frame (`Crowd` in `drawArena.ts`: one sheet painted at the start, one Blitter, three pictures a person), not shapes rebuilt each frame.
- **Player pictures** are painted on a thread of their own (`figurePainter.ts`, `figureWorker.ts`) and handed to Phaser as plain pictures (`addImage`), so nothing is read back. A player keeps the picture he had for the frame or two a new one takes. At most `figure.paintsWaiting` (24) are asked for at once.
- **A figure's top, hand and stick** are kept with his picture, so the pose is worked out once and not every frame.
- **Texts** are painted again only when their colour changes (Phaser's `setColor` did it every frame for about nine of them).
- **The pause menu's figure** is now the whole of the game's work in a frame, Phaser's part included.

After:

| | Before | After |
| --- | --- | --- |
| Work per frame, average | 24 to 28 ms | 3.6 to 4.8 ms |
| Phaser's part | 20 to 23 ms | 2.2 to 3.3 ms |
| Our drawing | 4.5 to 5.5 ms | 0.9 to 1.2 ms |
| The slowest frame in a hundred | not taken | 8 to 10 ms |
| New pictures painted on the game's thread | about 1 a frame | none after the first frame (12 after a resize) |

The production build, run live for 20 seconds in the same browser: 4.3 ms of work a frame, 1 frame in 1,277 over 16 ms, 1,200 pictures asked of the painter and 1,200 returned, never more than 5 waiting.

Seen on screen: the crowd, players, a goal, a replay, and a resize down and back up. The painter's pictures are not the same pixel for pixel as the old ones: about 1.5% of a picture's pixels differ, on the edges of the dotted shadows; side by side at twice the size no difference can be seen.

Left alone, because they measured as little: the scars and marks (up to 900 lines, about 0.9 ms of the 4 that are left, now the largest single part), the nets and the bench. A new picture is still wanted nearly every frame for the whole game, because 900 kept pictures are fewer than the poses a game uses; it no longer costs the game's thread anything but the hand-over.

Not measured or seen: anything on a phone; a processor slowed down (this browser cannot); low detail, the barn and the bowl, the calm setting, two players; offline play. Single frames of 100 to 460 ms still turn up about once in 600 when stepping by hand, as they did before the change; they have been put down to the test browser (see above) and were not traced.
