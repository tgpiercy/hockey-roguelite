import physics from '../data/physics.json';
import table from '../data/ratings.json';
import words from '../data/ratingWords.json';

type Side = 'skater' | 'goalie';

/** A rating's effect at a value: a straight line from its value at 0 to its value at 100, as on the ice. */
function at(pair: readonly number[], rating: number): number {
  const k = Math.max(0, Math.min(100, rating)) / 100;
  return (pair[0] as number) + ((pair[1] as number) - (pair[0] as number)) * k;
}

/**
 * What an effect comes to on the ice. Most are used as they stand; a shot's power and accuracy are numbers
 * from 0 to 1 that the ice turns into a speed and a scatter, so those are given as the speed and the scatter.
 */
function felt(effect: string, value: number): number {
  const s = physics.shot;
  if (effect === 'shotPower') return s.powerFloor + (1 - s.powerFloor) * value;
  if (effect === 'accuracy') return s.maxSpreadDegrees + (s.minSpreadDegrees - s.maxSpreadDegrees) * value;
  return value;
}

/** One thing a rating changes, and by how much when the rating goes from `words.from` to `words.to`. */
export interface RatingChange {
  effect: string;
  /** What it is, in the player's words. */
  label: string;
  /** The change as a share of what it was: 0.03 is 3% more, -0.1 is 10% less. */
  change: number;
}

/** The ratings a skater or a goalie has, in the table's order. */
export function ratingsOf(side: Side): string[] {
  return Object.keys(table[side]);
}

/** What ten points of a rating change on the ice, each as a share of its value at the lower rating. */
export function ratingChanges(side: Side, rating: string): RatingChange[] {
  const effects = (table[side] as Record<string, Record<string, number[]>>)[rating] ?? {};
  const labels = words.effects as Record<string, string>;
  return Object.entries(effects)
    .filter(([effect]) => !words.skip.includes(effect))
    .map(([effect, pair]) => {
      const low = felt(effect, at(pair, words.from));
      const high = felt(effect, at(pair, words.to));
      return { effect, label: labels[effect] ?? effect, change: (high - low) / Math.abs(low) };
    });
}

/** The same in a sentence, as "From 70 to 80: top speed and acceleration up 2%; ...". */
export function ratingWords(side: Side, rating: string): string {
  const parts = ratingChanges(side, rating).map((c) => `${c.label} ${c.change >= 0 ? 'up' : 'down'} ${Math.max(1, Math.round(Math.abs(c.change) * 100))}%`);
  return `From ${words.from} to ${words.to}: ${parts.join('; ')}.`;
}
