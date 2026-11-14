import economy from '../data/economy.json';
import data from '../data/facilities.json';
import { scaleModifiers, type Modifier } from '../sim/modifiers';
import { book } from './ledger';
import type { MoveResult } from './roster';
import type { Franchise } from './season';

export interface FacilityInfo {
  id: string;
  name: string;
  description: string;
  /** What one level gives, as modifiers per level. */
  perLevel: Modifier[];
}

export const FACILITIES = data.facilities as FacilityInfo[];
export const MAX_FACILITY_LEVEL = data.maxLevel;

const money = (n: number): string => `$${(n / 1_000_000).toFixed(2)}M`;

/** Every facility at level 0: nothing built. */
export function newFacilities(): Record<string, number> {
  return Object.fromEntries(FACILITIES.map((facility) => [facility.id, 0]));
}

export function facilityLevel(f: Franchise, id: string): number {
  return f.facilities[id] ?? 0;
}

/** What the next level of a facility costs to build, or null at the top level. */
export function buildCost(level: number): number | null {
  return level >= data.maxLevel ? null : (level + 1) * data.buildCostPerLevel;
}

export function totalFacilityLevels(f: Franchise): number {
  return FACILITIES.reduce((sum, facility) => sum + facilityLevel(f, facility.id), 0);
}

/** Upkeep for everything built, per season. */
export function facilityUpkeep(f: Franchise): number {
  return totalFacilityLevels(f) * data.upkeepPerLevel;
}

/** The modifiers every built facility gives. */
export function facilityModifiers(f: Franchise): Modifier[] {
  return FACILITIES.flatMap((facility) => scaleModifiers(facility.perLevel, facilityLevel(f, facility.id)));
}

/** Builds the next level of a facility, paid from cash at once. Each level also adds to the franchise value. */
export function build(f: Franchise, id: string): MoveResult {
  const facility = FACILITIES.find((x) => x.id === id);
  if (!facility) return { ok: false, reason: 'There is no such facility.' };
  const cost = buildCost(facilityLevel(f, id));
  if (cost === null) return { ok: false, reason: `The ${facility.name.toLowerCase()} is already at the top level.` };
  if (f.cash < cost) return { ok: false, reason: `That costs ${money(cost)} and you have ${money(f.cash)}.` };
  book(f, 'construction', cost);
  f.facilities[id] = facilityLevel(f, id) + 1;
  f.value += economy.value.perFacilityLevel;
  return { ok: true };
}
