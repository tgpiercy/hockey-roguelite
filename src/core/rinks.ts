import data from '../data/rinks.json';
import { cloneTuning, type Tuning } from '../sim/tuning';
import type { MatchRules } from '../sim/types';

/** A rink: a name, one sentence, a few changed numbers and perhaps a changed rule. All of them are in rinks.json. */
export interface RinkInfo {
  id: string;
  name: string;
  describe: string;
  /** Numbers that replace the usual ones, by group and name as in physics.json. */
  tuning: Record<string, Record<string, number>>;
  rules: MatchRules;
}

export const RINKS = data.rinks as unknown as RinkInfo[];
export const STANDARD_RINK = data.standard;

/** The rink with this id; the standard one for anything unknown (or left out). */
export function rinkInfo(id: string | null | undefined): RinkInfo {
  return RINKS.find((r) => r.id === id) ?? (RINKS.find((r) => r.id === STANDARD_RINK) as RinkInfo);
}

/** True for any rink but the standard one. */
export function isVariant(id: string | null | undefined): boolean {
  return rinkInfo(id).id !== STANDARD_RINK;
}

/** The tuning for a game on this rink: a copy of the tuning given, with the rink's numbers in place. The standard rink gives it back untouched. */
export function rinkTuning(base: Tuning, rink: RinkInfo): Tuning {
  const groups = Object.keys(rink.tuning);
  if (groups.length === 0) return base;
  const out = cloneTuning(base) as unknown as Record<string, Record<string, number>>;
  for (const group of groups) {
    const target = out[group];
    if (!target) continue;
    for (const [name, value] of Object.entries(rink.tuning[group] ?? {})) if (name in target) target[name] = value;
  }
  return out as unknown as Tuning;
}

/** The next rink after this one, round and round: for a row that steps through them. */
export function nextRink(id: string | null | undefined): RinkInfo {
  const at = RINKS.findIndex((r) => r.id === rinkInfo(id).id);
  return RINKS[(at + 1) % RINKS.length] as RinkInfo;
}

/** What a game on a variant rink adds to its pay, in Pucks. */
export const RINK_BONUS = data.seasonBonus;
/** The share of ordinary game stops that are on a variant rink. */
export const RINK_CHANCE = data.seasonChance;
export const SHOOTOUT = data.shootout;
