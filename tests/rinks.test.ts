import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { isVariant, nextRink, RINK_BONUS, rinkInfo, RINKS, rinkTuning, SHOOTOUT, STANDARD_RINK } from '../src/core/rinks';
import { availableStops, currentStop, matchup, newFranchise, recordGame, startSeason, travel, type Franchise } from '../src/core/season';
import { generateMap } from '../src/core/seasonMap';
import bosses from '../src/data/bosses.json';
import rules from '../src/data/season.json';
import { gameResult, type GameResult } from '../src/sim/match';
import { cloneTuning, defaultTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createGame, step } from '../src/sim/world';
import { runGame, uniformTeam } from './harness/harness';

const t = cloneTuning();
const teams = (): [ReturnType<typeof uniformTeam>, ReturnType<typeof uniformTeam>] => [uniformTeam(70), uniformTeam(70)];

describe('rinks are data', () => {
  it('there is a standard rink and at least five others, each with a name and a sentence', () => {
    expect(rinkInfo(STANDARD_RINK).id).toBe(STANDARD_RINK);
    expect(RINKS.filter((r) => isVariant(r.id)).length).toBeGreaterThanOrEqual(5);
    expect(new Set(RINKS.map((r) => r.id)).size).toBe(RINKS.length);
    for (const rink of RINKS) {
      expect(rink.name.length).toBeGreaterThan(3);
      expect(rink.describe.length).toBeGreaterThan(15);
    }
  });

  it('every changed number is one the simulation has', () => {
    const shape = defaultTuning as unknown as Record<string, Record<string, number>>;
    for (const rink of RINKS) {
      for (const [group, values] of Object.entries(rink.tuning)) {
        expect(shape[group], `${rink.id}: ${group}`).toBeDefined();
        for (const name of Object.keys(values)) expect(typeof shape[group]![name], `${rink.id}: ${group}.${name}`).toBe('number');
      }
      for (const key of Object.keys(rink.rules)) expect(['firstTo', 'oneLine']).toContain(key);
    }
  });

  it('a rink changes only its own numbers, on a copy', () => {
    const base = cloneTuning();
    expect(rinkTuning(base, rinkInfo(STANDARD_RINK))).toBe(base);
    const pond = rinkTuning(base, rinkInfo('pond'));
    expect(pond).not.toBe(base);
    expect(pond.rink.length).toBeLessThan(base.rink.length);
    expect(pond.shot).toEqual(base.shot);
    expect(base.rink.length).toBe(defaultTuning.rink.length);
  });

  it('anything unknown is the standard rink, and the row steps through them all', () => {
    expect(rinkInfo('nonsense').id).toBe(STANDARD_RINK);
    expect(rinkInfo(undefined).id).toBe(STANDARD_RINK);
    expect(isVariant(undefined)).toBe(false);
    const seen = new Set<string>();
    let at = STANDARD_RINK;
    for (let i = 0; i < RINKS.length; i++) {
      at = nextRink(at).id;
      seen.add(at);
    }
    expect(seen.size).toBe(RINKS.length);
  });

  it('every boss has a home rink that exists', () => {
    for (const boss of bosses as unknown as { id: string; rink?: string }[]) {
      expect(boss.rink, boss.id).toBeDefined();
      expect(rinkInfo(boss.rink).id, boss.id).toBe(boss.rink);
    }
  });
});

