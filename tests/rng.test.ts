import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

const take = (seed: number | string, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('seeded rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take('season-1', 50)).toEqual(take('season-1', 50));
    expect(take(42, 50)).toEqual(take('42', 50));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
  });

  it('next stays in [0, 1) and is roughly uniform', () => {
    const values = take('uniform', 20000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it('int covers its bounds, both included', () => {
    const rng = createRng('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(() => rng.int(5, 4)).toThrow();
    expect(() => rng.int(0.5, 4)).toThrow();
  });

  it('range stays inside its bounds', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
  });

  it('chance respects 0, 1 and a rate in between', () => {
    const rng = createRng('chance');
    let hits = 0;
    for (let i = 0; i < 10000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
      if (rng.chance(0.25)) hits++;
    }
    expect(hits).toBeGreaterThan(2200);
    expect(hits).toBeLessThan(2800);
  });

  it('pick returns a member and rejects an empty list', () => {
    const rng = createRng('pick');
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });

  it('shuffle keeps every item, leaves the input alone and is repeatable', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = createRng('shuffle').shuffle(items);
    const b = createRng('shuffle').shuffle(items);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('fork is repeatable, differs by label, and ignores the parent position', () => {
    const parent = createRng('run');
    const early = parent.fork('packs').next();
    for (let i = 0; i < 25; i++) parent.next();
    expect(parent.fork('packs').next()).toBe(early);
    expect(parent.fork('game-1').next()).not.toBe(early);

    const untouched = createRng('run');
    const disturbed = createRng('run');
    disturbed.fork('packs').next();
    expect(disturbed.next()).toBe(untouched.next());
  });
});
