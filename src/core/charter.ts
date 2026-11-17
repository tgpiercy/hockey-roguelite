import data from '../data/charters.json';
import type { Modifier } from '../sim/modifiers';
import type { MatchRules } from '../sim/types';
import { createRng } from './rng';

/**
 * How a season is set up before it starts.
 *
 * A charter is a rule-changing way to play the season: a gain paired with a cost.
 * A handicap ("vow") makes the season harder, in ranks; every rank is a point, and points pay:
 * a little more Pucks from every game and better luck in every pack, for that season.
 *
 * Both are lists of modifiers. Stats the ice reads go to your team like an artifact's; the rest
 * ("opponentRating", "maxStrikes", "noSimulate" and so on) are read by the season rules.
 */

export interface CharterInfo {
  id: string;
  name: string;
  describe: string;
  modifiers?: Modifier[];
  /** Modifiers every opponent gets. */
  opponent?: Modifier[];
  /** Rules changed in every game. */
  rules?: MatchRules;
  /** How many regions the season has. Left out, the usual number. */
  regions?: number;
  /** Written per goal as a rate (0.01 is 1% more): what each goal by one of your defencemen adds, up to the cap. */
  perDefenceGoal?: Modifier[];
  defenceGoalCap?: number;
  /** True for a charter that a feat must open first (achievements.ts). */
  locked?: boolean;
}

export interface VowInfo {
  id: string;
  name: string;
  describe: string;
  /** How many ranks it has. Each is one point. */
  ranks: number;
  /** What one rank does. */
  modifiers: Modifier[];
}

/** What a season was set up with. */
export interface SeasonSetup {
  charter?: string;
  /** Ranks taken, by vow id. */
  vows?: Record<string, number>;
  /** The powerup kept all season on the first button: one of the three offered (season.signatureOffer). */
  signature?: string;
  /** The town's help, taken when it was on offer (season.rallyOffered): see `rally` in season.json. */
  rally?: boolean;
}

export const CHARTERS = data.charters as unknown as CharterInfo[];
export const VOWS = data.vows as unknown as VowInfo[];
export const STANDARD_CHARTER = data.standard;

export function charterInfo(id: string | null | undefined): CharterInfo {
  return CHARTERS.find((c) => c.id === id) ?? (CHARTERS.find((c) => c.id === STANDARD_CHARTER) as CharterInfo);
}

export function vowInfo(id: string): VowInfo | null {
  return VOWS.find((v) => v.id === id) ?? null;
}

/** The ranks taken, with anything unknown dropped and each held to what its vow allows. */
export function cleanVows(vows: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, rank] of Object.entries(vows ?? {})) {
    const info = vowInfo(id);
    const taken = info ? Math.max(0, Math.min(info.ranks, Math.floor(rank))) : 0;
    if (taken > 0) out[id] = taken;
  }
  return out;
}

/** Handicap points: one for every rank taken. */
export function vowPoints(vows: Record<string, number> | undefined): number {
  return Object.values(cleanVows(vows)).reduce((sum, rank) => sum + rank, 0);
}

/** The next rank of a vow, round and round: for a row that steps through them. */
export function nextRank(vows: Record<string, number> | undefined, id: string): Record<string, number> {
  const info = vowInfo(id);
  if (!info) return cleanVows(vows);
  const now = cleanVows(vows)[id] ?? 0;
  return cleanVows({ ...(vows ?? {}), [id]: now >= info.ranks ? 0 : now + 1 });
}

/** How much more every game pays in Pucks, as a multiplier, for these handicaps. */
export function vowPay(vows: Record<string, number> | undefined): number {
  return 1 + data.reward.currencyPerPoint * vowPoints(vows);
}

/** How much likelier everything above Common is in a pack, as a multiplier, for these handicaps. */
export function vowPackLuck(vows: Record<string, number> | undefined): number {
  return 1 + data.reward.packLuckPerPoint * vowPoints(vows);
}

/**
 * Every modifier a season's set-up gives your side: the charter's, each vow's (once per rank), what the
 * handicaps pay, and what your defencemen's goals have earned under a charter that counts them.
 */
export function setupModifiers(setup: SeasonSetup, defenceGoals = 0): Modifier[] {
  const charter = charterInfo(setup.charter);
  const out: Modifier[] = [...(charter.modifiers ?? [])];
  const counted = Math.min(charter.defenceGoalCap ?? 0, Math.max(0, defenceGoals));
  if (counted > 0) for (const m of charter.perDefenceGoal ?? []) out.push({ stat: m.stat, op: m.op, value: m.op === 'add' ? m.value * counted : 1 + m.value * counted });
  const vows = cleanVows(setup.vows);
  for (const [id, rank] of Object.entries(vows)) {
    for (const m of vowInfo(id)?.modifiers ?? []) out.push({ stat: m.stat, op: m.op, value: m.op === 'add' ? m.value * rank : m.value ** rank });
  }
  const pay = vowPay(vows);
  if (pay !== 1) out.push({ stat: 'currencyGain', op: 'mul', value: pay });
  return out;
}

/** What the charter gives every opponent. */
export function opponentModifiers(setup: SeasonSetup): Modifier[] {
  return [...(charterInfo(setup.charter).opponent ?? [])];
}

/** One line saying what a season was set up with, or nothing for a standard season with no handicaps. */
export function setupLine(setup: SeasonSetup): string {
  const charter = charterInfo(setup.charter);
  const points = vowPoints(setup.vows);
  const parts = [charter.id === STANDARD_CHARTER ? '' : charter.name, points > 0 ? `${points} handicap ${points === 1 ? 'point' : 'points'}` : ''].filter((x) => x !== '');
  return parts.join(' · ');
}

/** The set-up drawn for a week's run from its key: one charter and a couple of handicaps, the same for everyone. */
export function weeklySetup(key: string): Required<Pick<SeasonSetup, 'charter' | 'vows'>> {
  const rng = createRng(`weekly/${key}/setup`);
  // The short season is left out: the weekly run is short already.
  // (Nor are the ones a feat opens: the weekly run is the same for everyone.)
  const charter = rng.pick(CHARTERS.filter((c) => c.id !== STANDARD_CHARTER && c.regions === undefined && !c.locked)).id;
  const vows: Record<string, number> = {};
  for (const vow of rng.shuffle([...VOWS]).slice(0, data.weekly.vows)) vows[vow.id] = 1;
  return { charter, vows };
}

export const WEEKLY_REGIONS = data.weekly.regions;