describe('rules a rink changes', () => {
  it('the standard rink is the game as it always was', () => {
    const plain = runGame('same', ...teams());
    const world = createGame(t, 'same', { human: false, teams: teams(), levels: [0.5, 0.5], overtimeLimit: 300, rules: {} });
    for (let i = 0; i < 30 * 60 * 60 && world.phase !== 'final'; i++) step(world, NO_INPUT, t);
    expect(gameResult(world)).toEqual(plain);
  });

  it('first to three: no period ever ends, and the game is over at the third goal', () => {
    const world = createGame(t, 'first', { human: false, teams: teams(), levels: [0.5, 0.5], rules: { firstTo: 3 } });
    let periods = 0;
    for (let i = 0; i < 60 * 60 * 60 && world.phase !== 'final'; i++) periods += step(world, NO_INPUT, t).filter((e) => e.type === 'period').length;
    expect(world.phase).toBe('final');
    expect(Math.max(...world.score)).toBe(3);
    expect(Math.min(...world.score)).toBeLessThan(3);
    expect(periods).toBe(0);
    expect(gameResult(world).winner).toBe(world.score[0] > world.score[1] ? 0 : 1);
  });

  it('one line: the second line never comes on, even when the button is pressed', () => {
    const world = createGame(t, 'one', { teams: teams(), levels: [0.5, 0.5], rules: { oneLine: true } });
    const press: InputFrame = { ...NO_INPUT, lineChange: true };
    for (let i = 0; i < 60 * 150 && world.phase !== 'final'; i++) step(world, i % 120 < 5 ? press : NO_INPUT, t);
    const second = world.players.filter((p) => p.role === 'skater' && p.line === 1);
    expect(second.every((p) => p.stats.timeOnIce === 0)).toBe(true);
    expect(world.teams[0].line).toBe(0);
    expect(world.teams[1].line).toBe(0);
  });

  it('every rink gives a whole game that ends', () => {
    for (const rink of RINKS) {
      const tuned = rinkTuning(cloneTuning(), rink);
      const world = createGame(tuned, `whole/${rink.id}`, { human: false, teams: teams(), levels: [0.5, 0.5], overtimeLimit: 120, rules: rink.rules });
      for (let i = 0; i < 30 * 60 * 60 && world.phase !== 'final'; i++) step(world, NO_INPUT, tuned);
      expect(world.phase, rink.id).toBe('final');
      const half = tuned.rink.length / 2;
      for (const p of world.players) expect(Math.abs(p.pos.x), `${rink.id}: player ${p.id}`).toBeLessThanOrEqual(half + 1);
    }
  });
});

describe('the shootout', () => {
  const shootout = (seed = 'so', human = false): World => createGame(t, seed, { human, teams: teams(), levels: [0.5, 0.5], rules: { shootout: SHOOTOUT } });
  const play = (world: World, steps = 60 * 60 * 5): SimEvent[] => {
    const events: SimEvent[] = [];
    for (let i = 0; i < steps && world.phase !== 'final'; i++) events.push(...step(world, NO_INPUT, t));
    return events;
  };

  it('starts with one skater at centre with the puck and the other goalie in his net, and nobody else', () => {
    const world = shootout();
    const on = world.players.filter((p) => p.onIce);
    expect(on.map((p) => `${p.team}${p.role}`).sort()).toEqual(['0skater', '1goalie']);
    const shooter = on.find((p) => p.role === 'skater')!;
    expect(world.puck.carrier).toBe(shooter.id);
    expect(Math.abs(shooter.pos.x)).toBeLessThan(1);
    expect(world.clock).toBe(SHOOTOUT.attemptSeconds);
    expect(world.rules).toBe('shootout');
  });

  it('the teams take turns, and the skaters of each take turns', () => {
    const world = shootout();
    const order: string[] = [];
    let last = '';
    for (let i = 0; i < 60 * 60 * 5 && world.phase !== 'final'; i++) {
      step(world, NO_INPUT, t);
      const shooter = world.players.find((p) => p.onIce && p.role === 'skater');
      const key = shooter ? `${world.shootout!.shooting}:${shooter.id}` : last;
      if (world.phase === 'play' && key !== last) {
        order.push(key);
        last = key;
      }
    }
    expect(order.slice(0, 6)).toEqual(['0:0', '1:7', '0:1', '1:8', '0:2', '1:9']);
  });

  it('is settled after five turns each when the scores differ, and goes on in pairs when they do not', () => {
    let longest = 0;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const world = shootout(seed);
      play(world);
      expect(world.phase, seed).toBe('final');
      const [a, b] = world.shootout!.taken;
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(SHOOTOUT.rounds);
      expect(world.score[0]).not.toBe(world.score[1]);
      expect(gameResult(world).winner).toBe(world.score[0] > world.score[1] ? 0 : 1);
      longest = Math.max(longest, a);
    }
    // At least one of these went past five: level after five, it carried on.
    expect(longest).toBeGreaterThan(SHOOTOUT.rounds);
  });

  it('an attempt that runs out of time is no goal', () => {
    const world = shootout('idle', true);
    // The human shoots first and does nothing at all.
    const events = play(world, Math.round((SHOOTOUT.attemptSeconds + 0.5) * 60));
    expect(events).toContainEqual({ type: 'shootout', team: 0, scored: false });
    expect(world.score[0]).toBe(0);
    expect(world.shootout!.last).toBe('miss');
  });

  it('with two on a team they take the turns in order', () => {
    const world = createGame(t, 'pair', { teams: teams(), second: 0, levels: [0.5, 0.5], rules: { shootout: SHOOTOUT } });
    expect(world.human!.controlled).toBe(0);
    expect(world.human2!.controlled).toBe(-1);
    // Through the first two attempts (ours, theirs) to our second.
    while (world.shootout!.taken[0] < 1 || world.shootout!.shooting !== 0) step(world, NO_INPUT, t);
    expect(world.human!.controlled).toBe(-1);
    expect(world.human2!.controlled).toBe(1);
  });
});

