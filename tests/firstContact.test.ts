import { describe, expect, it } from 'vitest';
import { aiTeamsByStrength } from '../src/core/bosses';
import { generateLeague } from '../src/core/generate';
import { bossLossEnds, buySecondChance, matchup, newFranchise, recordGame, startSeason, type Franchise } from '../src/core/season';
import { generateMap } from '../src/core/seasonMap';
import bosses from '../src/data/bosses.json';
import charters from '../src/data/charters.json';
import rules from '../src/data/season.json';
import { afterGoal, gameResult, type GameResult, type PlayerLine } from '../src/sim/match';
import { cloneTuning } from '../src/sim/tuning';
import type { SimEvent } from '../src/sim/types';
import { createGame } from '../src/sim/world';
import { uniformTeam } from './harness/harness';

const line = (i: number): PlayerLine => ({ id: i, team: 0, role: i === 6 ? 'goalie' : 'skater', line: i >= 3 && i < 6 ? 1 : 0, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 });
const lost: GameResult = { score: [1, 2], winner: 1, finished: true, overtime: false, periods: 3, players: [0, 1, 2, 3, 4, 5, 6].map(line), powerupsUsed: [] };

const at = (f: Franchise, kind: 'game' | 'boss' | 'shop'): void => {
  const stop = Object.values(f.season.map!.stops).find((s) => s.kind === kind && s.region === 0 && !s.elite)!;
  f.season.current = stop.id;
  f.season.stage = 'arrived';
};

describe('a boss loss ending the season is a handicap, not a difficulty', () => {
  it('is one of the handicaps, worth a point', () => {
    const vow = charters.vows.find((v) => v.id === 'oneMeeting')!;
    expect(vow.ranks).toBe(1);
    expect(vow.modifiers).toEqual([{ stat: 'bossLossEnds', op: 'add', value: 1 }]);
  });

  it('no difficulty has it unless it is taken', () => {
    for (const d of rules.difficulties) {
      const plain = newFranchise(generateLeague('contact'), d.id);
      startSeason(plain);
      expect(bossLossEnds(plain)).toBe(false);
      at(plain, 'boss');
      recordGame(plain, lost);
      expect(plain.season.phase).toBe('map');
      expect(plain.season.strikes).toBe(1);

      const taken = newFranchise(generateLeague('contact'), d.id);
      startSeason(taken, { vows: { oneMeeting: 1 } });
      expect(bossLossEnds(taken)).toBe(true);
      at(taken, 'boss');
      recordGame(taken, lost);
      expect(taken.season.phase).toBe('ended');
      expect(taken.season.outcome).toBe('struckOut');
    }
  });

  it('a second chance is sold only to those who took it', () => {
    const plain = newFranchise(generateLeague('contact'));
    startSeason(plain);
    at(plain, 'shop');
    plain.season.currency = 1000;
    expect(buySecondChance(plain).ok).toBe(false);
    const taken = newFranchise(generateLeague('contact'));
    startSeason(taken, { vows: { oneMeeting: 1 } });
    at(taken, 'shop');
    taken.season.currency = 1000;
    expect(buySecondChance(taken).ok).toBe(true);
  });
});

describe('bosses a new player has no answer to are not met first', () => {
  it('a boss kept for later never guards the first region, and no boss is met twice', () => {
    const late = (bosses as unknown as { id: string; minRegion?: number }[]).filter((b) => (b.minRegion ?? 0) > 0).map((b) => b.id);
    expect(late).toEqual(expect.arrayContaining(['the-wall', 'iron-lungs']));
    const order = aiTeamsByStrength(generateLeague('boss-order'));
    const metLater = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const map = generateMap(`order-${i}`, order);
      const guards = Object.values(map.stops)
        .filter((s) => s.kind === 'boss')
        .sort((a, b) => a.region - b.region)
        .map((s) => s.bossId as string);
      expect(guards).toHaveLength(rules.regions);
      expect(new Set(guards).size).toBe(guards.length);
      expect(late).not.toContain(guards[0]);
      for (const id of guards.slice(1)) if (late.includes(id)) metLater.add(id);
    }
    // They are still in the game: both turn up in later regions.
    expect([...metLater].sort()).toEqual([...late].sort());
  });

  it('a one-region season never meets one', () => {
    const late = (bosses as unknown as { id: string; minRegion?: number }[]).filter((b) => (b.minRegion ?? 0) > 0).map((b) => b.id);
    const order = aiTeamsByStrength(generateLeague('boss-order'));
    for (let i = 0; i < 100; i++) {
      const boss = Object.values(generateMap(`one-${i}`, order, 1).stops).find((s) => s.kind === 'boss')!;
      expect(late).not.toContain(boss.bossId);
    }
  });
});

describe('the mercy rule', () => {
  it('calls a game off when a goal makes the lead big enough, and not before', () => {
    const t = cloneTuning();
    const world = createGame(t, 'mercy', { teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5], rules: { mercy: 3 } });
    const events: SimEvent[] = [];
    world.score = [2, 0];
    afterGoal(world, t, events);
    expect(world.phase).not.toBe('final');
    world.score = [1, 4];
    afterGoal(world, t, events);
    expect(world.phase).toBe('final');
    expect(events.some((e) => e.type === 'final')).toBe(true);
    expect(gameResult(world).winner).toBe(1);
  });

  it('a game without the rule is played out whatever the score', () => {
    const t = cloneTuning();
    const world = createGame(t, 'no-mercy', { teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5] });
    world.score = [9, 0];
    afterGoal(world, t, []);
    expect(world.phase).not.toBe('final');
  });

  it('is on for an ordinary season game and off for a boss', () => {
    const f = newFranchise(generateLeague('contact'));
    startSeason(f);
    at(f, 'game');
    expect(matchup(f)!.rules?.mercy).toBe(rules.mercyLead);
    at(f, 'boss');
    expect(matchup(f)!.rules?.mercy).toBeUndefined();
  });
});
