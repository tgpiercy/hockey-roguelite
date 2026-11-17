import { describe, expect, it } from 'vitest';
import { ratingChanges, ratingsOf, ratingWords } from '../src/core/ratingWords';
import gear from '../src/data/gear.json';
import words from '../src/data/ratingWords.json';
import { goalieEffects, skaterEffects, defaultGoalieRatings, defaultSkaterRatings } from '../src/sim/ratings';

describe('what ten points of a rating are worth, in words', () => {
  it('every rating of a skater and of a goalie has a sentence, with a wording for each thing it changes', () => {
    for (const side of ['skater', 'goalie'] as const) {
      expect(ratingsOf(side).length).toBeGreaterThan(3);
      for (const rating of ratingsOf(side)) {
        expect((gear.ratingNames as Record<string, string>)[rating] ?? (rating === 'stamina' ? 'Stamina' : undefined), rating).toBeDefined();
        const changes = ratingChanges(side, rating);
        expect(changes.length, rating).toBeGreaterThan(0);
        for (const change of changes) {
          expect((words.effects as Record<string, string>)[change.effect], change.effect).toBeDefined();
          expect(Number.isFinite(change.change)).toBe(true);
          expect(Math.abs(change.change), change.effect).toBeGreaterThan(0.005);
          expect(Math.abs(change.change), change.effect).toBeLessThan(0.6);
        }
        const sentence = ratingWords(side, rating);
        expect(sentence).toMatch(/^From 70 to 80: /);
        expect(sentence).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it('the numbers are the ice\'s own: ten points of speed is the same share the simulation gives', () => {
    const slow = skaterEffects({ ...defaultSkaterRatings, speed: words.from });
    const fast = skaterEffects({ ...defaultSkaterRatings, speed: words.to });
    const speed = ratingChanges('skater', 'speed').find((c) => c.effect === 'topSpeedScale')!;
    expect(speed.change).toBeCloseTo(fast.topSpeedScale / slow.topSpeedScale - 1, 6);
    const dull = goalieEffects({ ...defaultGoalieRatings, reflexes: words.from });
    const quick = goalieEffects({ ...defaultGoalieRatings, reflexes: words.to });
    const react = ratingChanges('goalie', 'reflexes').find((c) => c.effect === 'reactionSeconds')!;
    expect(react.change).toBeCloseTo(quick.reactionSeconds / dull.reactionSeconds - 1, 6);
    // Better is quicker: the time he takes goes down, and the sentence says so.
    expect(react.change).toBeLessThan(0);
    expect(ratingWords('goalie', 'reflexes')).toContain('the time he takes to react down');
  });

  it('a better shooter shoots harder and strays less', () => {
    const shot = ratingChanges('skater', 'shooting');
    expect(shot.find((c) => c.effect === 'shotPower')!.change).toBeGreaterThan(0);
    expect(shot.find((c) => c.effect === 'accuracy')!.change).toBeLessThan(0);
  });
});
