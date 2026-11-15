import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { dropInChance, mascotPower, mascotSetup, sitsFor, userMascot } from '../src/core/mascot';
import { createRng } from '../src/core/rng';
import { availableStops, currentStop, dressUser, matchup, newFranchise, recordGame, simulateGame, startSeason, travel, type Franchise } from '../src/core/season';
import rules from '../src/data/mascot.json';
import talentRules from '../src/data/talents.json';
import { isMascot, mascotChance, mascotPlayer, type MascotSetup } from '../src/sim/mascot';
import { gameResult, type GameResult } from '../src/sim/match';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createGame, step, type TeamSetup } from '../src/sim/world';
import { runGame, uniformTeam } from './harness/harness';

const t = cloneTuning();

/** Enough misses in a row that the next roll is certain. */
const CERTAIN = Math.ceil((1 - rules.baseChance) / rules.missStep);

const visitor = (over: Partial<MascotSetup> = {}): MascotSetup => ({
  name: 'Testy',
  ratings: { shooting: 95, passing: 95, speed: 95, checking: 95, puckControl: 95, stamina: 95 },
  modifiers: [],
  talents: ['spinMove'],
  slot: 4,
  misses: 0,
  ...over,
});

const team = (mascot?: MascotSetup): TeamSetup => ({ ...uniformTeam(70), ...(mascot ? { mascot } : {}) });

const game = (home?: MascotSetup, away?: MascotSetup, seed = 'mascot'): World => createGame(t, seed, { human: false, levels: [0.5, 0.5], teams: [team(home), team(away)] });

/** Runs the clock out and steps to the start of the next period (or the end of the game). Returns what happened. */
const nextPeriod = (world: World, score?: [number, number]): SimEvent[] => {
  const before = world.period;
  const events: SimEvent[] = [];
  world.clock = 0.02;
  for (let i = 0; i < 4000 && world.period === before && world.phase !== 'final'; i++) {
    // Hold the score where the test wants it, whatever the AI gets up to.
    if (score) world.score = [...score];
    events.push(...step(world, NO_INPUT, t));
  }
  if (score) world.score = [...score];
  return events;
};

describe('the mascot\'s chance', () => {
  it('starts at 10%, gains 5% for every miss in a row, and never passes certain', () => {
    expect(mascotChance(0)).toBeCloseTo(0.1);
    expect(mascotChance(1)).toBeCloseTo(0.15);
    expect(mascotChance(4)).toBeCloseTo(0.3);
    expect(mascotChance(CERTAIN)).toBe(1);
    expect(mascotChance(500)).toBe(1);
    expect(dropInChance(3)).toBe(mascotChance(3));
  });

  it('with a rising chance he comes about one roll in four', () => {
    // The arithmetic: the expected number of rolls until one hits.
    let expected = 0;
    let stillMissing = 1;
    for (let k = 0; k <= CERTAIN; k++) {
      expected += stillMissing;
      stillMissing *= 1 - mascotChance(k);
    }
    const rng = createRng('share');
    let misses = 0;
    let hits = 0;
    const rolls = 40000;
    for (let i = 0; i < rolls; i++) {
      if (rng.chance(mascotChance(misses))) {
        hits++;
        misses = 0;
      } else misses++;
    }
    expect(hits / rolls).toBeGreaterThan(1 / expected - 0.01);
    expect(hits / rolls).toBeLessThan(1 / expected + 0.01);
    expect(1 / expected).toBeGreaterThan(0.2);
    expect(1 / expected).toBeLessThan(0.3);
  });
});

