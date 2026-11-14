import { goalLineX } from './rink';
import type { Tuning } from './tuning';
import type { Player, Vec, World } from './types';

/** 1 if the team attacks toward +x (team 0), -1 if toward -x (team 1). */
export function attackDir(team: 0 | 1): 1 | -1 {
  return team === 0 ? 1 : -1;
}

/** Centre of the net this team defends. */
export function ownNet(team: 0 | 1, t: Tuning): Vec {
  return { x: -attackDir(team) * goalLineX(t), y: 0 };
}

/** Centre of the net this team shoots at. */
export function targetNet(team: 0 | 1, t: Tuning): Vec {
  return { x: attackDir(team) * goalLineX(t), y: 0 };
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function carrierOf(world: World): Player | null {
  return world.puck.carrier === null ? null : (world.players[world.puck.carrier] ?? null);
}

export function skatersOf(world: World, team: 0 | 1): Player[] {
  return world.players.filter((p) => p.team === team && p.role === 'skater');
}

export function goalieOf(world: World, team: 0 | 1): Player | null {
  return world.players.find((p) => p.team === team && p.role === 'goalie') ?? null;
}

export function otherTeam(team: 0 | 1): 0 | 1 {
  return team === 0 ? 1 : 0;
}

/** Shortest distance from point p to the segment a-b. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const k = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  return Math.hypot(p.x - (a.x + abx * k), p.y - (a.y + aby * k));
}

/** Gives the puck to a player. */
export function givePuck(world: World, player: Player): void {
  const puck = world.puck;
  puck.carrier = player.id;
  puck.passTarget = null;
  puck.air = 0;
  puck.lastTeam = player.team;
  if (world.human && world.human.team === player.team && player.role === 'skater') {
    world.human.controlled = player.id;
  }
}

/** Takes the puck off its carrier and leaves it loose where it is. */
export function loosePuck(world: World): void {
  world.puck.carrier = null;
  world.puck.passTarget = null;
  world.puck.air = 0;
}
