import { describe, expect, it } from 'vitest';
import {
  defaultGoalieRatings,
  defaultSkaterRatings,
  goalieEffects,
  skaterEffects,
  type GoalieRatings,
  type SkaterRatings,
} from '../src/sim/ratings';

const allSkater = (value: number): SkaterRatings => ({
  shooting: value,
  passing: value,
  speed: value,
  checking: value,
  puckControl: value,
  stamina: value,
});
const allGoalie = (value: number): GoalieRatings => ({ reflexes: value, positioning: value, reboundControl: value, stamina: value });

describe('ratings', () => {
  it('everyone is rated 70 by default', () => {
    expect(defaultSkaterRatings).toEqual(allSkater(70));
    expect(defaultGoalieRatings).toEqual(allGoalie(70));
  });

  it('a skater rated 70 gets exactly the plain physics values', () => {
    const fx = skaterEffects(allSkater(70));
    for (const scale of [fx.topSpeedScale, fx.accelerationScale, fx.passSpeedScale, fx.handleSpeedScale, fx.drainScale, fx.recoverScale]) {
      expect(scale).toBeCloseTo(1, 9);
    }
    expect(fx.shotPower).toBeCloseTo(0.7, 9);
    expect(fx.accuracy).toBeCloseTo(0.7, 9);
  });

  it('a higher skater rating is better for every effect', () => {
    const low = skaterEffects(allSkater(40));
    const high = skaterEffects(allSkater(90));
    for (const key of ['topSpeedScale', 'accelerationScale', 'shotPower', 'accuracy', 'passSpeedScale', 'checkStrength', 'puckSecurity', 'handleSpeedScale', 'recoverScale'] as const) {
      expect(high[key]).toBeGreaterThan(low[key]);
    }
    // Lower is better for these two.
    expect(high.passSpreadDegrees).toBeLessThan(low.passSpreadDegrees);
    expect(high.drainScale).toBeLessThan(low.drainScale);
  });

  it('each skater rating only moves its own effects', () => {
    const base = skaterEffects(allSkater(70));
    const fast = skaterEffects({ ...allSkater(70), speed: 95 });
    expect(fast.topSpeedScale).toBeGreaterThan(base.topSpeedScale);
    expect({ ...fast, topSpeedScale: 0, accelerationScale: 0 }).toEqual({ ...base, topSpeedScale: 0, accelerationScale: 0 });
  });

  it('a higher goalie rating is better for every effect', () => {
    const low = goalieEffects(allGoalie(40));
    const high = goalieEffects(allGoalie(90));
    expect(high.reactionSeconds).toBeLessThan(low.reactionSeconds);
    expect(high.lateralSpeed).toBeGreaterThan(low.lateralSpeed);
    expect(high.coverRadius).toBeGreaterThan(low.coverRadius);
    expect(high.freezeSpeed).toBeGreaterThan(low.freezeSpeed);
    expect(high.reboundKeep).toBeLessThan(low.reboundKeep);
  });

  it('ratings outside 0 to 100 are held at the ends', () => {
    expect(skaterEffects(allSkater(150))).toEqual(skaterEffects(allSkater(100)));
    expect(skaterEffects(allSkater(-20))).toEqual(skaterEffects(allSkater(0)));
  });
});
