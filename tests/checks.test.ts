import { describe, expect, it } from 'vitest';
import { givePuck } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT } from '../src/sim/types';
import { createWorld, step } from '../src/sim/world';
import { checkRate, measurePlay, measureSeasons } from './harness/checks';
import { clearIce, ID, place, player } from './helpers';

const t = cloneTuning();

describe('player switching on hold', () => {
  const setUp = (hold: boolean) => {
    const world = createWorld(t, 'hold', hold ? { holdSwitch: true } : {});
    clearIce(world, [ID.home1, ID.home2, ID.away1]);
    place(world, ID.home1, 0, 0, 0);
    place(world, ID.home2, 6, 4, 0);
    place(world, ID.away1, -20, -10, 0);
    return world;
  };

  it('automatic: control follows the puck to whoever of yours has it', () => {
    const world = setUp(false);
    expect(world.human!.controlled).toBe(ID.home1);
    givePuck(world, player(world, ID.home2));
    step(world, NO_INPUT, t);
    expect(world.human!.controlled).toBe(ID.home2);
  });

  it('hold: you keep your skater when a team-mate gets the puck, and he plays it himself', () => {
    const world = setUp(true);
    givePuck(world, player(world, ID.home2));
    for (let i = 0; i < 30; i++) step(world, NO_INPUT, t);
    expect(world.human!.controlled).toBe(ID.home1);
    // The team-mate is the AI's to drive: he does not stand still with it.
    const mate = player(world, ID.home2);
    expect(Math.hypot(mate.vel.x, mate.vel.y)).toBeGreaterThan(0.5);
  });

  it('hold: pressing switch still moves you, to the skater nearest the puck', () => {
    const world = setUp(true);
    givePuck(world, player(world, ID.home2));
    step(world, NO_INPUT, t);
    step(world, { ...NO_INPUT, switchPlayer: true }, t);
    expect(world.human!.controlled).toBe(ID.home2);
  });
});

describe('the measurements', () => {
  it('give the same numbers from the same seeds', () => {
    expect(measurePlay(2, 0.75, 'same')).toEqual(measurePlay(2, 0.75, 'same'));
    expect(checkRate('poke', true, 200)).toBe(checkRate('poke', true, 200));
  });

  it('on hold, control never follows the puck to a team-mate', () => {
    const report = measurePlay(3, 0.75, 'hold', true);
    expect(report.switchesPerGame.followedPuck).toBeLessThan(1);
    expect(measurePlay(3, 0.75, 'hold').switchesPerGame.followedPuck).toBeGreaterThan(5);
  });

  it('your own skater checks more surely than the AI, and a better checker more surely still', () => {
    for (const kind of ['poke', 'body'] as const) {
      const ai = checkRate(kind, false, 800);
      const you = checkRate(kind, true, 800);
      expect(you).toBeGreaterThan(ai);
    }
    expect(checkRate('body', true, 800, 85, 55)).toBeGreaterThan(checkRate('body', true, 800, 55, 85));
  });

  it('your own poke is settled by where you stand: the same spot always gives the same answer', () => {
    // Close and in front: every time. At full stretch: never.
    expect(checkRate('poke', true, 300, 70, 70, 2)).toBe(1);
    expect(checkRate('poke', true, 300, 70, 70, 3.6)).toBe(0);
    // At the edge of his reach a better checker gets there and a worse one does not.
    const edge = cloneTuning().checkAssist.pokeSureReach + 0.9;
    expect(checkRate('poke', true, 100, 90, 50, edge)).toBe(1);
    expect(checkRate('poke', true, 100, 50, 90, edge)).toBe(0);
    // The AI's poke is still a roll.
    const ai = checkRate('poke', false, 800, 70, 70, 2);
    expect(ai).toBeGreaterThan(0.15);
    expect(ai).toBeLessThan(0.5);
  });

  it('a whole season is played by the scripted player and comes to an end', () => {
    const report = measureSeasons(1, 'pro', 'one');
    expect(report.played).toBeGreaterThan(0);
    expect(report.wins).toBeLessThanOrEqual(report.played);
  }, 120_000);
});
