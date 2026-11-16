import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { newFranchise, periodSecondsOf, setPeriodSeconds, startSeason, type Franchise } from '../src/core/season';
import rules from '../src/data/season.json';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT } from '../src/sim/types';
import { createGame, step, STEPS_PER_SECOND } from '../src/sim/world';
import { uniformTeam } from './harness/harness';

const started = (): Franchise => {
  const f = newFranchise(generateLeague('length'));
  startSeason(f);
  return f;
};

describe('the length of a game', () => {
  it('the standard length is the one the tuning has, and is one of the choices', () => {
    expect(rules.standardPeriodSeconds).toBe(cloneTuning().period.seconds);
    expect(rules.periodLengths).toContain(rules.standardPeriodSeconds);
    expect([...rules.periodLengths].sort((a, b) => a - b)).toEqual(rules.periodLengths);
  });

  it('a franchise plays the standard length until told otherwise, and only the lengths offered can be set', () => {
    const f = started();
    expect(periodSecondsOf(f)).toBe(rules.standardPeriodSeconds);
    expect(setPeriodSeconds(f, 60).ok).toBe(true);
    expect(periodSecondsOf(f)).toBe(60);
    expect(setPeriodSeconds(f, 75).ok).toBe(false);
    expect(periodSecondsOf(f)).toBe(60);
    // The standard is stored as nothing at all, so an old save and a new one are alike.
    setPeriodSeconds(f, rules.standardPeriodSeconds);
    expect(f.periodSeconds).toBeUndefined();
    // A length that is no longer offered falls back to the standard.
    f.periodSeconds = 999;
    expect(periodSecondsOf(f)).toBe(rules.standardPeriodSeconds);
  });

  it('a shorter period makes a shorter game on the ice', () => {
    const length = (seconds: number): number => {
      const t = cloneTuning();
      t.period.seconds = seconds;
      const world = createGame(t, 'length', { human: false, teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5], overtimeLimit: 60 });
      let steps = 0;
      while (world.phase !== 'final' && steps < 60 * 60 * STEPS_PER_SECOND) {
        step(world, NO_INPUT, t);
        steps++;
      }
      return steps;
    };
    expect(length(60)).toBeLessThan(length(180));
  });
});
