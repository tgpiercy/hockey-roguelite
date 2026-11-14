import { describe, expect, it } from 'vitest';
import { capHitOf, gradeOf, overallOf, rate } from '../src/core/player';
import table from '../src/data/grades.json';
import weights from '../src/data/overallWeights.json';
import type { GoalieRatings, SkaterRatings } from '../src/sim/ratings';

const skater = (value: number, over: Partial<SkaterRatings> = {}): SkaterRatings => ({
  shooting: value,
  passing: value,
  speed: value,
  checking: value,
  puckControl: value,
  stamina: value,
  ...over,
});
const goalie = (value: number, over: Partial<GoalieRatings> = {}): GoalieRatings => ({
  reflexes: value,
  positioning: value,
  reboundControl: value,
  stamina: value,
  ...over,
});

describe('overall rating', () => {
  it('a player with every rating the same has that overall, whatever his position', () => {
    expect(overallOf('F', skater(72))).toBe(72);
    expect(overallOf('D', skater(72))).toBe(72);
    expect(overallOf('G', goalie(72))).toBe(72);
  });

  it('is the weighted average of the ratings', () => {
    // Forward: shooting counts for a quarter, so +20 shooting is +5 overall.
    expect(overallOf('F', skater(70, { shooting: 90 }))).toBe(75);
    // Defenceman: checking counts for a quarter.
    expect(overallOf('D', skater(70, { checking: 90 }))).toBe(75);
    // Goalie: reflexes count for 40%.
    expect(overallOf('G', goalie(70, { reflexes: 90 }))).toBe(78);
  });

  it('shooting matters more for a forward, checking more for a defenceman', () => {
    const shooter = skater(70, { shooting: 95 });
    const checker = skater(70, { checking: 95 });
    expect(overallOf('F', shooter)).toBeGreaterThan(overallOf('D', shooter));
    expect(overallOf('D', checker)).toBeGreaterThan(overallOf('F', checker));
  });

  it('the weights for each position add up to 1', () => {
    for (const position of ['F', 'D', 'G'] as const) {
      const total = Object.values(weights[position]).reduce((s, w) => s + w, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });
});

describe('grades', () => {
  it('follows the design doc bands', () => {
    expect(gradeOf(99)).toBe('S');
    expect(gradeOf(95)).toBe('S');
    expect(gradeOf(94)).toBe('A+');
    expect(gradeOf(92)).toBe('A+');
    expect(gradeOf(91)).toBe('A');
    expect(gradeOf(88)).toBe('A');
    expect(gradeOf(87)).toBe('B+');
    expect(gradeOf(83)).toBe('B+');
    expect(gradeOf(82)).toBe('B');
    expect(gradeOf(78)).toBe('B');
    expect(gradeOf(77)).toBe('C+');
    expect(gradeOf(72)).toBe('C+');
    expect(gradeOf(71)).toBe('C');
    expect(gradeOf(65)).toBe('C');
    expect(gradeOf(64)).toBe('D');
    expect(gradeOf(0)).toBe('D');
  });
});

describe('cap hit', () => {
  it('matches the design doc at the edges of each grade', () => {
    expect(capHitOf(95)).toBe(11_000_000);
    expect(capHitOf(88)).toBe(8_000_000);
    expect(capHitOf(78)).toBe(4_000_000);
    expect(capHitOf(65)).toBe(1_500_000);
    expect(capHitOf(40)).toBe(800_000);
    expect(capHitOf(10)).toBe(800_000);
  });

  it('stays inside its grade range for every overall', () => {
    for (let overall = 0; overall <= 100; overall++) {
      const band = table.grades.find((g) => g.grade === gradeOf(overall))!;
      const cap = capHitOf(overall);
      expect(cap).toBeGreaterThanOrEqual(band.capMin);
      expect(cap).toBeLessThanOrEqual(band.capMax);
    }
  });

  it('never falls as overall rises, and is a round number', () => {
    let last = 0;
    for (let overall = 0; overall <= 100; overall++) {
      const cap = capHitOf(overall);
      expect(cap).toBeGreaterThanOrEqual(last);
      expect(cap % table.capRounding).toBe(0);
      last = cap;
    }
  });

  it('an S-grade star costs at least $11M', () => {
    expect(capHitOf(97)).toBeGreaterThanOrEqual(11_000_000);
  });
});

describe('rate', () => {
  it('fills in overall, grade and cap hit from the ratings', () => {
    const rated = rate({ position: 'F' as const, ratings: skater(80) });
    expect(rated).toMatchObject({ overall: 80, grade: 'B', capHit: capHitOf(80) });
  });
});
