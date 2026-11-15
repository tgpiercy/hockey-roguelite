import rules from '../data/mascot.json';
import { applyModifiers, type Modifier } from './modifiers';
import { refreshBoosts } from './powerups';
import { skaterEffects, type SkaterEffects, type SkaterRatings } from './ratings';
import type { Player, PlayerStats, SimEvent, World } from './types';

/**
 * The mascot as a visitor. He may arrive at the opening faceoff, or at the start of a later period
 * for a team that trails by enough goals. He takes one dressed skater's place for that period only.
 * Every roll that misses makes the next one likelier; when he arrives the chance starts again.
 */

/** A team's mascot as he comes to a game. */
export interface MascotSetup {
  /** What he is called, for the screens. */
  name?: string;
  ratings: SkaterRatings;
  /** His own lasting modifiers (talents that are simply always on). */
  modifiers: Modifier[];
  talents: string[];
  /** Which of the six dressed skaters (0 to 5) gives up his place when he arrives. */
  slot: number;
  /** How many rolls in a row have missed before this game. */
  misses: number;
}

/** What is put aside from the skater he replaces, and given back when he leaves. */
interface Saved {
  fx: SkaterEffects;
  baseFx: SkaterEffects;
  talents: string[];
  talentCooldown: Record<string, number>;
  rallyPeriod: number;
  position: Player['position'];
  stats: PlayerStats;
  conditional: Player['conditional'];
}

/** A team's mascot during a game. */
export interface MascotVisit {
  setup: MascotSetup;
  /** The team's lasting modifiers: he gets them like anyone else. */
  teamModifiers: Modifier[];
  /** Rolls missed in a row, up to now. */
  misses: number;
  /** How many times he has arrived this game. */
  arrivals: number;
  /** His own stat line, over every visit this game. */
  stats: PlayerStats;
  /** Set while he is on the ice. */
  saved: Saved | null;
}

const noStats = (): PlayerStats => ({ goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 0, saves: 0, goalsAgainst: 0 });

export function newVisit(setup: MascotSetup, teamModifiers: Modifier[]): MascotVisit {
  return { setup, teamModifiers, misses: Math.max(0, setup.misses), arrivals: 0, stats: noStats(), saved: null };
}

/** The chance of the next roll, after this many misses in a row. */
export function mascotChance(misses: number): number {
  return Math.min(1, rules.baseChance + rules.missStep * Math.max(0, misses));
}

/** The skater whose place the team's mascot takes. */
export function mascotPlayer(world: World, team: 0 | 1): Player | null {
  const visit = world.teams[team].mascot;
  if (!visit) return null;
  const perTeam = world.players.length / 2;
  return world.players[team * perTeam + visit.setup.slot] ?? null;
}

/** True if this player is, right now, a mascot. */
export function isMascot(world: World, p: Player): boolean {
  const visit = world.teams[p.team].mascot;
  return !!visit && visit.saved !== null && mascotPlayer(world, p.team)?.id === p.id;
}

/** The stats that belong to the player himself: while the mascot has his place, the ones put aside. */
export function ownStats(world: World, p: Player): PlayerStats {
  return isMascot(world, p) ? world.teams[p.team].mascot!.saved!.stats : p.stats;
}

function arrive(world: World, team: 0 | 1, visit: MascotVisit, p: Player): void {
  visit.saved = { fx: p.fx, baseFx: p.baseFx, talents: p.talents, talentCooldown: p.talentCooldown, rallyPeriod: p.rallyPeriod, position: p.position, stats: p.stats, conditional: p.conditional };
  // The mascot has no temperament: the skater's waits with the rest of him.
  p.conditional = [];
  p.active = [];
  p.timed = [];
  p.baseFx = applyModifiers(skaterEffects(visit.setup.ratings), [...visit.teamModifiers, ...visit.setup.modifiers]);
  p.talents = [...visit.setup.talents];
  p.talentCooldown = {};
  p.rallyPeriod = 0;
  p.position = 'F';
  p.stats = visit.stats;
  // He arrives fresh, and his line takes the faceoff, so he is seen at once.
  p.energy = 1;
  world.teams[team].line = p.line;
  refreshBoosts(world, team);
}

function leave(world: World, team: 0 | 1, visit: MascotVisit, p: Player): void {
  const saved = visit.saved;
  if (!saved) return;
  p.baseFx = saved.baseFx;
  p.talents = saved.talents;
  p.talentCooldown = saved.talentCooldown;
  p.rallyPeriod = saved.rallyPeriod;
  p.position = saved.position;
  p.stats = saved.stats;
  p.conditional = saved.conditional;
  visit.saved = null;
  refreshBoosts(world, team);
}

/**
 * Called at the opening faceoff and at the start of every later period. A mascot who played the
 * period just ended goes home; then each team that qualifies rolls for its own.
 * The rolls have their own random stream, so a game without mascots is not changed by them.
 */
export function rollMascots(world: World, opening: boolean, events: SimEvent[]): void {
  for (const team of [0, 1] as const) {
    const visit = world.teams[team].mascot;
    const p = mascotPlayer(world, team);
    if (!visit || !p) continue;
    if (visit.saved) {
      leave(world, team, visit, p);
      events.push({ type: 'mascot', team, player: p.id, arrived: false });
    }
    const behind = world.score[team === 0 ? 1 : 0] - world.score[team];
    const rolls = opening || (!world.overtime && behind >= rules.trailBy);
    if (!rolls) continue;
    if (world.rng.fork(`mascot/${world.period}/${team}`).chance(mascotChance(visit.misses))) {
      visit.misses = 0;
      visit.arrivals += 1;
      arrive(world, team, visit, p);
      events.push({ type: 'mascot', team, player: p.id, arrived: true });
    } else {
      visit.misses += 1;
    }
  }
}
