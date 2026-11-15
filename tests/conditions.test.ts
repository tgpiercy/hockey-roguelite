import { BEFORE } from '../src/core/season';
import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { artifactInfo, artifactModifiers, availableStops, bargainGames, newFranchise, recordGame, startSeason, teamModifiers, travel, type Franchise } from '../src/core/season';
import artifacts from '../src/data/artifacts.json';
import { activeLabels, holds, isPlain, ON, plainOf, stepConditions, WHEN } from '../src/sim/conditions';
import type { GameResult } from '../src/sim/match';
import type { Modifier } from '../src/sim/modifiers';
import { stepPowerups } from '../src/sim/powerups';
import { defaultGoalieRatings, defaultSkaterRatings, goalieEffects, skaterEffects } from '../src/sim/ratings';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createGame, type TeamSetup } from '../src/sim/world';
import { runGame, uniformTeam } from './harness/harness';

const t = cloneTuning();
const PERIODS = t.period.count;

const team = (modifiers: Modifier[] = []): TeamSetup => ({ ...uniformTeam(70), modifiers });
const game = (modifiers: Modifier[]): World => createGame(t, 'when', { human: false, levels: [0.5, 0.5], teams: [team(modifiers), team()] });
const speed = (world: World, id = 0): number => world.players[id]!.fx.topSpeedScale;
const tick = (world: World, events: SimEvent[] = []): void => stepConditions(world, events, PERIODS);

describe('a modifier with a "when"', () => {
  const faster = (when: string): Modifier => ({ stat: 'topSpeedScale', op: 'mul', value: 1.1, when, label: 'Test' });

  it('is not part of a player\'s lasting abilities', () => {
    const plain = game([]);
    const world = game([faster('trailing')]);
    expect(world.players[0]!.baseFx).toEqual(plain.players[0]!.baseFx);
    expect(isPlain(faster('trailing'))).toBe(false);
    expect(plainOf([faster('tied'), { stat: 'accuracy', op: 'add', value: 1 }])).toHaveLength(1);
  });

  it('trailing, leading and tied follow the score, for that team only', () => {
    for (const [when, scores] of [
      ['trailing', [[0, 1, true], [1, 1, false], [2, 1, false]]],
      ['leading', [[0, 1, false], [1, 1, false], [2, 1, true]]],
      ['tied', [[0, 1, false], [1, 1, true], [0, 0, true]]],
    ] as [string, [number, number, boolean][]][]) {
      const world = game([faster(when)]);
      const base = world.players[0]!.baseFx.topSpeedScale;
      for (const [mine, theirs, on] of scores) {
        world.score = [mine, theirs];
        tick(world);
        expect(speed(world), `${when} at ${mine}-${theirs}`).toBeCloseTo(on ? base * 1.1 : base);
        // The other team is never touched.
        expect(speed(world, 7)).toBeCloseTo(world.players[7]!.baseFx.topSpeedScale);
        expect(activeLabels(world, 0)).toEqual(on ? ['Test'] : []);
      }
    }
  });

  it('the last period and overtime follow the clock', () => {
    const world = game([faster('lastPeriod'), { stat: 'accuracy', op: 'mul', value: 2, when: 'overtime' }]);
    const base = world.players[0]!.baseFx;
    tick(world);
    expect(speed(world)).toBeCloseTo(base.topSpeedScale);
    world.period = PERIODS;
    tick(world);
    expect(speed(world)).toBeCloseTo(base.topSpeedScale * 1.1);
    world.period = PERIODS + 1;
    world.overtime = true;
    tick(world);
    expect(speed(world)).toBeCloseTo(base.topSpeedScale);
    expect(world.players[0]!.fx.accuracy).toBeCloseTo(base.accuracy * 2);
    expect(holds(world, 0, 'nonsense', PERIODS)).toBe(false);
  });

  it('reaches the goalie too', () => {
    const world = game([{ stat: 'reactionSeconds', op: 'mul', value: 0.5, when: 'leading' }]);
    const goalie = world.players[6]!.goalie!;
    world.score = [1, 0];
    tick(world);
    expect(goalie.fx.reactionSeconds).toBeCloseTo(goalie.baseFx.reactionSeconds * 0.5);
  });

  it('stacks with a running boost and survives it ending', () => {
    const world = game([faster('tied')]);
    const base = world.players[0]!.baseFx.topSpeedScale;
    world.teams[0].boosts = [{ id: 'b', name: 'B', secondsLeft: 0.01, modifiers: [{ stat: 'topSpeedScale', op: 'mul', value: 1.2 }] }];
    world.teams[0].active = [];
    tick(world);
    expect(speed(world)).toBeCloseTo(base * 1.1 * 1.2);
    stepPowerups(world, NO_INPUT, []);
    expect(world.teams[0].boosts).toHaveLength(0);
    expect(speed(world)).toBeCloseTo(base * 1.1);
  });
});

