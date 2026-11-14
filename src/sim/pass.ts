import { wrapAngle } from './skater';
import { dist, loosePuck, skatersOf } from './team';
import type { Tuning } from './tuning';
import type { InputFrame, Player, SimEvent, Vec, World } from './types';

/** Where a pass at this speed should be aimed so it meets a moving teammate. */
export function leadPoint(from: Vec, mate: Player, speed: number): Vec {
  const time = dist(from, mate.pos) / Math.max(1, speed);
  return { x: mate.pos.x + mate.vel.x * time, y: mate.pos.y + mate.vel.y * time };
}

/**
 * The teammate a pass in this direction is meant for: the one best lined up with the aim,
 * inside the aiming cone. Null if nobody is.
 */
export function passTarget(world: World, passer: Player, aim: number, speed: number, t: Tuning): Player | null {
  const halfCone = (t.pass.aimConeDegrees * Math.PI) / 360;
  let best: Player | null = null;
  let bestOff = Infinity;
  for (const mate of skatersOf(world, passer.team)) {
    if (mate.id === passer.id) continue;
    const lead = leadPoint(world.puck.pos, mate, speed);
    const off = Math.abs(wrapAngle(Math.atan2(lead.y - world.puck.pos.y, lead.x - world.puck.pos.x) - aim));
    if (off <= halfCone && off < bestOff) {
      best = mate;
      bestOff = off;
    }
  }
  return best;
}

/**
 * Tracks the pass button for the puck carrier. Letting go passes: a tap along the ice,
 * a longer hold as a saucer pass that flies over sticks.
 */
export function stepPassing(world: World, p: Player, input: InputFrame, t: Tuning, dt: number, events: SimEvent[]): void {
  const wasHeld = p.passHeld;
  p.passHeld = input.pass;

  if (world.puck.carrier !== p.id) {
    p.passCharge = 0;
    return;
  }
  if (input.pass) {
    p.passCharge += dt;
    return;
  }
  if (!wasHeld) return;

  const saucer = p.passCharge >= t.pass.saucerHoldTime;
  p.passCharge = 0;
  const speed = (saucer ? t.pass.saucerSpeed : t.pass.speed) * p.fx.passSpeedScale;
  const tilt = Math.hypot(input.moveX, input.moveY);
  const aim = tilt > 0 ? Math.atan2(input.moveY, input.moveX) : p.facing;
  const puck = world.puck;

  const target = passTarget(world, p, aim, speed, t);
  let angle = aim;
  let flight = 0;
  if (target) {
    const lead = leadPoint(puck.pos, target, speed);
    angle = Math.atan2(lead.y - puck.pos.y, lead.x - puck.pos.x);
    flight = dist(puck.pos, lead) / speed;
  }
  angle += (world.rng.range(-1, 1) * p.fx.passSpreadDegrees * Math.PI) / 180;

  loosePuck(world);
  puck.vel.x = Math.cos(angle) * speed;
  puck.vel.y = Math.sin(angle) * speed;
  puck.passTarget = target ? target.id : null;
  puck.air = saucer ? Math.min(t.pass.saucerMaxAirSeconds, (target ? flight : 1) * t.pass.saucerAirShare) : 0;
  p.pickupLock = t.puck.pickupCooldown;

  // Control goes with the pass, so the receiver can be steered onto it.
  if (target && world.human && world.human.team === p.team) world.human.controlled = target.id;
  events.push({ type: 'pass', player: p.id, target: target ? target.id : null, saucer });
}
