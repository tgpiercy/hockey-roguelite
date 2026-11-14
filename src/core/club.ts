import { modified, type Modifier } from '../sim/modifiers';
import { facilityModifiers } from './facilities';
import type { Franchise } from './season';
import { staffModifiers } from './staff';

/** Every modifier the facilities and staff give: XP, aging, fatigue, re-signing, scouting, revenue, mascot power. */
export function clubModifiers(f: Franchise): Modifier[] {
  return [...facilityModifiers(f), ...staffModifiers(f)];
}

/** A club-level number (such as ticket revenue or scouting points) after facilities and staff. */
export function clubStat(f: Franchise, stat: string, base: number): number {
  return modified(base, stat, clubModifiers(f));
}