describe('the mascot on the ice', () => {
  it('a team without one has none, and the result says nothing about mascots', () => {
    const world = game();
    expect(world.teams[0].mascot).toBeNull();
    expect(gameResult(world).mascots).toBeUndefined();
  });

  it('a certain roll brings him for the opening faceoff, in the named skater\'s place', () => {
    const world = game(visitor({ misses: CERTAIN }));
    const plain = game();
    const p = mascotPlayer(world, 0)!;
    expect(p.id).toBe(4);
    expect(isMascot(world, p)).toBe(true);
    expect(p.talents).toEqual(['spinMove']);
    expect(p.fx.topSpeedScale).toBeGreaterThan(plain.players[4]!.fx.topSpeedScale);
    expect(world.teams[0].mascot!.misses).toBe(0);
    expect(world.teams[0].mascot!.arrivals).toBe(1);
    // Nobody else is touched, on either team.
    expect(world.players[3]!.fx).toEqual(plain.players[3]!.fx);
    expect(world.players[11]!.fx).toEqual(plain.players[11]!.fx);
    expect(world.players.some((other) => other.id !== p.id && isMascot(world, other))).toBe(false);
  });

  it('his line takes the faceoff when he arrives, and he arrives fresh', () => {
    const world = game(visitor({ misses: CERTAIN, slot: 4 }));
    expect(world.teams[0].line).toBe(1);
    expect(world.players[4]!.onIce).toBe(true);
    expect(world.players[4]!.energy).toBe(1);
    expect(game(visitor({ misses: CERTAIN, slot: 1 })).teams[0].line).toBe(0);
  });

  it('he gets the team\'s lasting modifiers and his own', () => {
    const cannon = talentRules.talents.find((x) => x.id === 'cannonShot')! as { modifiers?: MascotSetup['modifiers'] };
    const world = createGame(t, 'mods', {
      human: false,
      teams: [{ ...team(visitor({ misses: CERTAIN, modifiers: cannon.modifiers ?? [], talents: ['cannonShot'] })), modifiers: [{ stat: 'accuracy', op: 'mul', value: 1.2 }] }, team()],
    });
    const p = mascotPlayer(world, 0)!;
    expect(p.fx.chargedShotScale).toBeCloseTo(1.3);
    expect(p.fx.accuracy).toBeCloseTo(game(visitor({ misses: CERTAIN })).players[4]!.fx.accuracy * 1.2);
    expect(world.players[0]!.fx.chargedShotScale).toBeCloseTo(1);
  });

  it('plays one period: at its end the skater is himself again, and both things are announced', () => {
    const world = game(visitor({ misses: CERTAIN }));
    const plain = game();
    const events = nextPeriod(world, [0, 0]);
    const p = world.players[4]!;
    expect(world.period).toBe(2);
    expect(isMascot(world, p)).toBe(false);
    expect(p.baseFx).toEqual(plain.players[4]!.baseFx);
    expect(p.fx).toEqual(plain.players[4]!.fx);
    expect(p.talents).toEqual([]);
    expect(events.filter((e) => e.type === 'mascot')).toEqual([{ type: 'mascot', team: 0, player: 4, arrived: false }]);
  });

  it('at a period start only a team two or more behind rolls', () => {
    for (const [score, rolls] of [
      [[0, 0], false],
      [[1, 2], false],
      [[3, 0], false],
      [[0, 2], true],
      [[1, 5], true],
    ] as [[number, number], boolean][]) {
      const world = game(visitor());
      // Whatever the opening roll did, start the break from a known place.
      nextPeriod(world, score);
      const visit = world.teams[0].mascot!;
      const missesBefore = visit.misses;
      const arrivalsBefore = visit.arrivals;
      visit.misses = CERTAIN;
      const events = nextPeriod(world, score);
      if (world.phase === 'final' || world.overtime) continue;
      expect(visit.arrivals - arrivalsBefore, `${score}`).toBe(rolls ? 1 : 0);
      expect(events.some((e) => e.type === 'mascot' && e.arrived), `${score}`).toBe(rolls);
      if (!rolls) expect(visit.misses).toBe(CERTAIN);
      expect(missesBefore).toBeGreaterThanOrEqual(0);
    }
  });

  it('works the same for the other team', () => {
    const world = game(undefined, visitor({ slot: 1 }));
    nextPeriod(world, [2, 0]);
    world.teams[1].mascot!.misses = CERTAIN;
    const events = nextPeriod(world, [2, 0]);
    expect(events).toContainEqual({ type: 'mascot', team: 1, player: 8, arrived: true });
    expect(isMascot(world, world.players[8]!)).toBe(true);
  });

  it('a missed roll adds one to the run of misses', () => {
    // Find a game whose opening roll misses: at 10% most do.
    const world = ['a', 'b', 'c', 'd'].map((seed) => game(visitor(), undefined, seed)).find((w) => w.teams[0].mascot!.arrivals === 0)!;
    expect(world.teams[0].mascot!.misses).toBe(1);
    const before = world.teams[0].mascot!.misses;
    // Level at the break: no roll, so the run does not move.
    nextPeriod(world, [1, 1]);
    expect(world.teams[0].mascot!.misses).toBe(before);
  });

  it('never arrives for overtime', () => {
    const world = game(visitor(), visitor());
    nextPeriod(world, [1, 1]);
    nextPeriod(world, [1, 1]);
    world.teams[0].mascot!.misses = CERTAIN;
    world.teams[1].mascot!.misses = CERTAIN;
    const arrivals = world.teams[0].mascot!.arrivals + world.teams[1].mascot!.arrivals;
    nextPeriod(world, [1, 1]);
    expect(world.overtime).toBe(true);
    expect(world.teams[0].mascot!.arrivals + world.teams[1].mascot!.arrivals).toBe(arrivals);
    expect(world.players.some((p) => isMascot(world, p))).toBe(false);
  });

  it('can come twice in a game: he goes home, then straight back', () => {
    const world = game(visitor({ misses: CERTAIN }));
    world.teams[0].mascot!.misses = CERTAIN;
    const events = nextPeriod(world, [0, 3]).filter((e) => e.type === 'mascot');
    expect(events).toEqual([
      { type: 'mascot', team: 0, player: 4, arrived: false },
      { type: 'mascot', team: 0, player: 4, arrived: true },
    ]);
    expect(world.teams[0].mascot!.arrivals).toBe(2);
    expect(isMascot(world, world.players[4]!)).toBe(true);
  });

  it('his goals are his own: the skater he replaced keeps his line, during the visit and after', () => {
    const world = game(visitor({ misses: CERTAIN }));
    const p = world.players[4]!;
    p.stats.goals += 2;
    let result = gameResult(world);
    expect(result.players[4]!.goals).toBe(0);
    expect(result.mascots?.[0]?.goals).toBe(2);
    expect(result.mascots?.[1]).toBeNull();
    nextPeriod(world, [0, 0]);
    p.stats.goals += 1;
    result = gameResult(world);
    expect(result.players[4]!.goals).toBe(1);
    expect(result.mascots?.[0]).toMatchObject({ goals: 2, arrivals: 1 });
  });

  it('a running boost is kept through his arrival and his leaving', () => {
    const world = game(visitor());
    nextPeriod(world, [0, 2]);
    world.teams[0].boosts = [{ id: 'test', name: 'Test', secondsLeft: 999, modifiers: [{ stat: 'topSpeedScale', op: 'mul', value: 1.5 }] }];
    world.teams[0].mascot!.misses = CERTAIN;
    nextPeriod(world, [0, 2]);
    const p = world.players[4]!;
    if (isMascot(world, p)) {
      expect(p.fx.topSpeedScale).toBeCloseTo(p.baseFx.topSpeedScale * 1.5);
    }
  });

  it('the same seed gives the same arrivals, and a whole game ends with a sensible count', () => {
    const run = (): GameResult => runGame('twice', team(visitor({ misses: 6 })), team(visitor({ misses: 6, slot: 2 })));
    const first = run();
    expect(run()).toEqual(first);
    for (const line of first.mascots!) {
      expect(line!.arrivals).toBeGreaterThanOrEqual(0);
      expect(line!.arrivals).toBeLessThanOrEqual(3);
      expect(line!.misses).toBeGreaterThanOrEqual(0);
    }
  });

  it('a mascot who never comes changes nothing about the game', () => {
    // Every roll has its own random stream, so the play itself is untouched.
    const seed = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].find((s) => runGame(s, team(visitor()), team(visitor())).mascots!.every((line) => line!.arrivals === 0))!;
    expect(seed).toBeDefined();
    const withThem = runGame(seed, team(visitor()), team(visitor()));
    const without = runGame(seed, team(), team());
    expect(withThem.score).toEqual(without.score);
    expect(withThem.players).toEqual(without.players);
  });
});

