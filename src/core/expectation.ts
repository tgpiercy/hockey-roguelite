import data from '../data/economy.json';
import type { Franchise } from './season';

/**
 * What the town expects. Before each season the club's main sponsor names a fair target, worked out from
 * how last season went. Meeting it adds to the sponsorship paid at the season's end; missing it takes a
 * little off, except after a season that ended early on strikes. Nobody is ever sacked: the only thing at
 * stake is the cheque, and so the club's books.
 */
export interface Expectation {
  /** "wins": win this many games. "playoffs": reach the playoffs. */
  kind: 'wins' | 'playoffs';
  wins: number;
  /** In words, as the sponsor puts it. */
  text: string;
}

const rules = data.expectation;

/** The target for the season about to start, from the last one in the club's history. */
export function nextExpectation(f: Franchise): Expectation {
  const last = (f.history ?? [])[(f.history ?? []).length - 1];
  // A club that reached the playoffs is expected back there; any other, to win a few more than it nearly did.
  if (last && (last.outcome === 'champion' || last.outcome === 'eliminated')) {
    return { kind: 'playoffs', wins: 0, text: 'Reach the playoffs again.' };
  }
  const wins = Math.max(rules.minWins, Math.min(rules.maxWins, Math.round((last?.wins ?? 0) * rules.shareOfLastWins) + 1));
  return { kind: 'wins', wins, text: `Win ${wins} games.` };
}

/** Whether the season's target has been met, as things stand. A season with no target set (an old save) has met it. */
export function expectationMet(f: Franchise): boolean {
  const target = f.season.expectation;
  if (!target) return true;
  if (target.kind === 'playoffs') return f.season.playoffs !== null && f.season.playoffs !== undefined;
  return f.season.gamesWon >= target.wins;
}

/** What meeting or missing the target does to the sponsorship, as a multiplier. */
export function expectationFactor(f: Franchise): number {
  if (!f.season.expectation) return 1;
  if (expectationMet(f)) return 1 + rules.bonus;
  // A season that ended early, on strikes, has cost the club enough: the sponsor does not dock it as well.
  return 1 - (f.season.outcome === 'struckOut' ? rules.struckOutPenalty : rules.penalty);
}

/** Where the season stands against the target, in a few words. */
export function expectationLine(f: Franchise): string {
  const target = f.season.expectation;
  if (!target) return '';
  const met = expectationMet(f);
  const progress = target.kind === 'wins' ? ` (${Math.min(f.season.gamesWon, target.wins)} of ${target.wins})` : '';
  return `The sponsor expects: ${target.text.toLowerCase().replace(/\.$/, '')}${progress}. ${met ? `Met: ${Math.round(rules.bonus * 100)}% more sponsorship.` : `Not yet: ${Math.round(rules.penalty * 100)}% less if missed.`}`;
}

/** The same in a few words, for a crowded screen. */
export function expectationShort(f: Franchise): string {
  const target = f.season.expectation;
  if (!target) return '';
  const progress = target.kind === 'wins' ? ` (${Math.min(f.season.gamesWon, target.wins)} of ${target.wins})` : '';
  return `Sponsor: ${target.text.toLowerCase().replace(/\.$/, '')}${progress}${expectationMet(f) ? ', met' : ''}`;
}

export const EXPECTATION_RULES = rules;
