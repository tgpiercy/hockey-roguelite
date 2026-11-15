import data from '../data/playerKinds.json';
import talentData from '../data/talents.json';
import type { Modifier } from '../sim/modifiers';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';
import type { Grade, PlayerRecord, Position } from './player';
import type { Rng } from './rng';

/** A type of player: what he is best at, the lean it gives his ratings when he is made, and the talent that goes with it. */
export interface PlayerKind {
  id: string;
  name: string;
  /** A few letters for a crowded row. */
  tag: string;
  /** The rating that marks him out, or null for the even kind. */
  rating: string | null;
  lean: Record<string, number>;
  /** The talents a player of this kind may carry: a new player gets one of them, or none. */
  talents: string[];
  description: string;
}

export interface TalentInfo {
  id: string;
  name: string;
  description: string;
  seconds?: number;
  cooldown?: number;
  modifiers?: Modifier[];
}

const TALENTS = talentData.talents as TalentInfo[];

export function kindsFor(position: Position): PlayerKind[] {
  return (position === 'G' ? data.goalie : data.skater) as PlayerKind[];
}

/** The kind with this id among those a position can be; the even kind if there is none. */
export function kindById(position: Position, id: string): PlayerKind {
  const kinds = kindsFor(position);
  return kinds.find((k) => k.id === id) ?? (kinds.find((k) => k.rating === null) as PlayerKind);
}

/**
 * What kind of player these ratings make him: the kind whose rating stands furthest above his average,
 * if it stands out enough; otherwise the even kind. It follows the ratings, so a player you develop
 * one way becomes that kind.
 */
export function kindOf(position: Position, ratings: SkaterRatings | GoalieRatings): PlayerKind {
  const r = ratings as unknown as Record<string, number>;
  const values = Object.values(r);
  const mean = values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
  const kinds = kindsFor(position);
  let best = kinds.find((k) => k.rating === null) as PlayerKind;
  let lead = data.standout;
  for (const kind of kinds) {
    if (kind.rating === null) continue;
    const above = (r[kind.rating] ?? 0) - mean;
    if (above >= lead) {
      best = kind;
      lead = above + 1e-9;
    }
  }
  return best;
}

/** Picks the kind a new player of this position will be made as. */
export function rollKind(rng: Rng, position: Position): PlayerKind {
  const weights = data.weights[position] as Record<string, number>;
  const kinds = kindsFor(position);
  const total = kinds.reduce((sum, k) => sum + (weights[k.id] ?? 0), 0);
  let roll = rng.next() * total;
  for (const kind of kinds) {
    roll -= weights[kind.id] ?? 0;
    if (roll < 0) return kind;
  }
  return kinds[kinds.length - 1] as PlayerKind;
}

/** The chance a new player of this grade carries his kind's talent. */
export function talentChance(grade: Grade): number {
  return (data.talentChance as Record<string, number>)[grade] ?? 0;
}

export function talentInfo(id: string): TalentInfo | null {
  return TALENTS.find((t) => t.id === id) ?? null;
}

/** A player's talent, if he has one that still exists. */
export function talentOf(player: Pick<PlayerRecord, 'talent'>): TalentInfo | null {
  return player.talent ? talentInfo(player.talent) : null;
}

/** The modifiers of a talent that is simply always on (such as the cannon shot); timed ones run in the simulation. */
export function alwaysOnModifiers(talent: TalentInfo | null): Modifier[] {
  return talent && talent.seconds === undefined && talent.modifiers ? talent.modifiers : [];
}
