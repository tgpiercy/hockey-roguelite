import { describe, expect, it } from 'vitest';
import { gameResult } from '../src/sim/match';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createGame, step, STEPS_PER_SECOND } from '../src/sim/world';
import { ID, player } from './helpers';

/** Short periods so whole games run quickly; everything else as shipped. */
const quick = () => {
  const t = cloneTuning();
  t.period.seconds = 5;
  t.period.breakSeconds = 0.5;
  return t;
};
const t = quick();

const run = (world: World, seconds: number, input: InputFrame = NO_INPUT, tuning = t): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) events.push(...step(world, input, tuning));
  return events;
};

/** Steps until the phase changes away from the one it is in now (or gives up after a minute). */
const runUntilPhaseChanges = (world: World, input: InputFrame = NO_INPUT): SimEvent[] => {
  const events: SimEvent[] = [];
  const phase = world.phase;
  for (let i = 0; i < 60 * STEPS_PER_SECOND && world.phase === phase; i++) events.push(...step(world, input, t));
  return events;
};

/** Parks every skater so nothing happens on the ice: the clock is the only thing moving. */
const freeze = (world: World): void => {
  for (const p of world.players) if (p.role === 'skater') p.stagger = 9999;
};

const press: InputFrame = { ...NO_INPUT, pass: true };

describe('faceoff duel', () => {
  const human = (): World => createGame(t, 'duel', { levels: [0.5, 0] });
  const untilDrop = (world: World, input: InputFrame = NO_INPUT): void => {
    for (let i = 0; i < 10 * STEPS_PER_SECOND && world.faceoff && !world.faceoff.dropped; i++) step(world, input, t);
  };

  it('starts lined up at centre with the puck held and nobody moving', () => {
    const world = human();
    expect(world.phase).toBe('faceoff');
    expect(world.puck.pos).toEqual({ x: 0, y: 0 });
    const before = world.players.map((p) => ({ ...p.pos }));
    run(world, 0.5);
    expect(world.players.map((p) => ({ ...p.pos }))).toEqual(before);
    expect(world.puck.pos).toEqual({ x: 0, y: 0 });
    expect(world.human?.controlled).toBe(ID.home1);
  });

  it('the clock does not run during the faceoff', () => {
    const world = human();
    run(world, 0.5);
    expect(world.clock).toBe(t.period.seconds);
  });

  it('pressing first after the drop wins the draw back to a winger, and control goes with it', () => {
    const world = human();
    untilDrop(world);
    const events = run(world, 1 / STEPS_PER_SECOND, press);
    expect(events).toEqual([{ type: 'faceoff', winner: 0 }]);
    expect(world.phase).toBe('play');
    expect([ID.home2, ID.home3]).toContain(world.puck.passTarget);
    expect(world.human?.controlled).toBe(world.puck.passTarget);
    expect(world.puck.vel.x).toBeLessThan(0);
  });

  it('pressing before the drop is a false start: the other centre wins', () => {
    const world = human();
    run(world, 0.2, press);
    run(world, 0.1);
    untilDrop(world);
    // Press again the instant it drops: still locked out.
    const events = [...run(world, 1 / STEPS_PER_SECOND, press), ...run(world, 1.2)];
    expect(events.find((e) => e.type === 'faceoff')).toEqual({ type: 'faceoff', winner: 1 });
  });

  it('holding the button down through the drop does not count as a press', () => {
    const world = createGame(t, 'held', { levels: [0.5, 0.5] });
    world.faceoff!.aiDelay = [9, 9];
    untilDrop(world, press);
    const events = run(world, 0.3, press);
    expect(events).toEqual([]);
    expect(world.phase).toBe('faceoff');
  });

  it('if nobody goes for it, the puck lies loose and play starts', () => {
    const world = createGame(t, 'nobody', { levels: [0.5, 0.5] });
    world.faceoff!.aiDelay = [9, 9];
    untilDrop(world);
    const events = run(world, t.faceoff.windowSeconds + 0.1);
    expect(events).toContainEqual({ type: 'faceoff', winner: null });
    expect(world.phase).toBe('play');
    expect(world.puck.passTarget).toBe(null);
  });

  it('between two AI centres, the sharper one usually wins', () => {
    let hardWins = 0;
    for (let i = 0; i < 40; i++) {
      const world = createGame(t, `ai-duel-${i}`, { human: false, levels: [1, 0] });
      const events = runUntilPhaseChanges(world);
      if (events.some((e) => e.type === 'faceoff' && e.winner === 0)) hardWins++;
    }
    expect(hardWins).toBeGreaterThan(30);
  });
});

