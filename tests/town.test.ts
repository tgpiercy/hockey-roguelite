import { describe, expect, it } from 'vitest';
import { clubRecords } from '../src/core/chronicle';
import { seasonEndBills } from '../src/core/economy';
import { EXPECTATION_RULES, expectationFactor, expectationLine, expectationMet, expectationShort, nextExpectation } from '../src/core/expectation';
import { generateLeague } from '../src/core/generate';
import { finishSeason } from '../src/core/offseason';
import { leagueName, prestige } from '../src/core/prestige';
import { cupHeld, isCupTie, newFranchise, recordGame, seasonRegions, startSeason, type Franchise } from '../src/core/season';
import { generateMap } from '../src/core/seasonMap';
import { newWeekly, weekKey } from '../src/core/weekly';
import prestigeRules from '../src/data/prestige.json';
import seasonRules from '../src/data/season.json';
import type { GameResult, PlayerLine } from '../src/sim/match';
import { cloneTuning } from '../src/sim/tuning';
import { createGame, step } from '../src/sim/world';
import { NO_INPUT } from '../src/sim/types';
import { uniformTeam } from './harness/harness';

const started = (seed = 'town'): Franchise => {
  const f = newFranchise(generateLeague(seed));
  startSeason(f);
  return f;
};
const line = (i: number): PlayerLine => ({ id: i, team: 0, role: i === 6 ? 'goalie' : 'skater', line: i >= 3 && i < 6 ? 1 : 0, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 });
const result = (won: boolean): GameResult => ({ score: won ? [2, 1] : [1, 2], winner: won ? 0 : 1, finished: true, overtime: false, periods: 3, players: [0, 1, 2, 3, 4, 5, 6].map(line), powerupsUsed: [] });
/** Puts the franchise at a game stop of a region: its cup tie, or an ordinary one. */
const at = (f: Franchise, region: number, cup: boolean): void => {
  const stop = Object.values(f.season.map!.stops).find((s) => s.region === region && s.kind === 'game' && !s.elite && (s.cup === true) === cup)!;
  f.season.current = stop.id;
  f.season.stage = 'arrived';
};
const past = (f: Franchise, over: { outcome: 'champion' | 'eliminated' | 'struckOut' | 'abandoned'; wins: number }): void => {
  f.history = [{ season: 1, outcome: over.outcome, wins: over.wins, losses: 3, place: 4, points: 10, topScorer: null, awards: [] }];
};

describe('what the town expects', () => {
  it('a new club is asked for a few wins, and never more than the season can give', () => {
    const f = newFranchise(generateLeague('town'));
    const target = nextExpectation(f);
    expect(target.kind).toBe('wins');
    expect(target.wins).toBe(EXPECTATION_RULES.minWins);
    for (const wins of [0, 2, 5, 9, 14, 30]) {
      past(f, { outcome: 'struckOut', wins });
      const next = nextExpectation(f);
      expect(next.wins).toBeGreaterThanOrEqual(EXPECTATION_RULES.minWins);
      expect(next.wins).toBeLessThanOrEqual(EXPECTATION_RULES.maxWins);
      expect(next.text).toContain(String(next.wins));
    }
  });

  it('a club that reached the playoffs is expected back there', () => {
    const f = newFranchise(generateLeague('town'));
    past(f, { outcome: 'eliminated', wins: 9 });
    expect(nextExpectation(f).kind).toBe('playoffs');
    past(f, { outcome: 'champion', wins: 12 });
    expect(nextExpectation(f).kind).toBe('playoffs');
  });

  it('the target is set when the season starts, and met by wins', () => {
    const f = started();
    const target = f.season.expectation!;
    expect(target.kind).toBe('wins');
    expect(expectationMet(f)).toBe(false);
    expect(expectationFactor(f)).toBeCloseTo(1 - EXPECTATION_RULES.penalty);
    expect(expectationLine(f)).toContain(`0 of ${target.wins}`);
    expect(expectationShort(f)).toContain(`0 of ${target.wins}`);
    expect(expectationShort(f)).not.toContain('met');
    f.season.gamesWon = target.wins;
    expect(expectationMet(f)).toBe(true);
    expect(expectationFactor(f)).toBeCloseTo(1 + EXPECTATION_RULES.bonus);
    expect(expectationShort(f)).toContain('met');
  });

  it('the sponsorship cheque is bigger for a target met than for one missed, by the rule', () => {
    const f = started();
    const missed = seasonEndBills(f).sponsorship;
    f.season.gamesWon = f.season.expectation!.wins;
    const met = seasonEndBills(f).sponsorship;
    expect(met).toBeGreaterThan(missed);
    expect(met / missed).toBeCloseTo((1 + EXPECTATION_RULES.bonus) / (1 - EXPECTATION_RULES.penalty), 2);
    // Only the sponsorship moves: nobody is sacked and no bill changes.
    f.season.gamesWon = 0;
    const a = seasonEndBills(f);
    f.season.gamesWon = 99;
    const b = seasonEndBills(f);
    expect({ ...b, sponsorship: 0 }).toEqual({ ...a, sponsorship: 0 });
  });

  it('a playoffs target is met by reaching them; a season with no target pays as before', () => {
    const f = started();
    f.season.expectation = { kind: 'playoffs', wins: 0, text: 'Reach the playoffs again.' };
    expect(expectationMet(f)).toBe(false);
    f.season.playoffs = { round: 0, wins: 0, losses: 0, opponentId: 'x' };
    expect(expectationMet(f)).toBe(true);
    delete f.season.expectation;
    expect(expectationFactor(f)).toBe(1);
    expect(expectationLine(f)).toBe('');
  });

  it('a weekly run has no target and no cup', () => {
    const weekly = newWeekly(weekKey(2026, 11, 15));
    expect(weekly.season.expectation).toBeUndefined();
    expect(weekly.season.cup).toBeUndefined();
  });
});

