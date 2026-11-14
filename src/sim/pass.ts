import { wrapAngle } from './skater';
import { availableSkaters, dist, distToSegment, loosePuck, otherTeam, skatersOf } from './team';
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
  for (const mate of availableSkaters(world, passer.team)) {
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
 * Pass assist for a human passer: like passTarget, but it also looks at whether the pass can get there.
 *
 * - With the stick pointed somewhere, teammates inside the aiming cone are compared on how far off the
 *   aim they are, and one whose lane is blocked by an opponent counts as further off. So between two
 *   teammates in roughly the same direction, the one who can actually be reached is chosen.
 * - With the stick centred, the pass goes to the teammate with a clear lane and the most room,
 *   rather than wherever the passer happens to be facing.
 *
 * A saucer pass flies over sticks, so its lane is never counted as blocked.
 */
export function assistedPassTarget(
  world: World,
  passer: Player,
  aim: number | null,
  speed: number,
  saucer: boolean,
  t: Tuning,
): Player | null {
  const a = t.passAssist;
  const halfCone = (t.pass.aimConeDegrees * Math.PI) / 360;
  const opponents = skatersOf(world, otherTeam(passer.team));
  const from = world.puck.pos;
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const mate of availableSkaters(world, passer.team)) {
    if (mate.id === passer.id) continue;
    const lead = leadPoint(from, mate, speed);
    const blocked = !saucer && opponents.some((o) => distToSegment(o.pos, from, lead) <= a.laneClearance);
    let score = blocked ? a.blockedPenaltyDegrees : 0;
    if (aim === null) {
      // No direction given: the more room he has, the better.
      const room = opponents.length === 0 ? a.roomCap : Math.min(a.roomCap, ...opponents.map((o) => dist(o.pos, mate.pos)));
      score -= room * a.roomDegreesPerMetre;
    } else {
      const off = Math.abs(wrapAngle(Math.atan2(lead.y - from.y, lead.x - from.x) - aim));
      if (off > halfCone) continue;
      score += (off * 180) / Math.PI;
    }
    if (score < bestScore) {
      best = mate;
      bestScore = score;
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

  // The skater the human controls gets pass assist; the AI picks its own targets.
  const assisted = t.passAssist.strength > 0 && world.human !== null && world.human.controlled === p.id;
  const target = assisted
    ? assistedPassTarget(world, p, tilt > 0 ? aim : null, speed, saucer, t)
    : passTarget(world, p, aim, speed, t);
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
  puck.shotBy = null;
  puck.air = saucer ? Math.min(t.pass.saucerMaxAirSeconds, (target ? flight : 1) * t.pass.saucerAirShare) : 0;
  p.pickupLock = t.puck.pickupCooldown;

  // Control goes with the pass, so the receiver can be steered onto it.
  if (target && world.human && world.human.team === p.team) world.human.controlled = target.id;
  events.push({ type: 'pass', player: p.id, target: target ? target.id : null, saucer });
}
