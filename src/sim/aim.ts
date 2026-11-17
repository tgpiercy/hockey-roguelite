import { wrapAngle } from './skater';
import { attackDir, goalieOf, otherTeam, targetNet } from './team';
import type { Tuning } from './tuning';
import type { Player, World } from './types';

/**
 * Aim assist for a human shooter. If the shot is pointed roughly at the net, it is steered toward
 * a corner: at full strength the open one (further from the goalie), with part of it the one on the side he points. Pointed anywhere else, it is left alone, so a
 * deliberate shot wide or around the boards still goes where the stick says. A one-timer (`firstTouch`) is
 * always steered: it is let go before he can turn the stick to the net.
 *
 * `aim` is the direction the stick asks for, in radians. Returns the direction to shoot in.
 */
export function assistedAim(world: World, shooter: Player, aim: number, t: Tuning, firstTouch = false): number {
  const a = t.aimAssist;
  if (a.strength <= 0) return aim;
  const net = targetNet(shooter.team, t);
  const puck = world.puck.pos;

  // From behind the goal line there is nothing to aim at.
  if (attackDir(shooter.team) * (net.x - puck.x) <= 0) return aim;

  const toNet = Math.atan2(net.y - puck.y, net.x - puck.x);
  // A one-timer is taken as the pass arrives, with the stick still pointing wherever he was skating: it goes at
  // the net whatever the stick says. Any other shot pointed away from the net is left alone.
  if (!firstTouch && Math.abs(wrapAngle(aim - toNet)) > (a.coneDegrees * Math.PI) / 360) return aim;

  const reach = Math.max(0, t.net.mouthWidth / 2 - a.cornerInset);
  const goalie = goalieOf(world, otherTeam(shooter.team));
  // At full strength the open corner is chosen for him: the one further from the goalie. With part of the help
  // (or no goalie) he chooses the side himself: it is the corner nearer to where the stick already points.
  // (Half-way between his aim and the open corner would be the goalie's chest, which is no help at all.)
  const pointed = wrapAngle(aim - toNet) * attackDir(shooter.team) >= 0 ? 1 : -1;
  const side = goalie && a.strength >= 1 ? (goalie.pos.y > net.y ? -1 : 1) : pointed;
  return Math.atan2(net.y + side * reach - puck.y, net.x - puck.x);
}