describe('periods and the clock', () => {
  const quiet = (seed: string): World => {
    const world = createGame(t, seed, { human: false, levels: [0.5, 0.5] });
    runUntilPhaseChanges(world);
    freeze(world);
    return world;
  };

  it('the clock counts down during play', () => {
    const world = quiet('clock');
    const start = world.clock;
    run(world, 2);
    expect(world.clock).toBeCloseTo(start - 2, 5);
  });

  it('a period ends when the clock reaches zero, then the next starts with a faceoff', () => {
    const world = quiet('period');
    const events = run(world, t.period.seconds + 0.1);
    expect(world.phase).toBe('break');
    expect(world.clock).toBe(0);
    expect(world.period).toBe(1);
    events.push(...run(world, t.period.breakSeconds + 0.1));
    expect(events).toContainEqual({ type: 'period', period: 2 });
    expect(world.phase).toBe('faceoff');
    expect(world.clock).toBe(t.period.seconds);
  });

  /** Plays the frozen game through to the end of the third period with a given score. */
  const toEndOfThird = (seed: string, score: [number, number]): { world: World; events: SimEvent[] } => {
    const world = quiet(seed);
    world.score = score;
    const events: SimEvent[] = [];
    for (let guard = 0; guard < 20 && world.phase !== 'final' && !world.overtime; guard++) {
      events.push(...runUntilPhaseChanges(world));
      freeze(world);
    }
    return { world, events };
  };

  it('a game that is not tied ends after three periods', () => {
    const { world, events } = toEndOfThird('untied', [2, 1]);
    expect(world.phase).toBe('final');
    expect(world.period).toBe(3);
    expect(events).toContainEqual({ type: 'final' });
    const result = gameResult(world);
    expect(result).toMatchObject({ finished: true, winner: 0, overtime: false, periods: 3, score: [2, 1] });
    // Nothing more happens once it is over.
    const tick = world.tick;
    expect(run(world, 1)).toEqual([]);
    expect(world.tick).toBe(tick);
  });

  it('a tied game goes to overtime, which ends on the next goal', () => {
    const { world } = toEndOfThird('tied', [1, 1]);
    expect(world.overtime).toBe(true);
    runUntilPhaseChanges(world);
    expect(world.phase).toBe('faceoff');
    expect(world.period).toBe(4);
    runUntilPhaseChanges(world);
    freeze(world);
    run(world, 3);
    expect(world.phase).toBe('play');
    expect(world.clock).toBeCloseTo(3, 1);

    // Team 1 scores in the left net.
    world.puck.carrier = null;
    world.puck.pos = { x: -20, y: 0.3 };
    world.puck.vel = { x: -30, y: 0 };
    player(world, ID.homeGoalie).pos = { x: -20, y: 10 };
    const events = run(world, t.game.goalPauseSeconds + 0.5);
    expect(events.some((e) => e.type === 'goal' && e.team === 1)).toBe(true);
    expect(world.phase).toBe('final');
    expect(gameResult(world)).toMatchObject({ finished: true, winner: 1, overtime: true, score: [1, 2] });
  });

  it('with an overtime limit, a scoreless overtime ends in a tie', () => {
    const world = createGame(t, 'limit', { human: false, levels: [0.5, 0.5], overtimeLimit: 2 });
    world.score = [0, 0];
    for (let guard = 0; guard < 30 && world.phase !== 'final'; guard++) {
      runUntilPhaseChanges(world);
      freeze(world);
    }
    expect(world.phase).toBe('final');
    expect(gameResult(world)).toMatchObject({ finished: true, winner: null, overtime: true });
  });

  it('after a goal in regulation, the clock stops and play restarts with a faceoff', () => {
    const world = quiet('restart');
    world.puck.pos = { x: 20, y: 0.3 };
    world.puck.vel = { x: 30, y: 0 };
    player(world, ID.awayGoalie).pos = { x: 20, y: 10 };
    run(world, 0.2);
    expect(world.phase).toBe('goal');
    const clock = world.clock;
    run(world, t.game.goalPauseSeconds + 0.1);
    expect(world.phase).toBe('faceoff');
    expect(world.clock).toBe(clock);
    expect(world.score).toEqual([1, 0]);
  });
});
