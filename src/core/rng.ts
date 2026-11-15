/**
 * The project's only source of randomness. Every game, pack and season draws
 * from a generator made here, so anything can be replayed exactly from its seed.
 */
export interface Rng {
  /** The seed this generator was made from. */
  readonly seed: string;
  /** A float in [0, 1). */
  next(): number;
  /** An integer from min to max, both included. */
  int(min: number, max: number): number;
  /** A float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p (0 to 1). */
  chance(p: number): boolean;
  /** One item from a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy; the input is left alone. */
  shuffle<T>(items: readonly T[]): T[];
  /**
   * An independent generator derived from this one's seed and a label.
   * It does not depend on, or disturb, how far this generator has advanced.
   */
  fork(label: string): Rng;
  /** A separate generator that will give exactly the numbers this one is about to, without disturbing it. */
  clone(): Rng;
}

/** Hashes a string into four 32-bit seeds (xmur3). */
function hashSeed(text: string): [number, number, number, number] {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const nextHash = (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  return [nextHash(), nextHash(), nextHash(), nextHash()];
}

export function createRng(seed: number | string): Rng {
  const seedText = String(seed);
  const [a, b, c, d] = hashSeed(seedText);
  return generator(seedText, a, b, c, d, true);
}

/** A generator from a state. `mix` runs it on a little first, as a fresh one from a seed is. */
function generator(seedText: string, a0: number, b0: number, c0: number, d0: number, mix: boolean): Rng {
  let a = a0;
  let b = b0;
  let c = c0;
  let d = d0;

  // sfc32
  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  // Mix the state so similar seeds diverge straight away.
  if (mix) for (let i = 0; i < 12; i++) next();

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`rng.int: bad bounds ${min}..${max}`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    seed: seedText,
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick: empty list');
      return items[int(0, items.length - 1)] as T;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
    fork: (label) => createRng(`${seedText}/${label}`),
    clone: () => generator(seedText, a, b, c, d, false),
  };
}
