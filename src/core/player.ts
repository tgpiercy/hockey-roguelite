import table from '../data/grades.json';
import weights from '../data/overallWeights.json';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';

export type Position = 'F' | 'D' | 'G';
export type Grade = 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D';

export interface PlayerRecord {
  /** Unique in the league, for example "p-0042". */
  id: string;
  name: string;
  position: Position;
  age: number;
  /** Skater ratings for F and D, goalie ratings for G. Each 0 to 100. */
  ratings: SkaterRatings | GoalieRatings;
  /** Hidden: the highest overall he can reach. */
  potential: number;
  overall: number;
  grade: Grade;
  /** Dollars a year. Set when a contract is signed; it does not move as his ratings change. */
  capHit: number;
  contractYears: number;
  /** XP toward the next level, and the level reached. */
  xp: number;
  level: number;
  /** The id of the talent he carries (see talents.json), if any. Left out for most players. */
  talent?: string;
  /** Rating points earned by levelling up and not yet spent. Left out when there are none. */
  points?: number;
}

export function isGoalie(p: PlayerRecord): boolean {
  return p.position === 'G';
}

/** Overall rating: a weighted average of the ratings, with different weights for forwards, defencemen and goalies. */
export function overallOf(position: Position, ratings: SkaterRatings | GoalieRatings): number {
  const w = weights[position] as Record<string, number>;
  const r = ratings as unknown as Record<string, number>;
  let total = 0;
  let weight = 0;
  for (const key of Object.keys(w)) {
    total += (r[key] ?? 0) * (w[key] as number);
    weight += w[key] as number;
  }
  return Math.round(total / weight);
}

/** The letter grade for an overall rating. */
export function gradeOf(overall: number): Grade {
  for (const band of table.grades) if (overall >= band.min) return band.grade as Grade;
  return 'D';
}

/**
 * Cap hit for an overall rating: each grade has a pay range, and pay rises in a straight line
 * from the bottom of the grade's ratings to the top.
 */
export function capHitOf(overall: number): number {
  const index = table.grades.findIndex((band) => overall >= band.min);
  const band = table.grades[index === -1 ? table.grades.length - 1 : index]!;
  const top = index <= 0 ? 100 : table.grades[index - 1]!.min;
  const bottom = Math.max(band.min, table.floorOverall);
  const share = Math.max(0, Math.min(1, (overall - bottom) / (top - bottom)));
  const raw = band.capMin + (band.capMax - band.capMin) * share;
  return Math.round(raw / table.capRounding) * table.capRounding;
}

/** Fills in the values that follow from a player's ratings: overall, grade and cap hit. */
export function rate<T extends Pick<PlayerRecord, 'position' | 'ratings'>>(p: T): T & Pick<PlayerRecord, 'overall' | 'grade' | 'capHit'> {
  const overall = overallOf(p.position, p.ratings);
  return { ...p, overall, grade: gradeOf(overall), capHit: capHitOf(overall) };
}
