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
| player.shotPower / player.accuracy | 0.7 / 0.7 | The test skater's abilities, 0 to 1; player ratings replace these in Phase 2 |
| game.goalPauseSeconds | 1.5 | Celebration pause before the reset |

## Change log

| Date | Value | From | To | Why |
| --- | --- | --- | --- | --- |
