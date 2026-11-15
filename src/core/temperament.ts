import data from '../data/temperaments.json';
import type { Modifier } from '../sim/modifiers';
import type { PlayerRecord } from './player';
import { createRng } from './rng';

/**
 * A skater's temperament: one word about him that does something small on the ice, by the same
 * conditional modifiers artifacts use. It is worked out from who he is and never changes, so nothing
 * is stored and every player in an old save has one.
 */
export interface Temperament {
  id: string;
  name: string;
  describe: string;
  modifiers: Modifier[];
}

export const TEMPERAMENTS = data.temperaments as Temperament[];
const STEADY = TEMPERAMENTS.find((t) => t.id === 'steady') as Temperament;

/** A player's temperament. Goalies are all steady: the conditions are about skating, shooting and checking. */
export function temperamentOf(player: Pick<PlayerRecord, 'id' | 'position'>): Temperament {
  if (player.position === 'G') return STEADY;
  const weights = data.weights as Record<string, number>;
  const total = TEMPERAMENTS.reduce((sum, t) => sum + (weights[t.id] ?? 0), 0);
  let at = createRng(`temperament/${player.id}`).next() * total;
  for (const t of TEMPERAMENTS) {
    at -= weights[t.id] ?? 0;
    if (at < 0) return t;
  }
  return STEADY;
}

/** His temperament's modifiers, each carrying its name to show while it is in force. */
export function temperamentModifiers(player: Pick<PlayerRecord, 'id' | 'position'>): Modifier[] {
  const t = temperamentOf(player);
  return t.modifiers.map((m) => ({ ...m, label: t.name }));
}

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
