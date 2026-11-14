import { describe, expect, it } from 'vitest';
import { sortPlayers, wouldReplace } from '../src/core/compare';
import { generateLeague } from '../src/core/generate';
import { rosterOf, skatersOn, userTeam } from '../src/core/league';
import { newFranchise, startSeason } from '../src/core/season';
import { seasonSummary } from '../src/core/seasonSummary';
import rules from '../src/data/season.json';
import { barShares, linePath, linePoints } from '../src/ui/chartMath';

describe('chart maths', () => {
  it('bars are a share of the longest one', () => {
    expect(barShares([10, 5, 20])).toEqual([0.5, 0.25, 1]);
    expect(barShares([7])).toEqual([1]);
  });

  it('zero, negative and all-empty values give empty bars, never a broken one', () => {
    expect(barShares([0, 0])).toEqual([0, 0]);
    expect(barShares([-5, 10])).toEqual([0, 1]);
    expect(barShares([])).toEqual([]);
    expect(barShares([Number.NaN, 4])).toEqual([0, 1]);
  });

  it('a line runs left to right with the highest value at the top and the lowest at the bottom', () => {
    const points = linePoints([10, 30, 20], 100, 50, 5);
    expect(points.map((p) => p.x)).toEqual([0, 50, 100]);
    expect(points[0]!.y).toBe(45);
    expect(points[1]!.y).toBe(5);
    expect(points[2]!.y).toBe(25);
  });

  it('every point stays inside the box', () => {
    for (const p of linePoints([-40, 0, 1000, 3, 3, -2], 200, 60)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(60);
    }
  });

  it('a flat series runs through the middle, one value sits in the centre, and none draws nothing', () => {
    expect(linePoints([5, 5, 5], 90, 40).every((p) => p.y === 20)).toBe(true);
    expect(linePoints([42], 90, 40)).toEqual([{ x: 45, y: 20 }]);
    expect(linePoints([], 90, 40)).toEqual([]);
    expect(linePath([])).toBe('');
  });

  it('the path joins the points in order', () => {
    expect(
      linePath([
        { x: 0, y: 10 },
        { x: 50, y: 0 },
      ]),
    ).toBe('M0.0 10.0 L50.0 0.0');
  });
});

describe('line chart on a shared scale', () => {
  it('puts a small series low and a large one high', () => {
    const range = { low: 0, high: 100 };
    const small = linePoints([10, 20], 200, 100, 0, range);
    const large = linePoints([80, 100], 200, 100, 0, range);
    expect(small[1]?.y).toBeCloseTo(80);
    expect(large[1]?.y).toBeCloseTo(0);
    expect(small[0]?.y).toBeGreaterThan(large[0]?.y ?? 0);
  });
});

