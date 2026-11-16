import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { opened, OPENS_WHEN, type Opening } from '../src/core/opening';
import { newFranchise, startSeason } from '../src/core/season';
import { newWeekly, weekKey } from '../src/core/weekly';

const ALL: Opening[] = ['setup', 'weekly', 'tactics'];

describe('what a new club does not meet on its first day', () => {
  it('a new club has none of it, in or out of its first season, and each says when it opens', () => {
    const f = newFranchise(generateLeague('opening'));
    for (const what of ALL) {
      expect(opened(f, what)).toBe(false);
      expect(OPENS_WHEN[what].length).toBeGreaterThan(0);
    }
    startSeason(f);
    for (const what of ALL) expect(opened(f, what)).toBe(false);
  });

  it('beating a boss opens tactics and nothing else', () => {
    const f = newFranchise(generateLeague('opening'));
    startSeason(f);
    f.bossesBeaten = ['bruisers'];
    expect(opened(f, 'tactics')).toBe(true);
    expect(opened(f, 'setup')).toBe(false);
    expect(opened(f, 'weekly')).toBe(false);
  });

  it('a finished season opens everything, for good', () => {
    const f = newFranchise(generateLeague('opening'));
    f.books.push({ season: 1, ledger: { ...f.ledger }, cashEnd: f.cash, valueEnd: f.value, wins: 3, champion: false });
    for (const what of ALL) expect(opened(f, what)).toBe(true);
  });

  it('a weekly run is nobody\'s first day', () => {
    const w = newWeekly(weekKey(2026, 11, 16));
    for (const what of ALL) expect(opened(w, what)).toBe(true);
  });
});
