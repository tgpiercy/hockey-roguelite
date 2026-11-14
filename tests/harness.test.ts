import { describe, expect, it } from 'vitest';
import { runGame, runSeries, uniformTeam } from './harness/harness';

describe('balance harness', () => {
  it('plays a whole game to a finish and returns its result', () => {
    const result = runGame('one-game', uniformTeam(70), uniformTeam(70));
    expect(result.finished).toBe(true);
    expect(result.periods).toBeGreaterThanOrEqual(3);
    expect(result.players).toHaveLength(14);
    const skaterTime = result.players.filter((p) => p.role === 'skater').reduce((s, p) => s + p.timeOnIce, 0);
    // Three skaters a side for at least six minutes of play (a few seconds short-handed during changes).
    expect(skaterTime).toBeGreaterThan(6 * 360 * 0.9);
    const goals = result.players.reduce((s, p) => s + p.goals, 0);
    expect(goals).toBeLessThanOrEqual(result.score[0] + result.score[1]);
  });

  it('replays exactly from the same seed', () => {
    const a = runGame('same', uniformTeam(70), uniformTeam(70));
    const b = runGame('same', uniformTeam(70), uniformTeam(70));
    expect(a).toEqual(b);
  });

  it('a series adds up', () => {
    const report = runSeries(8, uniformTeam(70), uniformTeam(70), 'series');
    expect(report.games).toBe(8);
    expect(report.winsA + report.winsB + report.ties).toBe(8);
    expect(report.savePct).toBeGreaterThan(0.5);
    expect(report.savePct).toBeLessThan(1);
    expect(report.shotsPerGameA).toBeGreaterThan(0);
  });

  it('ratings matter: a 90-rated team beats a 70-rated team most of the time', () => {
    const report = runSeries(20, uniformTeam(90), uniformTeam(70), 'gap');
    expect(report.winRateA).toBeGreaterThan(0.6);
    expect(report.goalsPerGameA).toBeGreaterThan(report.goalsPerGameB);
  }, 60_000);
});