describe('the mascot in a season', () => {
  const fresh = (seed = 'mascot-season'): Franchise => newFranchise(generateLeague(seed));
  const atFirstGame = (seed?: string): Franchise => {
    const f = fresh(seed);
    startSeason(f);
    travel(f, availableStops(f).find((s) => s.kind === 'game' && !s.elite)!.id);
    return f;
  };
  const result = (mine: number, theirs: number, goals = 0): GameResult => ({
    score: [3, 1],
    winner: 0,
    finished: true,
    overtime: false,
    periods: 3,
    players: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: i, team: 0 as const, role: i === 6 ? ('goalie' as const) : ('skater' as const), line: (i >= 3 && i < 6 ? 1 : 0) as 0 | 1, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 })),
    powerupsUsed: [],
    mascots: [
      { goals, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 0, saves: 0, goalsAgainst: 0, arrivals: goals > 0 ? 1 : 0, misses: mine },
      { goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 0, saves: 0, goalsAgainst: 0, arrivals: 0, misses: theirs },
    ],
  });

  it('he takes the place of the lowest-rated dressed skater, never the goalie', () => {
    const f = fresh();
    const dressed = dressUser(f)!;
    const slot = sitsFor(dressed);
    const lowest = Math.min(...dressed.players.slice(0, 6).map((p) => p.overall));
    expect(slot).toBeLessThan(6);
    expect(dressed.players[slot]!.overall).toBe(lowest);
    const setup = mascotSetup(userMascot(f), dressed, 3);
    expect(setup).toMatchObject({ name: f.mascot.name, slot, misses: 3 });
  });

  it('while he visits he plays above any rating: the boosts are his own modifiers', () => {
    const f = fresh();
    const setup = mascotSetup(userMascot(f), dressUser(f)!, 0);
    expect(rules.visit.length).toBeGreaterThan(0);
    expect(setup.modifiers).toEqual(expect.arrayContaining(rules.visit));
    // On the ice only he has them.
    const world = createGame(t, 'visit', { human: false, teams: [{ ...uniformTeam(70), mascot: { ...setup, misses: CERTAIN } }, uniformTeam(70)] });
    const him = mascotPlayer(world, 0)!;
    const mate = world.players.find((p) => p.team === 0 && p.role === 'skater' && p.id !== him.id)!;
    expect(him.fx.topSpeedScale).toBeGreaterThan(mate.fx.topSpeedScale * 1.1);
    expect(him.fx.checkStrength).toBeGreaterThan(mate.fx.checkStrength * 1.3);
  });

  it('both sides bring one to a game, each with his own chance', () => {
    const f = atFirstGame();
    f.mascot.misses = 4;
    const m = matchup(f)!;
    expect(m.home.setup.mascot).toMatchObject({ misses: 4, name: f.mascot.name });
    expect(m.away.setup.mascot).toMatchObject({ misses: 0 });
    expect(m.mascots.home.chance).toBeCloseTo(0.3);
    expect(m.mascots.away.chance).toBeCloseTo(0.1);
    expect(m.mascots.home.sits).toBe(dressUser(f)!.players[sitsFor(dressUser(f)!)]!.name);
  });

  it('power does not change the chance', () => {
    const f = atFirstGame();
    const before = matchup(f)!.mascots.home.chance;
    f.mascot.costume = 5;
    f.facilities.den = 5;
    expect(mascotPower(f)).toBeGreaterThan(0);
    expect(matchup(f)!.mascots.home.chance).toBe(before);
  });

  it('after a game that was played, both runs of misses are remembered', () => {
    const f = atFirstGame();
    const opponent = currentStop(f)!.opponentId!;
    expect(recordGame(f, result(2, 3)).ok).toBe(true);
    expect(f.mascot.misses).toBe(2);
    expect(f.season.mascotMisses?.[opponent]).toBe(3);
  });

  it('a simulated game makes no roll and changes neither', () => {
    const f = atFirstGame();
    f.mascot.misses = 5;
    expect(simulateGame(f).ok).toBe(true);
    expect(f.mascot.misses).toBe(5);
    expect(f.season.mascotMisses ?? {}).toEqual({});
  });

  it('his goals earn nobody XP or a milestone', () => {
    const f = atFirstGame();
    recordGame(f, result(0, 1, 3));
    expect(f.season.hatTrick).toBe(false);
    expect(Object.values(f.season.playerGoals).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
