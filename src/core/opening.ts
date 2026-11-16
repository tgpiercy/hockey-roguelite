import type { Franchise } from './season';

/**
 * What a new club does not meet on its first day. Staff, facilities and prestige already wait for the first
 * finished season; these wait too, so that a first season is hockey, a map and a roster, and the rest arrives
 * once there is something to compare it with. Nothing is stored: each is worked out from what the club has done.
 */
export type Opening = 'setup' | 'weekly' | 'tactics';

/** When each opens, in words for the screen it is missing from. */
export const OPENS_WHEN: Record<Opening, string> = {
  setup: 'Charters and handicaps open after your first season.',
  weekly: 'The weekly run opens after your first season.',
  tactics: 'Tactics and line shifts open once you have beaten a boss.',
};

/** True once the club has got far enough for this to be shown. A weekly run is nobody's first day: everything is open in one. */
export function opened(f: Franchise, what: Opening): boolean {
  if (f.season.weekly !== undefined) return true;
  const seasons = f.books.length;
  if (what === 'tactics') return seasons > 0 || (f.bossesBeaten ?? []).length > 0;
  return seasons > 0;
}
