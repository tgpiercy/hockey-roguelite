import lessons from '../data/lessons.json';
import { attackDir, givePuck, otherTeam, skatersOf } from './team';
import type { Tuning } from './tuning';
import type { World } from './types';
import { lineUp } from './world';

/** A situation a lesson starts from: the puck loose at centre, on the person's stick, or on an opponent's. */
export type Drill = 'loose' | 'attack' | 'defend';

/**
 * Sets a scrimmage up for a drill: everyone back to his starting spot, and the puck with the centre of the
 * person's team (attack), with the other team's centre (defend), or loose between them.
 * It is called between steps, never inside one, and only on a practice rink.
 */
export function stageDrill(world: World, t: Tuning, drill: Drill): void {
  lineUp(world, t);
  const mine = world.human ? world.human.team : 0;
  if (drill === 'loose') {
    // Loose, but on the person's side of centre: his to reach first.
    world.puck.pos.x = -attackDir(mine) * Math.abs(t.game.skaterStartX) * lessons.looseShare;
    return;
  }
  const team = drill === 'attack' ? mine : otherTeam(mine);
  const centre = skatersOf(world, team).find((p) => p.slot === 0);
  if (centre) givePuck(world, centre);
}
