import { dist, otherTeam, skatersOf } from './team';
import type { Tuning } from './tuning';
import type { InputFrame, Player, World } from './types';

/** The opposing skater a deke is meant to beat: the nearest one on his feet within range, or null. */
export function dekeThreat(world: World, p: Player, t: Tuning): Player | null {
  let best: Player | null = null;
  let bestGap = t.deke.threatRange;
  for (const o of skatersOf(world, otherTeam(p.team))) {
    if (!o.onIce || o.stagger > 0) continue;
    const gap = dist(o.pos, p.pos);
    if (gap <= bestGap) {
      best = o;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Which way a deke goes. With a defender close it goes round him: across the line to him and a little
 * forward, to the side the stick is pushed, or (stick not pushed sideways) to the side with more room,
 * away from the boards and from his teammates. With nobody close it goes where the stick points, or
 * the way he faces.
 */
export function dekeAngle(world: World, p: Player, input: Pick<InputFrame, 'moveX' | 'moveY'>, t: Tuning): number {
  const tilt = Math.hypot(input.moveX, input.moveY);
  const threat = dekeThreat(world, p, t);
  if (!threat) return tilt > 0 ? Math.atan2(input.moveY, input.moveX) : p.facing;

  const toward = Math.atan2(threat.pos.y - p.pos.y, threat.pos.x - p.pos.x);
  const turn = (t.deke.sideDegrees * Math.PI) / 180;
  // How far the stick is pushed to one side of the line to the defender: positive is clockwise on screen.
  const across = tilt > 0 ? (Math.cos(toward) * input.moveY - Math.sin(toward) * input.moveX) / tilt : 0;
  if (Math.abs(across) >= t.deke.stickSide) return toward + Math.sign(across) * turn;

  const others = skatersOf(world, otherTeam(p.team)).filter((o) => o.onIce && o.id !== threat.id);
  const room = (side: 1 | -1): number => {
    const angle = toward + side * turn;
    const x = p.pos.x + Math.cos(angle) * t.deke.lookAhead;
    const y = p.pos.y + Math.sin(angle) * t.deke.lookAhead;
    const wall = Math.min(t.rink.width / 2 - Math.abs(y), t.rink.length / 2 - Math.abs(x));
    const crowd = others.reduce((least, o) => Math.min(least, Math.hypot(o.pos.x - x, o.pos.y - y)), t.deke.lookAhead * 2);
    return Math.min(wall, crowd);
  };
  return toward + (room(1) >= room(-1) ? 1 : -1) * turn;
}

/**
 * The deke beats the defenders close to it: they are caught leaning the wrong way (they lose speed),
 * and an AI defender cannot throw a check for a moment. The skater the human controls only loses the
 * speed: his checks during the deke already miss.
 */
export function wrongFoot(world: World, p: Player, t: Tuning): void {
  for (const o of skatersOf(world, otherTeam(p.team))) {
    if (!o.onIce || dist(o.pos, p.pos) > t.deke.beatRange) continue;
    o.vel.x *= t.deke.beatSlow;
    o.vel.y *= t.deke.beatSlow;
    if (world.human && world.human.controlled === o.id) continue;
    o.checkCooldown = Math.max(o.checkCooldown, t.deke.beatSeconds);
    o.ai.checkSteps = 0;
  }
}