describe('a modifier with an "on"', () => {
  const after = (on: string, seconds = 5): Modifier => ({ stat: 'topSpeedScale', op: 'mul', value: 1.1, on, seconds, label: 'Trigger' });
  const events: Record<string, (mine: boolean) => SimEvent> = {
    goalFor: (mine) => ({ type: 'goal', side: mine ? 1 : -1, team: mine ? 0 : 1, scorer: null, assists: [] }),
    goalAgainst: (mine) => ({ type: 'goal', side: mine ? -1 : 1, team: mine ? 1 : 0, scorer: null, assists: [] }),
    bigHit: (mine) => ({ type: 'check', player: mine ? 0 : 7, target: mine ? 7 : 0, kind: 'body', success: true, big: true }),
    save: (mine) => ({ type: 'save', goalie: mine ? 6 : 13, frozen: false }),
    steal: (mine) => ({ type: 'check', player: mine ? 0 : 7, target: mine ? 7 : 0, kind: 'poke', success: true }),
    pass: (mine) => ({ type: 'pickup', player: mine ? 1 : 8, pass: true }),
  };

  it('every trigger starts a timed boost for the team it happened for, and not for the other', () => {
    for (const on of ON) {
      const world = game([after(on)]);
      const base = world.players[0]!.baseFx.topSpeedScale;
      tick(world, [events[on]!(false)]);
      expect(speed(world), `${on}, theirs`).toBeCloseTo(base);
      tick(world, [events[on]!(true)]);
      expect(speed(world), `${on}, ours`).toBeCloseTo(base * 1.1);
      expect(world.teams[0].boosts).toEqual([expect.objectContaining({ name: 'Trigger', secondsLeft: 5 })]);
      expect(world.teams[1].boosts).toHaveLength(0);
    }
  });

  it('things that only look alike do not count', () => {
    const world = game([after('steal'), after('bigHit'), after('pass')]);
    tick(world, [
      { type: 'check', player: 0, target: 7, kind: 'poke', success: false },
      { type: 'check', player: 0, target: 7, kind: 'body', success: true },
      { type: 'pickup', player: 1 },
    ]);
    expect(world.teams[0].boosts).toHaveLength(0);
  });

  it('the boost runs out, and happening again starts it afresh', () => {
    const world = game([after('save', 0.05)]);
    const base = world.players[0]!.baseFx.topSpeedScale;
    tick(world, [events.save!(true)]);
    for (let i = 0; i < 5; i++) stepPowerups(world, NO_INPUT, []);
    expect(speed(world)).toBeCloseTo(base);
    tick(world, [events.save!(true)]);
    tick(world, [events.save!(true)]);
    expect(world.teams[0].boosts).toHaveLength(1);
  });
});

describe('a game with conditional modifiers', () => {
  it('plays to the end, and a team without any plays exactly as before', () => {
    const plain = runGame('cond', team(), team());
    expect(runGame('cond', team([]), team([]))).toEqual(plain);
    const all: Modifier[] = (artifacts as unknown as { modifiers: Modifier[] }[]).flatMap((a) => a.modifiers).filter((m) => !isPlain(m) && !(BEFORE as readonly string[]).includes(m.when ?? ''));
    const result = runGame('cond', team(all), team());
    expect(result.finished).toBe(true);
  });
});

