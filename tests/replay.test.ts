import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { copyWorld, goalOfTheGame, Recorder, type GoalNote } from '../src/game/replay';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type World } from '../src/sim/types';
import { createGame, step } from '../src/sim/world';
import { uniformTeam } from './harness/harness';

const t = cloneTuning();
/** Everything about a world that can be compared: all of it but the random generator, plus what that would give next. */
const picture = (world: World): string => {
  const { rng, ...rest } = world;
  return JSON.stringify({ rest, next: rng.clone().next() });
};
/** A scripted player: skates about, shoots, passes and checks on a pattern, so the inputs matter. */
const script = (tick: number): InputFrame => ({
  ...NO_INPUT,
  moveX: Math.cos(tick / 37),
  moveY: Math.sin(tick / 53),
  shoot: tick % 90 > 60,
  pass: tick % 70 === 5,
  check: tick % 45 < 6,
  sprint: tick % 200 < 80,
});

describe('a copied random generator', () => {
  it('gives the same numbers as the original from then on, and does not disturb it', () => {
    const rng = createRng('copy');
    for (let i = 0; i < 17; i++) rng.next();
    const copy = rng.clone();
    const fromCopy = Array.from({ length: 20 }, () => copy.next());
    const fromOriginal = Array.from({ length: 20 }, () => rng.next());
    expect(fromCopy).toEqual(fromOriginal);
    expect(copy.fork('x').next()).toBe(rng.fork('x').next());
    expect(createRng('copy').next()).toBe(createRng('copy').clone().next());
  });
});

describe('a copied world', () => {
  it('shares nothing: stepping the copy leaves the original alone', () => {
    const world = createGame(t, 'copy', { human: false, teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5] });
    for (let i = 0; i < 300; i++) step(world, NO_INPUT, t);
    const before = picture(world);
    const copy = copyWorld(world);
    expect(picture(copy)).toBe(before);
    for (let i = 0; i < 300; i++) step(copy, NO_INPUT, t);
    expect(picture(world)).toBe(before);
    expect(picture(copy)).not.toBe(before);
  });
});

describe('re-running a stretch of play', () => {
  const run = (human: boolean, seed: string): void => {
    const world = createGame(t, seed, { human, teams: [uniformTeam(72), uniformTeam(68)], levels: [0.5, 0.5] });
    const recorder = new Recorder(1, 8);
    const pictures = new Map<number, string>();
    let checked = 0;
    for (let i = 0; i < 60 * 150 && world.phase !== 'final'; i++) {
      const input = human ? script(world.tick) : NO_INPUT;
      recorder.before(world, input, NO_INPUT);
      pictures.set(world.tick, picture(world));
      step(world, input, t);
      // Every few seconds: the last four seconds, run again from the recorder, must end exactly here.
      if (i > 600 && i % 211 === 0) {
        const clip = recorder.clip(world.tick - 240, world.tick);
        expect(clip, `tick ${world.tick}`).not.toBeNull();
        const again = clip!.start;
        expect(picture(again)).toBe(pictures.get(again.tick));
        for (const [a, b] of clip!.inputs) step(again, a, t, b);
        expect(again.tick).toBe(world.tick);
        expect(picture(again), `tick ${world.tick}`).toBe(picture(world));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  };

  it('an all-AI game replays exactly', () => run(false, 'replay-ai'));
  it('a game with a player\'s inputs replays exactly', () => run(true, 'replay-human'));

  it('does not reach further back than it keeps, and keeps only what it needs', () => {
    const world = createGame(t, 'keep', { human: false, teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5] });
    const recorder = new Recorder(1, 4);
    expect(recorder.clip(0, 10)).toBeNull();
    for (let i = 0; i < 60 * 30; i++) {
      recorder.before(world, NO_INPUT, NO_INPUT);
      step(world, NO_INPUT, t);
    }
    const clip = recorder.clip(world.tick - 60 * 3, world.tick)!;
    expect(clip.inputs.length).toBeGreaterThanOrEqual(180);
    expect(clip.inputs.length).toBeLessThan(180 + 61);
    // Asking for long ago gives the oldest it still has, never more than it keeps (and a second's slack).
    const old = recorder.clip(0, world.tick)!;
    expect(old.inputs.length).toBeLessThanOrEqual(60 * 6);
  });
});

describe('the goal of the game', () => {
  const goal = (team: 0 | 1, score: [number, number], over: Partial<GoalNote> = {}): GoalNote => ({ team, score, overtime: false, oneTimer: false, ...over });

  it('is an overtime winner, else the last one-timer, else the goal that last changed the lead, else the last', () => {
    expect(goalOfTheGame([])).toBeNull();
    expect(goalOfTheGame([goal(0, [1, 0], { oneTimer: true }), goal(1, [1, 1]), goal(1, [1, 2], { overtime: true })])).toBe(2);
    expect(goalOfTheGame([goal(0, [1, 0], { oneTimer: true }), goal(0, [2, 0]), goal(0, [3, 0])])).toBe(0);
    // 1-0, 1-1 (level, not a lead), 1-2 (they go ahead), 1-3: the lead last changed at 1-2.
    expect(goalOfTheGame([goal(0, [1, 0]), goal(1, [1, 1]), goal(1, [1, 2]), goal(1, [1, 3])])).toBe(2);
    expect(goalOfTheGame([goal(0, [1, 0]), goal(0, [2, 0])])).toBe(0);
  });
});
