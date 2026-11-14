import { availableSkaters, carrierOf, dist } from './team';
import type { InputFrame, World } from './types';

/**
 * Decides which skater the human controls this step.
 * With the puck: always the carrier. Without it: the switch button jumps to the skater nearest the puck
 * (or, if that is already the controlled one, to the next nearest). On a line change, control moves
 * to a fresh skater as soon as one is on the ice.
 */
export function updateControl(world: World, input: InputFrame): void {
  const human = world.human;
  if (!human) return;
  const carrier = carrierOf(world);
  const byDistance = availableSkaters(world, human.team).sort(
    (a, b) => dist(a.pos, world.puck.pos) - dist(b.pos, world.puck.pos) || a.id - b.id,
  );
  const current = world.players[human.controlled];

  if (carrier && carrier.team === human.team && carrier.role === 'skater') {
    human.controlled = carrier.id;
  } else if (!current || !current.onIce || (current.leaving && byDistance.some((p) => !p.leaving))) {
    // The controlled skater has gone off, or is going off and a fresh one is on: take the nearest who is staying.
    if (byDistance[0]) human.controlled = byDistance[0].id;
  } else if (input.switchPlayer && !human.switchHeld) {
    const nearest = byDistance[0];
    const next = byDistance[1];
    if (nearest) human.controlled = nearest.id !== human.controlled || !next ? nearest.id : next.id;
  }
  human.switchHeld = input.switchPlayer;
}