describe('the conditional artifacts and the bargains', () => {
  const list = artifacts as unknown as { id: string; name: string; description: string; modifiers: Modifier[]; bargain?: { games: number; handicap: Modifier[] } }[];
  const simStats = new Set([...Object.keys(skaterEffects(defaultSkaterRatings)), ...Object.keys(goalieEffects(defaultGoalieRatings))]);

  it('there are at least twelve conditional artifacts and four bargains', () => {
    expect(list.filter((a) => a.modifiers.some((m) => !isPlain(m))).length).toBeGreaterThanOrEqual(12);
    expect(list.filter((a) => a.bargain).length).toBeGreaterThanOrEqual(4);
  });

  it('every condition and trigger is one the game knows, on a stat the ice reads', () => {
    for (const a of list) {
      for (const m of [...a.modifiers, ...(a.bargain?.handicap ?? [])]) {
        if (m.when !== undefined) expect([...WHEN, ...BEFORE], a.id).toContain(m.when);
        if (m.on !== undefined) {
          expect(ON as readonly string[], a.id).toContain(m.on);
          expect(m.seconds, a.id).toBeGreaterThan(0);
        }
        // A condition of the game in progress needs a stat the ice reads; one settled before the game may also be the season's.
        const settledBefore = (BEFORE as readonly string[]).includes(m.when ?? '');
        if (!isPlain(m) && !settledBefore) expect(simStats.has(m.stat), `${a.id}: ${m.stat}`).toBe(true);
        expect(m.when !== undefined && m.on !== undefined, a.id).toBe(false);
      }
      if (a.bargain) {
        expect(a.bargain.games).toBeGreaterThan(0);
        expect(a.bargain.handicap.length).toBeGreaterThan(0);
        expect(a.description.startsWith('A bargain.')).toBe(true);
      }
    }
  });

  const fresh = (): Franchise => {
    const f = newFranchise(generateLeague('conditions'));
    startSeason(f);
    return f;
  };
  const won: GameResult = {
    score: [3, 1],
    winner: 0,
    finished: true,
    overtime: false,
    periods: 3,
    players: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: i, team: 0 as const, role: i === 6 ? ('goalie' as const) : ('skater' as const), line: (i >= 3 && i < 6 ? 1 : 0) as 0 | 1, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 })),
    powerupsUsed: [],
  };

  it('a conditional artifact reaches the team carrying its name', () => {
    const f = fresh();
    f.artifacts.push('comeback-kings');
    const mods = artifactModifiers(f);
    expect(mods.every((m) => m.when === 'trailing' && m.label === 'Comeback kings')).toBe(true);
    expect(teamModifiers(f)).toEqual(expect.arrayContaining(mods));
  });

  it('a "home" artifact is settled before the game: on at home, gone on the road', () => {
    const f = fresh();
    f.artifacts.push('home-cooking');
    const seen = new Set<number>();
    for (let i = 0; i < 6 && seen.size < 2; i++) {
      f.season.gamesPlayed = i;
      const mine = teamModifiers(f).filter((m) => m.stat === 'checkStrength' && m.value === 1.12);
      seen.add(mine.length);
      for (const m of mine) expect(m.when).toBeUndefined();
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it('a bargain handicaps you for its games, then pays for the rest of the season', () => {
    const f = fresh();
    travel(f, availableStops(f).find((s) => s.kind === 'game' && !s.elite)!.id);
    // Taken as an artifact pick would take it.
    f.artifacts.push('goalie-project');
    f.season.bargains = { 'goalie-project': artifactInfo('goalie-project').bargain!.games };
    expect(bargainGames(f, 'goalie-project')).toBe(2);
    expect(artifactModifiers(f)).toEqual([{ stat: 'reactionSeconds', op: 'mul', value: 1.15 }]);
    expect(recordGame(f, won).ok).toBe(true);
    expect(bargainGames(f, 'goalie-project')).toBe(1);
    f.season.bargains = { 'goalie-project': 0 };
    expect(artifactModifiers(f)).toEqual([{ stat: 'reactionSeconds', op: 'mul', value: 0.92 }]);
    expect(bargainGames(f, 'comeback-kings')).toBe(0);
  });
});
