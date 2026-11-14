import { wrapAngle } from './skater';
import { attackDir, goalieOf, otherTeam, targetNet } from './team';
import type { Tuning } from './tuning';
import type { Player, World } from './types';

/**
 * Aim assist for a human shooter. If the shot is pointed roughly at the net, it is steered toward
 * the open corner: the one further from the goalie. Pointed anywhere else, it is left alone, so a
 * deliberate shot wide or around the boards still goes where the stick says.
 *
 * `aim` is the direction the stick asks for, in radians. Returns the direction to shoot in.
 */
export function assistedAim(world: World, shooter: Player, aim: number, t: Tuning): number {
  const a = t.aimAssist;
  if (a.strength <= 0) return aim;
  const net = targetNet(shooter.team, t);
  const puck = world.puck.pos;

  // From behind the goal line there is nothing to aim at.
  if (attackDir(shooter.team) * (net.x - puck.x) <= 0) return aim;

  const toNet = Math.atan2(net.y - puck.y, net.x - puck.x);
  if (Math.abs(wrapAngle(aim - toNet)) > (a.coneDegrees * Math.PI) / 360) return aim;

  const reach = Math.max(0, t.net.mouthWidth / 2 - a.cornerInset);
  const goalie = goalieOf(world, otherTeam(shooter.team));
  // With no goalie, take the corner nearer to where the stick already points.
  const side = goalie ? (goalie.pos.y > net.y ? -1 : 1) : wrapAngle(aim - toNet) * attackDir(shooter.team) >= 0 ? 1 : -1;
  const target = Math.atan2(net.y + side * reach - puck.y, net.x - puck.x);
  return aim + wrapAngle(target - aim) * Math.min(1, a.strength);
}