describe('rinks in a season', () => {
  const started = (seed = 'rinks'): Franchise => {
    const f = newFranchise(generateLeague(seed));
    startSeason(f);
    return f;
  };
  const won: GameResult = {
    score: [2, 1],
    winner: 0,
    finished: true,
    overtime: false,
    periods: 3,
    players: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: i, team: 0 as const, role: i === 6 ? ('goalie' as const) : ('skater' as const), line: (i >= 3 && i < 6 ? 1 : 0) as 0 | 1, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 })),
    powerupsUsed: [],
  };

  it('some ordinary game stops have a rink of their own; elite games never do; every boss has his', () => {
    let marked = 0;
    let plain = 0;
    for (const seed of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) {
      const f = started(seed);
      for (const stop of Object.values(f.season.map!.stops)) {
        if (stop.kind === 'boss') expect(isVariant(stop.rink), `${seed} ${stop.bossId}`).toBe(true);
        else if (stop.kind === 'game' && stop.elite) expect(stop.rink).toBeUndefined();
        else if (stop.kind === 'game') {
          if (stop.rink) {
            marked++;
            expect(isVariant(stop.rink)).toBe(true);
          } else plain++;
        } else expect(stop.rink).toBeUndefined();
      }
    }
    expect(marked).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(marked);
  });

  it('the same seed gives the same rinks', () => {
    const teams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    expect(generateMap('again', teams)).toEqual(generateMap('again', teams));
  });

  it('the game at a marked stop is on its rink, and a win there pays more', () => {
    const marked = started();
    delete marked.season.cup;
    const stop = availableStops(marked).find((s) => s.kind === 'game' && !s.elite)!;
    stop.rink = 'heavyPuck';
    travel(marked, stop.id);
    expect(matchup(marked)!.rink).toBe('heavyPuck');
    recordGame(marked, won);

    const plain = started();
    delete plain.season.cup;
    const other = availableStops(plain).find((s) => s.kind === 'game' && !s.elite)!;
    delete other.rink;
    travel(plain, other.id);
    expect(matchup(plain)!.rink).toBeUndefined();
    recordGame(plain, won);
    expect(marked.season.currency - plain.season.currency).toBe(RINK_BONUS);
    expect(plain.season.currency).toBe(rules.winCurrency + rules.marginCurrency);
    expect(currentStop(plain)).toBeNull();
  });
});
