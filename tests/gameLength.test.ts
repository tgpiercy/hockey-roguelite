import { describe, expect, it } from 'vitest';
import { BOUNTIES, bountyFor, scaledBounty } from '../src/core/bounty';
import { generateLeague } from '../src/core/generate';
import { gameBounty, newFranchise, periodSecondsOf, setPeriodSeconds, startSeason, type Franchise } from '../src/core/season';
import bounties from '../src/data/bounties.json';
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

describe('bounties in a shorter or longer game', () => {
  it('every bounty that counts things has its number in its words', () => {
    for (const b of BOUNTIES) {
      const counts = (bounties.scaledKinds as string[]).includes(b.kind);
      expect(b.text.includes('{n}'), b.id).toBe(counts);
      const shown = scaledBounty(b, 1);
      expect(shown.text).not.toMatch(/[{}]/);
      if (counts) expect(shown.text).toContain(String(b.n));
    }
  });

  it('at the standard length nothing changes; half the length asks for about half, and never for nothing', () => {
    for (const b of BOUNTIES) {
      expect(scaledBounty(b, 1).n).toBe(b.n);
      const short = scaledBounty(b, 0.5);
      const long = scaledBounty(b, 1.5);
      if ((bounties.scaledKinds as string[]).includes(b.kind)) {
        expect(short.n).toBeGreaterThanOrEqual(1);
        expect(short.n).toBeLessThanOrEqual(b.n);
        expect(long.n).toBeGreaterThanOrEqual(b.n);
        expect(short.text).toContain(String(short.n));
      } else {
        expect(short.n).toBe(b.n);
        expect(long.n).toBe(b.n);
      }
    }
  });

  it('the same game has the same bounty at any length, asking for more or less of it', () => {
    const standard = bountyFor('season/3', true, 1);
    const short = bountyFor('season/3', true, 0.5);
    expect(short.id).toBe(standard.id);
    expect(short.pucks).toBe(standard.pucks);
  });

  it('the bounty on a season game follows the franchise length', () => {
    const f = started();
    const stop = Object.values(f.season.map!.stops).find((s) => s.kind === 'game' && !s.elite && s.region === 0)!;
    f.season.current = stop.id;
    f.season.stage = 'arrived';
    const standard = gameBounty(f)!;
    setPeriodSeconds(f, 60);
    const short = gameBounty(f)!;
    expect(short.id).toBe(standard.id);
    expect(short.n).toBeLessThanOrEqual(standard.n);
  });
});
