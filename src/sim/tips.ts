import { dist, distToSegment, goalieOf, otherTeam, skatersOf, targetNet } from './team';
import type { Tuning } from './tuning';
import type { Player, SimEvent, World } from './types';

/**
 * True if an attacker is screening this goalie: standing close in front of him, on the line from the puck,
 * with the puck further out than he is. A screened goalie reacts later.
 */
export function screened(g: Player, world: World, t: Tuning): boolean {
  const puck = world.puck.pos;
  const away = dist(puck, g.pos);
  return skatersOf(world, otherTeam(g.team)).some((o) => {
    if (o.stagger > 0 || world.puck.carrier === o.id) return false;
    const near = dist(o.pos, g.pos);
    return near <= t.tips.screenRange && away > near + t.tips.screenClear && distToSegment(o.pos, puck, g.pos) <= t.tips.screenWidth;
  });
}

/**
 * A tip: a shot passing within a stick's reach of one of the shooter's teammates near the net is redirected,
 * once, toward the side of the net the goalie has left open. He becomes the last to touch it, so a goal is his.
 */
export function stepTips(world: World, t: Tuning, events: SimEvent[]): void {
  const puck = world.puck;
  if (puck.shotBy === null || puck.tipped || puck.air > 0 || puck.carrier !== null) return;
  const shooter = world.players[puck.shotBy];
  if (!shooter) return;
  const speed = Math.hypot(puck.vel.x, puck.vel.y);
  if (speed < t.tips.tipMinSpeed) return;
  const net = targetNet(shooter.team, t);
  // Only a shot heading for the net is tipped.
  if ((net.x - puck.pos.x) * puck.vel.x <= 0) return;
  for (const mate of skatersOf(world, shooter.team)) {
    if (mate.id === shooter.id || mate.stagger > 0 || mate.leaving) continue;
    if (dist(mate.pos, puck.pos) > t.tips.tipReach || dist(mate.pos, net) > t.tips.tipRange) continue;
    // He redirects it at the side of the net the goalie is not covering, give or take a few degrees.
    const goalie = goalieOf(world, otherTeam(shooter.team));
    const side = goalie ? (goalie.pos.y > net.y ? -1 : 1) : 0;
    const corner = { x: net.x, y: net.y + side * (t.net.mouthWidth / 2 - t.tips.cornerInset) };
    const angle = Math.atan2(corner.y - puck.pos.y, corner.x - puck.pos.x) + (world.rng.range(-1, 1) * t.tips.tipDegrees * Math.PI) / 180;
    puck.vel.x = Math.cos(angle) * speed * t.tips.tipKeep;
    puck.vel.y = Math.sin(angle) * speed * t.tips.tipKeep;
    puck.tipped = true;
    if (puck.touches[puck.touches.length - 1] !== mate.id) puck.touches.push(mate.id);
    // He does not also stop it with his body.
    mate.pickupLock = Math.max(mate.pickupLock, t.tips.tipperLockSeconds);
    events.push({ type: 'tip', player: mate.id });
    return;
  }
}
