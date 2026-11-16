import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { userTeam } from '../src/core/league';
import { fitList, fitWords, seasonRecap } from '../src/core/recap';
import { availableStops, chooseEvent, currentStop, leaveShop, newFranchise, pickArtifact, pickRinger, recordGame, seasonRegions, startSeason, train, travel, type Franchise } from '../src/core/season';
import type { GameResult, PlayerLine } from '../src/sim/match';

const line = (i: number): PlayerLine => ({ id: i, team: 0, role: i === 6 ? 'goalie' : 'skater', line: i >= 3 && i < 6 ? 1 : 0, slot: i === 6 ? 0 : i % 3, goals: i === 0 ? 2 : 0, assists: 0, shots: 3, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 });
const game = (won: boolean): GameResult => ({ score: won ? [2, 1] : [1, 2], winner: won ? 0 : 1, finished: true, overtime: false, periods: 3, players: [0, 1, 2, 3, 4, 5, 6].map(line), powerupsUsed: [] });

/** Deals with the stop the season is on; games go as told. */
function resolve(f: Franchise, win: boolean): void {
  const stop = currentStop(f);
  if (!stop) return;
  if (stop.kind === 'game' || stop.kind === 'boss') {
    if (f.season.stage === 'arrived') recordGame(f, game(win));
    while ((f.season.stage as string) === 'reward') {
      f.season.offerStickers = {};
      pickArtifact(f, f.season.offer[0]!);
    }
    if ((f.season.stage as string) === 'ringer') pickRinger(f, null);
  } else if (stop.kind === 'training') train(f, f.season.dressed[0]!);
  else if (stop.kind === 'event') chooseEvent(f, 0);
  else leaveShop(f);
}

/** Plays a season through: every game won, or every game lost from the given region on. */
function play(seed: string, loseFrom = 99): Franchise {
  const f = newFranchise(generateLeague(seed));
  startSeason(f);
  for (let guard = 0; guard < 300 && f.season.phase === 'map'; guard++) {
    if (f.season.current === null) travel(f, availableStops(f)[0]!.id);
    resolve(f, (currentStop(f)?.region ?? 0) < loseFrom);
  }
  for (let guard = 0; guard < 20 && f.season.phase === 'playoffs'; guard++) recordGame(f, game(true));
  return f;
}

describe('the season on one card', () => {
  it('says what a title season was: the club, the finish, every boss, the scorer, the road walked', () => {
    const f = play('recap-a');
    expect(f.season.outcome).toBe('champion');
    const r = seasonRecap(f);
    expect(r.club).toBe(userTeam(f.league).name);
    expect(r.season).toBe(f.league.season);
    expect(r.champion).toBe(true);
    expect(r.finish).toBe('Champions');
    expect(r.losses).toBe(0);
    expect(r.wins).toBe(f.season.gamesWon);
    expect(r.bosses).toHaveLength(seasonRegions(f));
    expect(new Set(r.bosses).size).toBe(r.bosses.length);
    expect(r.topScorer?.goals).toBeGreaterThan(0);
    expect(r.artifacts).toHaveLength(f.artifacts.length);
    expect(r.road).toHaveLength(f.season.visited.length);
    expect(r.road.filter((k) => k === 'boss')).toHaveLength(seasonRegions(f));
    expect(r.place).toBeGreaterThanOrEqual(1);
    expect(r.teams).toBe(f.league.teams.length);
    expect(r.league.length).toBeGreaterThan(0);
    expect(r.difficulty.length).toBeGreaterThan(0);
  });

  it('does not count a boss you were knocked out by', () => {
    // Lose everything from the second region on: the first boss is beaten, the season ends on the road after.
    const f = play('recap-b', 1);
    expect(f.season.outcome).toBe('struckOut');
    const r = seasonRecap(f);
    expect(r.champion).toBe(false);
    expect(r.bosses).toHaveLength(1);
    expect(r.finish).toContain('region 2');
    expect(r.losses).toBeGreaterThan(0);
  });

  it('fits words and lists to a line', () => {
    expect(fitWords('short', 10)).toBe('short');
    expect(fitWords('a very long name indeed', 10)).toHaveLength(10);
    expect(fitWords('a very long name indeed', 10).endsWith('…')).toBe(true);
    expect(fitList([], 20)).toBe('');
    expect(fitList(['One', 'Two'], 20)).toBe('One, Two');
    const many = fitList(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'], 22);
    expect(many.length).toBeLessThanOrEqual(22);
    expect(many).toMatch(/^Alpha, Bravo \+3 more$/);
    expect(fitList(['An extremely long single name'], 12).length).toBeLessThanOrEqual(12);
  });
});
