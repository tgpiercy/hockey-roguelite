import { describe, expect, it } from 'vitest';
import look from '../src/data/rinkLook.json';
import { Crowd } from '../src/game/drawArena';

const seat = (heads: boolean): Crowd => {
  const crowd = new Crowd(undefined, heads);
  crowd.layout(120, 80, 600, 250, 60, 844, 390, 34);
  return crowd;
};

describe('the crowd drawn as people', () => {
  it('holds up a few signs, for both clubs, each inside the picture', () => {
    const crowd = seat(true);
    crowd.move(1, 0.5, null, false);
    expect(crowd.signs.length).toBeGreaterThan(0);
    expect(crowd.signs.length).toBeLessThanOrEqual(look.signs.count);
    expect(new Set(crowd.signs.map((sign) => sign.team)).size).toBe(2);
    for (const sign of crowd.signs) {
      expect(sign.x).toBeGreaterThan(0);
      expect(sign.x).toBeLessThan(844);
      expect(sign.up).toBe(false);
    }
  });

  it("a side's signs are up while it is cheering, and only that side's", () => {
    const crowd = seat(true);
    crowd.move(1, 1, 0, false);
    for (const sign of crowd.signs) expect(sign.up).toBe(sign.team === 0);
  });

  it('the old crowd of squares holds none, and the same seats always give the same signs', () => {
    const squares = seat(false);
    squares.move(1, 0.5, null, false);
    expect(squares.signs).toHaveLength(0);
    const [a, b] = [seat(true), seat(true)];
    a.move(2, 0.5, null, true);
    b.move(2, 0.5, null, true);
    expect(a.signs).toEqual(b.signs);
  });

  it('every sign has words, and the card has a title for each period', () => {
    for (const words of look.signs.words) expect(words.length).toBeGreaterThan(3);
    expect(look.titleCard.titles).toHaveLength(3);
    expect(look.goalPanel.words.length).toBeGreaterThanOrEqual(3);
  });
});
