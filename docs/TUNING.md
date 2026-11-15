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
| 2026-11-14 | aging.json, offseason.json | first guesses | see "League health over 20 seasons" above | To keep the league stable for 20 seasons |
| 2026-11-14 | pass.speed, pass.saucerSpeed | 20, 17 | 26, 22 | Passes felt slow to the owner |
| 2026-11-14 | ai.json: zone posts, longShotRange, longShotChance, longShotCharge, plantTilt | none | see "Spread-out attack" above | Attackers crowded the net |
| 2026-11-14 | one-timer, deke, knock-down, rebound, goalie challenge, cover radius, AI styles | see "Deeper gameplay" above | | New moves and AI after the research report |
| 2026-11-14 | momentum, tips, giveGo, pull, boss groups | none | see "Momentum, tips..." above | New mechanics |
| 2026-11-14 | aimAssist cone, inset, spreadScale | 100, 0.35, none | 150, 0.25, 0.5 | The owner asked for more shoot assist |
| 2026-11-14 | check.bodyHoldSeconds (new) | none | 0.25 | A body check needs the button held; a tap is a poke |
| 2026-11-14 | check.pokeRange | 1.9 | 2.8 | The owner wanted a poke check that works from a stick length away |
| 2026-11-14 | economy.json sponsorShareOfValue | 0.04 | 0.18 | Every manager style was bankrupt by season 3: income was per game but seasons can be 4 games long |
