import { rngFrom, type RngState } from '../core/rng';
import type { World } from './types';

/**
 * A game as plain data, so it can be stored and picked up again: everything in a world is plain already
 * but its random generator, which is kept as its seed and its place in the stream.
 */
export type PackedWorld = Omit<World, 'rng'> & { rng: { seed: string; state: RngState } };

/** The world in a form that can be stored. It still shares its parts with the world: whoever keeps it copies it at once. */
export function packWorld(world: World): PackedWorld {
  const { rng, ...rest } = world;
  return { ...rest, rng: { seed: rng.seed, state: rng.state() } };
}

/** The world a stored copy stands for: stepped with the same inputs it goes exactly as the original would have. */
export function unpackWorld(packed: PackedWorld): World {
  const { rng, ...rest } = packed;
  return { ...rest, rng: rngFrom(rng.seed, rng.state) };
}

/** True if this looks like a stored game: enough to refuse something else before the simulation is handed it. */
export function looksPacked(value: unknown): value is PackedWorld {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { players?: unknown; puck?: unknown; score?: unknown; teams?: unknown; rng?: { seed?: unknown; state?: unknown } };
  return Array.isArray(v.players) && v.players.length > 0 && typeof v.puck === 'object' && Array.isArray(v.score) && Array.isArray(v.teams) && typeof v.rng?.seed === 'string' && Array.isArray(v.rng.state) && v.rng.state.length === 4;
}
