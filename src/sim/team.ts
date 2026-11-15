import { goalLineX } from './rink';
import type { Tuning } from './tuning';
import type { Player, Vec, World, Human, InputFrame } from './types';

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

/** Everyone on the ice. */
export function onIce(world: World): Player[] {
  return world.players.filter((p) => p.onIce);
}

/** A team's skaters on the ice. */
export function skatersOf(world: World, team: 0 | 1): Player[] {
  return world.players.filter((p) => p.onIce && p.team === team && p.role === 'skater');
}

/** A team's skaters on the ice who are staying on: not heading to the bench. Falls back to all of them. */
export function availableSkaters(world: World, team: 0 | 1): Player[] {
  const all = skatersOf(world, team);
  const staying = all.filter((p) => !p.leaving);
  return staying.length > 0 ? staying : all;
}

export function goalieOf(world: World, team: 0 | 1): Player | null {
  return world.players.find((p) => p.onIce && p.team === team && p.role === 'goalie') ?? null;
}

/** True if no opposing skater on the ice is between this player and the net he attacks: a breakaway. */
export function clearAhead(world: World, p: Player): boolean {
  const dir = attackDir(p.team);
  return !world.players.some((o) => o.onIce && o.role === 'skater' && o.team !== p.team && (o.pos.x - p.pos.x) * dir > 0);
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
  puck.shotBy = null;
  puck.threaded = false;
  // The run of touches carries on within a team and starts again when the other team gets it.
  const last = puck.touches[puck.touches.length - 1];
  // A turnover ends the passing chain; and whoever has it now, the last shot is over.
  if (puck.lastTeam !== player.team) puck.chain = 0;
  puck.shotChain = 0;
  if (puck.lastTeam !== player.team) puck.touches = [player.id];
  else if (last !== player.id) puck.touches = [...puck.touches, player.id].slice(-3);
  puck.lastTeam = player.team;
  // Control follows the puck, except in a give and go, where the human stays on the passer while the receiver has it.
  // With two humans on a team nobody jumps: each keeps his skater, and the free one keeps the puck until someone switches to him.
  const on = humansOn(world, player.team);
  const only = on.length === 1 ? on[0] : undefined;
  const go = only?.giveGo;
  const holding = go !== null && go !== undefined && player.id === go.receiver;
  if (only && player.role === 'skater' && !holding) {
    only.controlled = player.id;
  }
}

/** The people playing: one, two or none. */
export function humans(world: World): Human[] {
  return [world.human, world.human2].filter((h): h is Human => h !== null && h !== undefined);
}

/** The human controlling this skater, or null if the AI is. */
export function humanOf(world: World, playerId: number): Human | null {
  return humans(world).find((h) => h.controlled === playerId) ?? null;
}

/** The humans playing for a team. */
export function humansOn(world: World, team: 0 | 1): Human[] {
  return humans(world).filter((h) => h.team === team);
}

/** The other human on the same team (a co-op partner), or null. */
export function partnerOf(world: World, human: Human): Human | null {
  return humans(world).find((h) => h !== human && h.team === human.team) ?? null;
}

/**
 * What a team's humans are asking of the bench this step: either may call a line change or pull the goalie.
 * Null if nobody human plays for the team.
 */
export function teamInput(world: World, team: 0 | 1, input1: InputFrame, input2: InputFrame): InputFrame | null {
  const frames = humansOn(world, team).map((h) => (h === world.human ? input1 : input2));
  if (frames.length === 0) return null;
  if (frames.length === 1) return frames[0] as InputFrame;
  const [a, b] = frames as [InputFrame, InputFrame];
  return { ...a, pass: a.pass || b.pass, lineChange: a.lineChange || b.lineChange, pullGoalie: Boolean(a.pullGoalie) || Boolean(b.pullGoalie) };
}

/** Puts each human on a skater for a faceoff: the first on his team's centre; a co-op partner on a wing. */
export function placeHumans(world: World): void {
  for (const human of humans(world)) {
    const line = skatersOf(world, human.team);
    const partner = partnerOf(world, human);
    const wanted = human === world.human2 && partner ? line.find((p) => p.slot !== 0 && p.id !== partner.controlled) : line.find((p) => p.slot === 0);
    if (wanted) human.controlled = wanted.id;
  }
}

/** Takes the puck off its carrier and leaves it loose where it is. */
export function loosePuck(world: World): void {
  world.puck.carrier = null;
  world.puck.passTarget = null;
  world.puck.air = 0;
  world.puck.threaded = false;
  world.puck.tipped = false;
  world.puck.unstoppable = false;
}