describe('sorting and comparing players', () => {
  const league = generateLeague('compare');
  const pool = league.freeAgents.map((id) => league.players[id]!);

  it('sorts best first, cheapest first or youngest first, and leaves the list given alone', () => {
    const before = pool.map((p) => p.id);
    const best = sortPlayers(pool, 'overall');
    const cheap = sortPlayers(pool, 'cost');
    const young = sortPlayers(pool, 'age');
    for (let i = 1; i < best.length; i++) expect(best[i]!.overall).toBeLessThanOrEqual(best[i - 1]!.overall);
    for (let i = 1; i < cheap.length; i++) expect(cheap[i]!.capHit).toBeGreaterThanOrEqual(cheap[i - 1]!.capHit);
    for (let i = 1; i < young.length; i++) expect(young[i]!.age).toBeGreaterThanOrEqual(young[i - 1]!.age);
    expect(pool.map((p) => p.id)).toEqual(before);
    expect(best).toHaveLength(pool.length);
  });

  it('filters by position', () => {
    for (const position of ['F', 'D', 'G'] as const) {
      const only = sortPlayers(pool, 'overall', position);
      expect(only.length).toBeGreaterThan(0);
      expect(only.every((p) => p.position === position)).toBe(true);
    }
    expect(sortPlayers(pool, 'overall', 'all')).toHaveLength(pool.length);
  });

  it('a newcomer is compared with the weakest player of his own position', () => {
    const team = userTeam(league);
    for (const position of ['F', 'D'] as const) {
      const newcomer = pool.find((p) => p.position === position)!;
      const out = wouldReplace(league, team, newcomer)!;
      const same = skatersOn(league, team).filter((p) => p.position === position);
      expect(out.position).toBe(position);
      expect(out.overall).toBe(Math.min(...same.map((p) => p.overall)));
    }
  });

  it('a goalie is only ever compared with the goalie, and a skater never is', () => {
    const team = userTeam(league);
    const keeper = pool.find((p) => p.position === 'G')!;
    expect(wouldReplace(league, team, keeper)!.position).toBe('G');
    const skater = pool.find((p) => p.position === 'F')!;
    expect(wouldReplace(league, team, skater)!.position).not.toBe('G');
  });

  it('with nobody of his position, a skater is compared with the weakest skater; with no goalie, there is no comparison', () => {
    const empty = generateLeague('compare-empty');
    const team = userTeam(empty);
    const all = rosterOf(empty, team);
    team.roster = all.filter((p) => p.position === 'F').map((p) => p.id);
    const defender = Object.values(empty.players).find((p) => p.position === 'D')!;
    expect(wouldReplace(empty, team, defender)!.position).toBe('F');
    const keeper = Object.values(empty.players).find((p) => p.position === 'G')!;
    expect(wouldReplace(empty, team, keeper)).toBe(null);
  });
});

describe('summing up a season', () => {
  const ended = (outcome: 'champion' | 'eliminated' | 'struckOut') => {
    const f = newFranchise(generateLeague('summary'));
    startSeason(f);
    f.season.phase = 'ended';
    f.season.outcome = outcome;
    f.season.gamesPlayed = 11;
    f.season.gamesWon = 7;
    return f;
  };

  it('says how far the season got', () => {
    expect(seasonSummary(ended('champion')).finish).toBe('Champions');
    expect(seasonSummary(ended('champion')).champion).toBe(true);
    const semi = ended('eliminated');
    semi.season.playoffs = { round: 0, wins: 0, losses: rules.seriesWins, opponentId: 'x' };
    expect(seasonSummary(semi).finish).toBe('Lost in the semi-final');
    const final = ended('eliminated');
    final.season.playoffs = { round: rules.playoffRounds - 1, wins: 1, losses: rules.seriesWins, opponentId: 'x' };
    expect(seasonSummary(final).finish).toBe('Lost in the final');
    const early = ended('struckOut');
    expect(seasonSummary(early).finish).toBe('Out in region 1');
    const later = ended('struckOut');
    later.season.last = Object.values(later.season.map!.stops).find((s) => s.region === 1)!.id;
    expect(seasonSummary(later).finish).toBe('Out in region 2');
  });

  it('gives the record, strikes, shutouts and packs waiting', () => {
    const f = ended('struckOut');
    f.season.strikes = 3;
    f.season.shutouts = 2;
    f.packs.push({ id: 'p1', type: 'bronze', reason: 'test', items: [] });
    expect(seasonSummary(f)).toMatchObject({ wins: 7, losses: 4, strikes: 3, shutouts: 2, packs: 1, champion: false });
  });

  it('names the top scorer, and nobody if nobody scored', () => {
    const f = ended('eliminated');
    expect(seasonSummary(f).topScorer).toBe(null);
    const roster = userTeam(f.league).roster;
    f.season.playerGoals = { [roster[0]!]: 4, [roster[1]!]: 9, [roster[2]!]: 0, gone: 30 };
    const top = seasonSummary(f).topScorer!;
    expect(top.player.id).toBe(roster[1]);
    expect(top.goals).toBe(9);
  });

  it('lists the milestones reached, by name', () => {
    const f = ended('champion');
    f.season.milestones = ['wins-4', 'hat-trick', 'champion'];
    expect(seasonSummary(f).milestones).toEqual(['4 wins', 'Won the championship', 'A hat trick']);
    expect(seasonSummary(ended('struckOut')).milestones).toEqual([]);
  });
});
