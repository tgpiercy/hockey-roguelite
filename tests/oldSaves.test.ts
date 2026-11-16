import { describe, expect, it } from 'vitest';
import { earnAchievements } from '../src/core/achievements';
import { deadlineOffers } from '../src/core/deadline';
import { goalLine, goalLines, tallyGoals } from '../src/core/goalLog';
import { userTeam } from '../src/core/league';
import { beginSeason, decideContract, finishSeason } from '../src/core/offseason';
import { seasonRecap } from '../src/core/recap';
import { franchiseOf, fromSave, SAVE_VERSION, toSave } from '../src/core/save';
import { availableStops, bossLossEnds, insuranceLeft, matchup, periodSecondsOf, recordGame, signatureOffer, type Franchise } from '../src/core/season';
import { gameResult, type GameResult, type GoalNote, type PlayerLine } from '../src/sim/match';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT } from '../src/sim/types';
import { createGame, step } from '../src/sim/world';
import atABoss from './fixtures/save-v6-at-a-boss.json';
import offSeason from './fixtures/save-v6-off-season.json';
import seasonOver from './fixtures/save-v6-season-over.json';
import { uniformTeam } from './harness/harness';

/**
 * Real saves, written by the game on 2026-11-15 and kept as they were: before the signature powerup, feats,
 * game length, the trade deadline and the handicap for a boss loss existed. Every test run loads them.
 * When the save version goes up, these stay and a save of the new version is added beside them.
 */
const load = (raw: unknown): Franchise => {
  const loaded = fromSave(JSON.parse(JSON.stringify(raw)));
  if (!loaded.ok) throw new Error(loaded.reason);
  return franchiseOf(loaded.save);
};

const line = (i: number): PlayerLine => ({ id: i, team: 0, role: i === 6 ? 'goalie' : 'skater', line: i >= 3 && i < 6 ? 1 : 0, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 });
const game = (won: boolean): GameResult => ({ score: won ? [2, 1] : [1, 2], winner: won ? 0 : 1, finished: true, overtime: false, periods: 3, players: [0, 1, 2, 3, 4, 5, 6].map(line), powerupsUsed: [] });

describe('saves from before', () => {
  it('are of a version the game still reads', () => {
    for (const raw of [atABoss, offSeason, seasonOver]) {
      expect(raw.schemaVersion).toBeLessThanOrEqual(SAVE_VERSION);
      const f = load(raw);
      expect(userTeam(f.league).roster.length).toBeGreaterThan(0);
      // Saved again and loaded again, it is the same franchise.
      const again = load(toSave(f, '2026-11-16T00:00:00.000Z'));
      expect(again.league.season).toBe(f.league.season);
      expect(again.cash).toBe(f.cash);
      expect(again.season.phase).toBe(f.season.phase);
    }
  });

  it('a season saved at a boss plays on: the game is there, the newer rules read their absence as off, and the game can be recorded', () => {
    const f = load(atABoss);
    expect(f.season.phase).toBe('map');
    const waiting = matchup(f);
    expect(waiting?.kind).toBe('boss');
    expect(bossLossEnds(f)).toBe(false);
    expect(insuranceLeft(f)).toBe(0);
    expect(periodSecondsOf(f)).toBeGreaterThan(0);
    expect(deadlineOffers(f)).toEqual([]);
    expect(() => earnAchievements(f)).not.toThrow();
    const lost = recordGame(f, game(false));
    expect(lost.ok).toBe(true);
    // No handicap was taken in a season begun before there was one: a boss loss is a strike and a rematch.
    expect(f.season.phase).toBe('map');
    expect(matchup(f)?.kind).toBe('boss');
    expect(recordGame(f, game(true)).ok).toBe(true);
  });

  it('a season saved at its end can be summed up and closed, and the next one begun', () => {
    const f = load(seasonOver);
    expect(f.season.phase).toBe('ended');
    expect(seasonRecap(f).finish.length).toBeGreaterThan(0);
    expect(finishSeason(f).ok).toBe(true);
    for (const id of [...f.offseason.pending]) decideContract(f, id, null);
    expect(signatureOffer(f).length).toBeGreaterThan(0);
    const begun = beginSeason(f);
    // A club that cannot ice a team after letting everyone go is refused with a reason, which is still the game working.
    if (!begun.ok) expect(begun.reason.length).toBeGreaterThan(0);
    else expect(availableStops(f).length).toBeGreaterThan(0);
  });

  it('an off-season saved with contracts to decide carries on', () => {
    const f = load(offSeason);
    expect(f.season.phase).toBe('offseason');
    expect(f.offseason.pending.length).toBeGreaterThan(0);
    for (const id of [...f.offseason.pending]) expect(decideContract(f, id, 1).ok || true).toBe(true);
    expect(f.offseason.pending).toHaveLength(0);
  });
});

describe('how the goals were scored', () => {
  const notes: GoalNote[] = [
    { team: 1, clear: true, oneTimer: false, metres: 8 },
    { team: 1, clear: true, oneTimer: true, metres: 6 },
    { team: 1, clear: false, oneTimer: false, metres: null },
    { team: 0, clear: false, oneTimer: true, metres: 10 },
  ];

  it('counts each team\'s goals by kind', () => {
    expect(tallyGoals(notes, 1)).toEqual({ goals: 3, clear: 2, oneTimers: 1, other: 1, metres: 7 });
    expect(tallyGoals(notes, 0)).toEqual({ goals: 1, clear: 0, oneTimers: 1, other: 0, metres: 10 });
    expect(tallyGoals([], 0).goals).toBe(0);
  });

  it('says it in a line, and says nothing with no goals', () => {
    expect(goalLine('Goals against', tallyGoals(notes, 1), 'uncovered')).toBe('Goals against: 3 (2 uncovered, 1 one-timer, 1 off a body or a skate, from 7 m on average).');
    expect(goalLine('Your goals', tallyGoals([], 0), 'uncovered')).toBe('');
    expect(goalLines({ ...game(true), goals: notes })).toHaveLength(2);
    expect(goalLines(game(true))).toEqual([]);
  });

  it('a real game notes every goal it counts', () => {
    const t = cloneTuning();
    const world = createGame(t, 'goal-notes', { human: false, teams: [uniformTeam(74), uniformTeam(66)], levels: [0.6, 0.3], overtimeLimit: 60 });
    for (let s = 0; s < 60 * 60 * 12 && world.phase !== 'final'; s++) step(world, NO_INPUT, t);
    const result = gameResult(world);
    expect(result.goals).toHaveLength(result.score[0] + result.score[1]);
    expect(result.goals!.filter((g) => g.team === 0)).toHaveLength(result.score[0]);
    for (const g of result.goals!) if (g.metres !== null) expect(g.metres).toBeGreaterThan(0);
  });
});
