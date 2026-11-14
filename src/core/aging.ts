import data from '../data/aging.json';
import type { PlayerRecord } from './player';
import type { Rng } from './rng';
import { placePoints, regrade } from './xp';

/** Which phase of his career a player is in, from the design doc's aging table. */
export function agePhase(age: number): 'growth' | 'peak' | 'decline' | 'steep' {
  if (age >= data.steepFrom) return 'steep';
  if (age >= data.declineFrom) return 'decline';
  return age <= data.aiGrowth.youngMaxAge ? 'growth' : 'peak';
}

/**
 * One year older. From 31 speed and stamina (reflexes, for a goalie) drop; from 35 every rating drops,
 * those most and passing and positioning least. Once he is declining he has no more room to grow.
 * `declineScale` shrinks what is lost (a training centre does this): 0.6 means 40% less on average.
 */
export function ageOneYear(player: PlayerRecord, rng: Rng, declineScale = 1): void {
  player.age += 1;
  const phase = agePhase(player.age);
  if (phase !== 'decline' && phase !== 'steep') return;
  const table = data[phase];
  const ratings = player.ratings as unknown as Record<string, number>;
  for (const key of Object.keys(ratings)) {
    const range = data.fastRatings.includes(key) ? table.fast : data.slowRatings.includes(key) ? table.slow : table.normal;
    let drop = rng.int(range[0] as number, range[1] as number);
    if (declineScale !== 1) {
      // Scale the loss, rounding up or down by chance so the average comes out right.
      const scaled = drop * Math.max(0, declineScale);
      drop = Math.floor(scaled) + (rng.chance(scaled - Math.floor(scaled)) ? 1 : 0);
    }
    ratings[key] = Math.max(data.minRating, (ratings[key] as number) - drop);
  }
  regrade(player);
  player.potential = player.overall;
}

/** The chance a player of this age retires this off-season. */
export function retireChance(age: number): number {
  if (age >= data.retireAlways) return 1;
  if (age < data.retireFrom) return 0;
  return data.retireChance[Math.min(age - data.retireFrom, data.retireChance.length - 1)] as number;
}

export function retires(player: PlayerRecord, rng: Rng): boolean {
  return rng.chance(retireChance(player.age));
}

/**
 * A year of development for a player who does not play simulated games (everyone outside your team):
 * the young grow a few rating points, players in their prime a little, never past their potential.
 */
export function developOffIce(player: PlayerRecord, rng: Rng): void {
  const g = data.aiGrowth;
  const range = player.age <= g.youngMaxAge ? g.young : player.age <= g.primeMaxAge ? g.prime : null;
  if (!range) return;
  placePoints(player, rng.int(range[0] as number, range[1] as number));
}
