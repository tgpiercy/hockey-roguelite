import { resolveLoosePuck } from '../src/sim/contact';
import { stepLoosePuck } from '../src/sim/puck';
import type { Tuning } from '../src/sim/tuning';
import type { Player, SimEvent, World } from '../src/sim/types';
import { STEP_SECONDS } from '../src/sim/world';

/** Player ids in a full world: team 0 is 0, 1, 2 (skaters) and 3 (goalie); team 1 is 4, 5, 6 and 7. */
export const ID = { home1: 0, home2: 1, home3: 2, homeGoalie: 3, away1: 4, away2: 5, away3: 6, awayGoalie: 7 } as const;

export function player(world: World, id: number): Player {
  const p = world.players[id];
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

/** Puts a player somewhere, standing still. */
export function place(world: World, id: number, x: number, y: number, facing = 0): Player {
  const p = player(world, id);
  p.pos = { x, y };
  p.vel = { x: 0, y: 0 };
  p.facing = facing;
  return p;
}

/** Hands the puck to a player, sitting on his stick. */
export function giveTo(world: World, id: number): Player {
  const p = player(world, id);
  world.puck.carrier = id;
  world.puck.lastTeam = p.team;
  world.puck.passTarget = null;
  world.puck.air = 0;
  world.puck.pos = { x: p.pos.x + Math.cos(p.facing) * 0.9, y: p.pos.y + Math.sin(p.facing) * 0.9 };
  world.puck.vel = { x: 0, y: 0 };
  return p;
}

/** Moves every skater not listed to a far corner, out of the play. */
export function clearIce(world: World, keep: number[]): void {
  const corners = [
    [-23, -10],
    [-23, 10],
    [23, -10],
    [23, 10],
    [-19, -11],
    [19, 11],
  ] as const;
  let i = 0;
  for (const p of world.players) {
    if (p.role !== 'skater' || keep.includes(p.id)) continue;
    const corner = corners[i++ % corners.length]!;
    place(world, p.id, corner[0], corner[1]);
  }
}

/** Lets a loose puck travel while the players stand still: movement, then catches and deflections. */
export function flyPuck(world: World, t: Tuning, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps && world.puck.carrier === null; i++) {
    world.puck.air = Math.max(0, world.puck.air - STEP_SECONDS);
    stepLoosePuck(world.puck, t, STEP_SECONDS);
    resolveLoosePuck(world, t, events);
  }
  return events;
}