describe('named leagues', () => {
  it('every prestige level has a league of its own', () => {
    expect(prestigeRules.leagues.length).toBe(prestigeRules.maxLevel + 1);
    expect(new Set(prestigeRules.leagues).size).toBe(prestigeRules.leagues.length);
    for (let level = 0; level <= prestigeRules.maxLevel; level++) expect(leagueName(level)).toBe(prestigeRules.leagues[level]);
    expect(leagueName(99)).toBe(prestigeRules.leagues[prestigeRules.maxLevel]);
  });

  it('going up is written into the club history', () => {
    const f = started();
    f.prestige.championAt = true;
    f.season.phase = 'offseason';
    const before = f.prestige.level;
    const moved = prestige(f);
    if (!moved.ok) {
      // Whatever else prestige asks for, a refusal writes nothing.
      expect(f.promotions ?? []).toEqual([]);
      return;
    }
    expect(f.promotions).toEqual([{ season: f.league.season, league: leagueName(before + 1) }]);
  });
});

describe('the cup', () => {
  it('each region of a map has exactly one cup tie, an ordinary game, and the same map every time', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const map = generateMap(seed, ['t1', 't2', 't3', 't4', 't5']);
      for (let region = 0; region < seasonRules.regions; region++) {
        const ties = Object.values(map.stops).filter((s) => s.region === region && s.cup);
        expect(ties.length).toBe(1);
        expect(ties[0]!.kind).toBe('game');
        expect(ties[0]!.elite ?? false).toBe(false);
      }
      expect(generateMap(seed, ['t1', 't2', 't3', 't4', 't5'])).toEqual(map);
    }
  });

  it('a tie won counts and pays a little more; winning one in every region is the cup', () => {
    const f = started();
    expect(f.season.cup).toEqual({ won: 0, alive: true });
    at(f, 0, false);
    const plain = f.season.currency;
    recordGame(f, result(true));
    const ordinary = f.season.currency - plain;
    expect(f.season.cup!.won).toBe(0);
    for (let region = 0; region < seasonRegions(f); region++) {
      at(f, region, true);
      expect(isCupTie(f, f.season.map!.stops[f.season.current!]!)).toBe(true);
      const before = f.season.currency;
      const out = recordGame(f, result(true));
      expect(out.ok).toBe(true);
      expect(f.season.cup!.won).toBe(region + 1);
      if (region === 0) expect(f.season.currency - before).toBeGreaterThan(ordinary);
    }
    expect(cupHeld(f)).toBe(true);
  });

  it('a tie lost is the cup over, at no cost beyond the ordinary strike', () => {
    const plain = started('cup-loss');
    at(plain, 0, false);
    recordGame(plain, result(false));
    const f = started('cup-loss');
    at(f, 0, true);
    const out = recordGame(f, result(false));
    expect(out.ok && out.message).toContain('out of the cup');
    expect(f.season.cup!.alive).toBe(false);
    expect(f.season.strikes).toBe(plain.season.strikes);
    expect(f.season.currency).toBe(plain.season.currency);
    // Later ties are ordinary games.
    at(f, 1, true);
    expect(isCupTie(f, f.season.map!.stops[f.season.current!]!)).toBe(false);
    recordGame(f, result(true));
    expect(f.season.cup!.won).toBe(0);
    expect(cupHeld(f)).toBe(false);
  });

  it('a cup won, and a season played with a second player, go into the history and the records', () => {
    const f = started('cup-record');
    f.season.cup = { won: seasonRegions(f), alive: true };
    f.season.coop = true;
    f.season.phase = 'ended';
    f.season.outcome = 'champion';
    finishSeason(f);
    const last = f.history![f.history!.length - 1]!;
    expect(last.cup).toBe(true);
    expect(last.coop).toBe(true);
    const labels = clubRecords(f).map((x) => x.label);
    expect(labels).toContain('Cups');
    expect(labels).toContain('Titles won with a second player');
  });

  it('a season without the cup records none', () => {
    const f = started('cup-none');
    f.season.cup = { won: seasonRegions(f) - 1, alive: true };
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    finishSeason(f);
    const last = f.history![f.history!.length - 1]!;
    expect(last.cup).toBeUndefined();
    expect(last.coop).toBeUndefined();
    expect(clubRecords(f).map((x) => x.label)).not.toContain('Cups');
  });
});

describe('the practice rink', () => {
  it('never ends, has no clock running out, and settles nothing', () => {
    const t = cloneTuning();
    const world = createGame(t, 'practice', { human: false, teams: [uniformTeam(70), uniformTeam(60)], rules: { practice: true } });
    const steps = Math.round((t.period.seconds * (t.period.count + 1)) / 3 / (1 / 60));
    for (let i = 0; i < steps; i++) {
      step(world, NO_INPUT, t);
      if (world.phase === 'final') break;
    }
    expect(world.phase).not.toBe('final');
    expect(world.match.practice).toBe(true);
  });

  it('an ordinary game with the same teams does end', () => {
    const t = cloneTuning();
    t.period.seconds = 20;
    const world = createGame(t, 'practice', { human: false, teams: [uniformTeam(70), uniformTeam(60)], rules: { firstTo: 1 } });
    for (let i = 0; i < 60 * 60 * 20 && world.phase !== 'final'; i++) step(world, NO_INPUT, t);
    expect(world.phase).toBe('final');
  });
});
