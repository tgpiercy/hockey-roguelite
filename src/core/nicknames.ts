import data from '../data/nicknames.json';
import { createRng } from './rng';

/** Nicknames earned on the ice or by long service, what a name may be, and what a retiring veteran leaves. */
export const NICKNAMES = data.nicknames;
export const NICKNAME_RULES = data.nicknameRules;
export const LEGACY = data.legacy;

/**
 * A nickname of a kind for a player: the same player always gets the same one, except that a name
 * somebody on the club already answers to (`taken`) is passed over while any other is left.
 */
export function nicknameFor(playerId: string, kind: keyof typeof data.nicknames, taken: readonly string[] = []): string {
  const all = data.nicknames[kind];
  const free = all.filter((name) => !taken.includes(name));
  return createRng(`nickname/${playerId}/${kind}`).pick(free.length > 0 ? free : all);
}

/** The nicknames already in use among these players. */
export function nicknamesOf(players: readonly ({ nickname?: string } | undefined)[]): string[] {
  return players.map((p) => p?.nickname).filter((x): x is string => typeof x === 'string');
}

/** A name as a player would be renamed to: trimmed, a sensible length, letters and the few marks names have. Null if it will not do. */
export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 24) return null;
  return /^[\p{L}][\p{L} .'-]*$/u.test(name) ? name : null;
}
