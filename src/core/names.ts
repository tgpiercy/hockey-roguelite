import data from '../data/names.json';
import type { Rng } from './rng';

/** Hands out invented player and team names, never the same one twice. */
export interface NameMaker {
  player(): string;
  team(): string;
}

export function createNameMaker(rng: Rng): NameMaker {
  const used = new Set<string>();

  const fresh = (make: () => string): string => {
    // With thousands of combinations a repeat is rare; a number is added only if luck runs out.
    for (let attempt = 0; attempt < 50; attempt++) {
      const name = make();
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    const fallback = `${make()} ${used.size}`;
    used.add(fallback);
    return fallback;
  };

  const surname = (): string => rng.pick(data.surnameStarts) + rng.pick(data.surnameMiddles) + rng.pick(data.surnameEnds);

  return {
    player: () => fresh(() => `${rng.pick(data.firstNames)} ${surname()}`),
    team: () => fresh(() => `${rng.pick(data.teamPlaces)} ${rng.pick(data.teamNouns)}`),
  };
}
