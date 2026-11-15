import { weeklySetup, WEEKLY_REGIONS } from './charter';
import { generateLeague } from './generate';
import { awardPack } from './packs';
import { newFranchise, startSeason, type Franchise } from './season';

/**
 * The weekly run: a short season (one region and its boss) that is the same for everyone who plays it in
 * the same week. Its league, roster, map and rules all come from the week's key, so no server is needed.
 * It is a franchise of its own, saved apart, and never touches yours, except that beating the week's
 * boss earns your franchise one pack, once a week.
 */

/** The ISO week a date falls in, as "2026-W46". The date is given; nothing here reads the clock. */
export function weekKey(year: number, month: number, day: number): string {
  // Thursday of the same ISO week decides the year; weeks start on Monday.
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const first = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((date.getTime() - first) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** A fresh run for a week: its own league and roster, already on the map. */
export function newWeekly(key: string): Franchise {
  const f = newFranchise(generateLeague(`weekly/${key}`));
  startSeason(f, { ...weeklySetup(key), regions: WEEKLY_REGIONS, weekly: key });
  return f;
}

/** True for a franchise that is a weekly run. */
export function isWeekly(f: Franchise): boolean {
  return f.season.weekly !== undefined;
}

export interface WeeklyResult {
  week: string;
  /** True if the week's boss was beaten. */
  won: boolean;
  wins: number;
  losses: number;
  strikes: number;
}

/** How a weekly run stands, or stood when it ended. */
export function weeklyResult(f: Franchise): WeeklyResult {
  const { season } = f;
  return { week: season.weekly ?? '', won: season.phase === 'ended' && season.outcome === 'champion', wins: season.gamesWon, losses: season.gamesPlayed - season.gamesWon, strikes: season.strikes };
}

/** True once a weekly run is finished, one way or the other. */
export function weeklyOver(f: Franchise): boolean {
  return isWeekly(f) && f.season.phase === 'ended';
}

/** The better of two results for the same week: winning first, then fewer strikes, then fewer losses. */
export function betterResult(a: WeeklyResult | null, b: WeeklyResult): WeeklyResult {
  if (!a || a.week !== b.week) return b;
  const score = (r: WeeklyResult): number => (r.won ? 1_000_000 : 0) - r.strikes * 1000 - r.losses * 10 + r.wins;
  return score(b) > score(a) ? b : a;
}

/** Words for a result. */
export function resultLine(r: WeeklyResult): string {
  const record = `${r.wins} ${r.wins === 1 ? 'win' : 'wins'}, ${r.losses} ${r.losses === 1 ? 'loss' : 'losses'}, ${r.strikes} ${r.strikes === 1 ? 'strike' : 'strikes'}`;
  return r.won ? `Beat the boss: ${record}.` : `Fell short: ${record}.`;
}

/**
 * Hands your franchise the week's prize, a Gold pack, if the run was won and this week's has not been
 * collected yet. Returns true if it was given.
 */
export function claimWeekly(main: Franchise, result: WeeklyResult): boolean {
  if (!result.won || result.week === '' || main.weeklyClaimed === result.week) return false;
  main.weeklyClaimed = result.week;
  awardPack(main, 'gold', 'Weekly run');
  return true;
}
