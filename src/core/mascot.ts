import data from '../data/mascot.json';
import talentData from '../data/talents.json';
import type { Modifier } from '../sim/modifiers';
import type { SkaterRatings } from '../sim/ratings';
import { teamStrength } from './bosses';
import { clubStat } from './club';
import { book } from './ledger';
import type { League } from './league';
import type { DressedTeam } from './matchup';
import { gradeOf, type PlayerRecord } from './player';
import { createRng } from './rng';
import type { MoveResult } from './roster';
import type { Franchise } from './season';

/** The id a mascot has in a dressed team. He is not a league player. */
export const MASCOT_ID = 'mascot';

/** Your mascot, as saved. */
export interface MascotState {
  name: string;
  /** Costume level, bought with cash. Each level adds mascot power. */
  costume: number;
  /** Every talent in the order he learns them; how many he knows depends on his power. */
  talents: string[];
}

/** A mascot as he would take the ice: yours, an AI team's or a boss's. */
export interface MascotSpec {
  name: string;
  power: number;
  talents: string[];
}

export interface TalentInfo {
  id: string;
  name: string;
  description: string;
  seconds?: number;
  cooldown?: number;
  modifiers?: Modifier[];
}

export const TALENTS = talentData.talents as TalentInfo[];

export function talentInfo(id: string): TalentInfo {
  return (TALENTS.find((t) => t.id === id) ?? TALENTS[0]) as TalentInfo;
}

const money = (n: number): string => `$${(n / 1_000_000).toFixed(2)}M`;

/** A name and a learning order from a seed: the same seed always gives the same mascot. */
function invent(seed: string): { name: string; talents: string[] } {
  const rng = createRng(seed);
  return { name: rng.pick(data.names), talents: rng.shuffle(TALENTS.map((t) => t.id)) };
}

export function newMascot(seed: string): MascotState {
  return { ...invent(`${seed}/mascot`), costume: 0 };
}

/** Mascot power: costume levels, plus the mascot den and the promoter. */
export function mascotPower(f: Franchise): number {
  return clubStat(f, 'mascotPower', f.mascot.costume * data.costume.powerPerLevel);
}

/** The chance he drops in for a game: 5% with no power, rising to a cap of 35%. */
export function dropInChance(power: number): number {
  return Math.min(data.maxChance, data.baseChance + data.chancePerPower * Math.max(0, power));
}

/** How many talents a mascot of this power knows: one to start, another at each threshold. */
export function talentCount(power: number): number {
  return data.talentUnlockPower.filter((needed) => power >= needed).length;
}

/** The power at which the next talent is learned, or null if he knows them all. */
export function nextTalentAt(power: number): number | null {
  return data.talentUnlockPower.find((needed) => power < needed) ?? null;
}

export function mascotRating(power: number): number {
  return Math.min(data.maxRating, Math.round(data.baseRating + data.ratingPerPower * Math.max(0, power)));
}

/** Your mascot as he stands now. */
export function userMascot(f: Franchise): MascotSpec {
  const power = mascotPower(f);
  return { name: f.mascot.name, power, talents: f.mascot.talents.slice(0, talentCount(power)) };
}

/** An AI team's mascot: stronger teams have stronger ones. */
export function aiMascot(league: League, teamId: string): MascotSpec {
  const power = Math.max(0, (teamStrength(league, teamId) - data.ai.strengthFrom) * data.ai.powerPerStrengthPoint);
  const made = invent(`${league.seed}/mascot/${teamId}`);
  return { name: made.name, power, talents: made.talents.slice(0, talentCount(power)) };
}

/** A boss's mascot: stronger in each region. */
export function bossMascot(seed: string, bossId: string, region: number): MascotSpec {
  const power = data.ai.bossPower[Math.min(region, data.ai.bossPower.length - 1)] as number;
  const made = invent(`${seed}/mascot/boss/${bossId}`);
  return { name: made.name, power, talents: made.talents.slice(0, talentCount(power)) };
}

/** What the next costume level costs, or null at the top level. */
export function costumeCost(f: Franchise): number | null {
  return f.mascot.costume >= data.costume.maxLevel ? null : (f.mascot.costume + 1) * data.costume.costPerLevel;
}

/** Buys the next costume level from cash. */
export function upgradeCostume(f: Franchise): MoveResult {
  const cost = costumeCost(f);
  if (cost === null) return { ok: false, reason: 'His costume is already at the top level.' };
  if (f.cash < cost) return { ok: false, reason: `That costs ${money(cost)} and you have ${money(f.cash)}.` };
  book(f, 'construction', cost);
  f.mascot.costume += 1;
  return { ok: true };
}

/** What the mascot costs to keep, per season. */
export function mascotSalary(): number {
  return data.salary;
}

/**
 * Rolls whether a mascot drops in for a game. Returns which of the six dressed skaters sits (0 to 5),
 * or null if he stays away. The label fixes the roll, so the same game always gets the same answer.
 */
export function rollDropIn(label: string, power: number): number | null {
  const rng = createRng(label);
  if (!rng.chance(dropInChance(power))) return null;
  return rng.int(0, 5);
}

/** The mascot as a player for the summary screen. He has no contract, no age and earns no XP. */
function mascotRecord(spec: MascotSpec): PlayerRecord {
  const rating = mascotRating(spec.power);
  const ratings: SkaterRatings = { shooting: rating, passing: rating, speed: rating, checking: rating, puckControl: rating, stamina: rating };
  return {
    id: MASCOT_ID,
    name: spec.name,
    position: 'F',
    age: 0,
    ratings,
    potential: rating,
    overall: rating,
    grade: gradeOf(rating),
    capHit: 0,
    contractYears: 0,
    xp: 0,
    level: 1,
  };
}

/** A dressed team with the mascot in one skater's place for this game. The team given is left alone. */
export function withMascot(team: DressedTeam, spec: MascotSpec, slot: number): DressedTeam {
  const record = mascotRecord(spec);
  const count = team.setup.skaters.length;
  const skaterModifiers = Array.from({ length: count }, (_, i) => team.setup.skaterModifiers?.[i] ?? []);
  const skaterTalents = Array.from({ length: count }, (_, i) => team.setup.skaterTalents?.[i] ?? []);
  // A talent that is simply always on (such as the cannon shot) goes in as his own modifiers.
  skaterModifiers[slot] = spec.talents.flatMap((id) => {
    const talent = talentInfo(id);
    return talent.seconds === undefined && talent.modifiers ? talent.modifiers : [];
  });
  skaterTalents[slot] = [...spec.talents];
  return {
    ...team,
    players: team.players.map((p, i) => (i === slot ? record : p)),
    setup: {
      ...team.setup,
      skaters: team.setup.skaters.map((r, i) => (i === slot ? (record.ratings as SkaterRatings) : r)),
      positions: Array.from({ length: count }, (_, i) => (i === slot ? 'F' : (team.setup.positions?.[i] ?? 'F'))),
      skaterModifiers,
      skaterTalents,
    },
  };
}
