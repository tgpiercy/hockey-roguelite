import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import rules from '../src/data/offseason.json';
import { playerOf, userTeam } from '../src/core/league';
import { newFranchise, type Franchise } from '../src/core/season';
import { evaluateTrade, trade, tradeValue } from '../src/core/trades';

/**
 * A manager who does nothing but trade, taking whichever accepted trade gains him most by `worth`, until no
 * trade gains anything (or he has made `most` of them). Returns how many he made and what his roster gained.
 */
function fleece(f: Franchise, worth: (id: string) => number, most = 60): { trades: number; gained: number } {
  const mine = userTeam(f.league);
  const total = (): number => mine.roster.reduce((sum, id) => sum + worth(id), 0);
  const before = total();
  let trades = 0;
  for (; trades < most; trades++) {
    let best: { mine: string; team: string; theirs: string; gain: number } | null = null;
    for (const team of f.league.teams) {
      if (team.id === f.league.userTeamId) continue;
      for (const theirs of team.roster) {
        for (const own of mine.roster) {
          const gain = worth(theirs) - worth(own);
          if (gain <= (best?.gain ?? 1e-9)) continue;
          if (evaluateTrade(f, own, team.id, theirs).ok) best = { mine: own, team: team.id, theirs, gain };
        }
      }
    }
    if (!best) break;
    expect(trade(f, best.mine, best.team, best.theirs).ok).toBe(true);
  }
  return { trades, gained: total() - before };
}

describe('the other teams cannot be fleeced by trading', () => {
  const seeds = ['fleece-1', 'fleece-2', 'fleece-3', 'fleece-4', 'fleece-5'];

  it('by their own measure of what a player is worth, a string of trades never leaves you ahead', () => {
    for (const seed of seeds) {
      const f = newFranchise(generateLeague(seed));
      const result = fleece(f, (id) => tradeValue(playerOf(f.league, id)));
      expect(result.gained, seed).toBeLessThanOrEqual(1e-6);
    }
  });

  it('trading only for players who are better today buys a few points of overall, at the price of age and promise', () => {
    for (const seed of seeds) {
      const f = newFranchise(generateLeague(seed));
      const mine = userTeam(f.league);
      const value = (): number => mine.roster.reduce((sum, id) => sum + tradeValue(playerOf(f.league, id)), 0);
      const valueBefore = value();
      const result = fleece(f, (id) => playerOf(f.league, id).overall);
      // Before the rule that a team will not make itself worse today for nothing, this was nearly 7 a player.
      expect(result.gained / mine.roster.length, seed).toBeLessThan(3);
      // Whatever he gained today, he paid for in what the players are worth, at the rate the table sets or dearer.
      expect(valueBefore - value(), seed).toBeGreaterThanOrEqual(result.gained * rules.trade.futurePerPoint - 1e-6);
    }
  });
});
