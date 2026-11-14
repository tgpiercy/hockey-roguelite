/**
 * One modifier system for everything that changes how a team plays: artifacts, powerups, boss traits,
 * event effects, and later gear and staff. A modifier is plain data naming a stat and how to change it.
 *
 * Stats the simulation reads are the fields of a skater's or goalie's abilities
 * (see SkaterEffects and GoalieEffects in ratings.ts), for example "topSpeedScale" or "reactionSeconds".
 * A modifier naming any other stat (such as "currencyGain") is ignored on the ice and read by the
 * season rules instead.
 */
export interface Modifier {
  stat: string;
  /** "add" adds the value; "mul" multiplies by it. All adds are applied before any multiplies. */
  op: 'add' | 'mul';
  value: number;
}

/** A powerup loaded for a game: a timed boost, or something that happens at once. */
export interface PowerupSpec {
  id: string;
  name: string;
  /** How long a timed boost lasts, in seconds of play. Left out or 0 for an instant powerup. */
  seconds?: number;
  /** The boost, for a timed powerup. */
  modifiers?: Modifier[];
  /** What an instant powerup does. */
  effect?: 'restoreLineEnergy' | 'restoreBenchEnergy' | 'restoreAllEnergy';
}

/** A boost that is running for a team. */
export interface Boost {
  id: string;
  name: string;
  modifiers: Modifier[];
  secondsLeft: number;
}

/** The value of one stat after a list of modifiers: (base + adds) x multiplies. */
export function modified(base: number, stat: string, modifiers: readonly Modifier[]): number {
  let add = 0;
  let mul = 1;
  for (const m of modifiers) {
    if (m.stat !== stat) continue;
    if (m.op === 'add') add += m.value;
    else mul *= m.value;
  }
  return (base + add) * mul;
}

/**
 * A copy of an abilities object with every modifier that names one of its fields applied.
 * Modifiers for stats the object does not have are left alone, so one list can carry skater,
 * goalie and season-level modifiers together.
 */
export function applyModifiers<T extends object>(base: T, modifiers: readonly Modifier[]): T {
  if (modifiers.length === 0) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (typeof value === 'number') out[key] = modified(value, key, modifiers);
  }
  return out as T;
}
