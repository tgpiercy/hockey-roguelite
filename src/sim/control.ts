import { carrierOf, dist, skatersOf } from './team';
import type { InputFrame, World } from './types';

/**
 * Decides which skater the human controls this step.
 * With the puck: always the carrier. Without it: the switch button jumps to the skater nearest the puck
 * (or, if that is already the controlled one, to the other skater).
 */
export function updateControl(world: World, input: InputFrame): void {
  const human = world.human;
  if (!human) return;
  const carrier = carrierOf(world);
  if (carrier && carrier.team === human.team && carrier.role === 'skater') {
    human.controlled = carrier.id;
  } else if (input.switchPlayer && !human.switchHeld) {
    const byDistance = skatersOf(world, human.team).sort(
      (a, b) => dist(a.pos, world.puck.pos) - dist(b.pos, world.puck.pos) || a.id - b.id,
    );
    const nearest = byDistance[0];
    const next = byDistance[1];
    if (nearest) human.controlled = nearest.id !== human.controlled || !next ? nearest.id : next.id;
  }
  human.switchHeld = input.switchPlayer;
}
