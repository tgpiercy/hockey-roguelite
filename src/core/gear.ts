import data from '../data/gear.json';
import perks from '../data/perks.json';
import sets from '../data/sets.json';
import { modified, type Modifier } from '../sim/modifiers';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';
import { playerSalePrice } from './economy';
import { book } from './ledger';
import { playerOf, userTeam } from './league';
import type { PlayerRecord } from './player';
import type { Rng } from './rng';
import { release, type MoveResult } from './roster';
import type { Franchise } from './season';

export type RarityId = 'common' | 'rare' | 'epic' | 'legendary';
export type GearKind = 'skater' | 'goalie';

/** One piece of gear. Owned by the team; `wornBy` says which player has it on, if any. */
export interface GearItem {
  id: string;
  kind: GearKind;
  slot: string;
  rarity: RarityId;
  /** The ratings it boosts. Each gets the same number of points, set by rarity and level. */
  boosts: string[];
  /** Perk id, for Epic and Legendary pieces. */
  perk: string | null;
  /** Set id, if it belongs to one. */
  set: string | null;
  /** 1 to 5. */
  level: number;
  wornBy: string | null;
}

export interface RarityInfo {
  id: RarityId;
  name: string;
  chance: number;
  minBoosts: number;
  maxBoosts: number;
  points: number;
  perk: string;
  setChance: number;
  scrap: number;
  levelCost: number[];
}

export const RARITIES = data.rarities as RarityInfo[];
const rarityIndex = (id: RarityId): number => RARITIES.findIndex((r) => r.id === id);

export function rarityInfo(id: RarityId): RarityInfo {
  return RARITIES[rarityIndex(id)] ?? RARITIES[0]!;
}

export function setInfo(id: string) {
  return sets.find((s) => s.id === id) ?? null;
}

export function perkInfo(item: GearItem): { name: string; description: string; modifiers: Modifier[] } | null {
  if (!item.perk) return null;
  const perk = perks.find((p) => p.id === item.perk);
  if (!perk) return null;
  const tier = item.rarity === 'legendary' ? perk.legendary : perk.epic;
  return { name: perk.name, description: tier.description, modifiers: tier.modifiers as Modifier[] };
}

/**
 * The drop table with every rarity above Common made `boost` times likelier (prestige does this),
 * and Common taking up the rest. Common is never squeezed below a floor.
 */
export function rarityTable(boost = 1, commonFloor = 0): RarityInfo[] {
  if (boost === 1) return RARITIES;
  const better = RARITIES.slice(1).map((r) => ({ ...r, chance: r.chance * boost }));
  const total = better.reduce((sum, r) => sum + r.chance, 0);
  const scale = total > 1 - commonFloor ? (1 - commonFloor) / total : 1;
  const scaled = better.map((r) => ({ ...r, chance: r.chance * scale }));
  return [{ ...RARITIES[0]!, chance: 1 - scaled.reduce((sum, r) => sum + r.chance, 0) }, ...scaled];
}

/** Rolls a rarity from the drop table. With a minimum, only that rarity and better can come up. */
export function rollRarity(rng: Rng, minimum: RarityId | '' = '', table: RarityInfo[] = RARITIES): RarityId {
  const from = minimum === '' ? 0 : rarityIndex(minimum);
  const pool = table.slice(from);
  const total = pool.reduce((sum, r) => sum + r.chance, 0);
  let pick = rng.next() * total;
  for (const r of pool) {
    pick -= r.chance;
    if (pick < 0) return r.id;
  }
  return pool[pool.length - 1]!.id;
}

/** Makes one piece of gear of a given rarity: a random slot, boosts its slot allows, and maybe a set and a perk. */
export function generateItem(rng: Rng, id: string, rarity: RarityId, kind?: GearKind): GearItem {
  const info = rarityInfo(rarity);
  const itemKind: GearKind = kind ?? (rng.chance(data.goalieShare) ? 'goalie' : 'skater');
  const slot = rng.pick(data.slots[itemKind]);
  const allowed = (data.slotRatings as Record<string, string[]>)[slot] as string[];

  const setPool = sets.filter((s) => s.kind === itemKind);
  const set = setPool.length > 0 && rng.chance(info.setChance) ? rng.pick(setPool) : null;

  // A set piece leads with its set's rating where the slot allows it.
  const count = Math.min(allowed.length, rng.int(info.minBoosts, info.maxBoosts));
  const order = rng.shuffle(allowed);
  if (set && allowed.includes(set.rating)) {
    order.splice(order.indexOf(set.rating), 1);
    order.unshift(set.rating);
  }
  const perkPool = perks.filter((p) => p.kind === itemKind);
  return {
    id,
    kind: itemKind,
    slot,
    rarity,
    boosts: order.slice(0, count),
    perk: info.perk !== '' && perkPool.length > 0 ? rng.pick(perkPool).id : null,
    set: set ? set.id : null,
    level: 1,
    wornBy: null,
  };
}

/** Points each boost on this piece is worth: set by rarity, plus one for every level above 1. */
export function boostPoints(item: GearItem): number {
  return rarityInfo(item.rarity).points + (item.level - 1) * data.pointsPerLevel;
}

/** A short name, such as "Epic Sniper stick". */
export function itemName(item: GearItem): string {
  const slot = (data.slotNames as Record<string, string>)[item.slot] ?? item.slot;
  const set = item.set ? `${setInfo(item.set)?.name ?? ''} ` : '';
  return `${rarityInfo(item.rarity).name} ${set}${slot.toLowerCase()}`;
}

/** What it does, in words: "+4 Shooting, +4 Passing. Heavy shot: harder shots." */
export function itemSummary(item: GearItem): string {
  const names = data.ratingNames as Record<string, string>;
  const boosts = item.boosts.map((r) => `+${boostPoints(item)} ${names[r] ?? r}`).join(', ');
  const perk = perkInfo(item);
  return `${boosts}${perk ? `. ${perk.name}: ${perk.description.toLowerCase()}` : ''}${item.level > 1 ? ` (level ${item.level})` : ''}`;
}

/** The modifiers one piece gives its wearer: rating boosts, and its perk. */
export function itemModifiers(item: GearItem): Modifier[] {
  const boosts: Modifier[] = item.boosts.map((rating) => ({ stat: `rating.${rating}`, op: 'add', value: boostPoints(item) }));
  return [...boosts, ...(perkInfo(item)?.modifiers ?? [])];
}

/** How many pieces of each set are among these items. */
export function setCounts(items: GearItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) if (item.set) counts[item.set] = (counts[item.set] ?? 0) + 1;
  return counts;
}

/** Everything a set of worn pieces gives: each piece's boosts and perk, plus any set bonus reached. */
export function gearModifiers(items: GearItem[]): Modifier[] {
  const out = items.flatMap(itemModifiers);
  for (const [setId, count] of Object.entries(setCounts(items))) {
    for (const bonus of setInfo(setId)?.bonuses ?? []) {
      if (count >= bonus.pieces) out.push(...(bonus.modifiers as Modifier[]));
    }
  }
  return out;
}

export function wornBy(f: Franchise, playerId: string): GearItem[] {
  return f.gear.filter((item) => item.wornBy === playerId);
}

/** The modifiers a player gets from everything he is wearing. */
export function playerGearModifiers(f: Franchise, playerId: string): Modifier[] {
  return gearModifiers(wornBy(f, playerId));
}

const RATING_PREFIX = 'rating.';

/** A player's ratings after the rating boosts in a list of modifiers, held at the top of the scale. */
export function boostedRatings<T extends SkaterRatings | GoalieRatings>(ratings: T, modifiers: readonly Modifier[]): T {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(ratings)) {
    out[key] = Math.max(0, Math.min(data.maxRating, Math.round(modified(value, `${RATING_PREFIX}${key}`, modifiers))));
  }
  return out as unknown as T;
}

/** The modifiers that are not rating boosts: perks and set bonuses, which act on abilities directly. */
export function abilityModifiers(modifiers: readonly Modifier[]): Modifier[] {
  return modifiers.filter((m) => !m.stat.startsWith(RATING_PREFIX));
}

const refuse = (reason: string): MoveResult => ({ ok: false, reason });

const kindOf = (player: PlayerRecord): GearKind => (player.position === 'G' ? 'goalie' : 'skater');

/**
 * Puts a piece on one of your players. Skater gear only fits skaters and goalie gear goalies.
 * Whatever he had in that slot comes off, and if someone else was wearing the piece it is taken from him.
 */
export function equip(f: Franchise, itemId: string, playerId: string): MoveResult {
  const item = f.gear.find((g) => g.id === itemId);
  if (!item) return refuse('You do not have that piece.');
  if (!userTeam(f.league).roster.includes(playerId)) return refuse('He is not on your team.');
  const player = playerOf(f.league, playerId);
  if (kindOf(player) !== item.kind) return refuse(item.kind === 'goalie' ? 'That is goalie gear.' : 'That is skater gear.');
  for (const other of f.gear) if (other.wornBy === playerId && other.slot === item.slot) other.wornBy = null;
  item.wornBy = playerId;
  return { ok: true };
}

export function unequip(f: Franchise, itemId: string): MoveResult {
  const item = f.gear.find((g) => g.id === itemId);
  if (!item) return refuse('You do not have that piece.');
  item.wornBy = null;
  return { ok: true };
}

/** Releases a player; everything he was wearing goes back to the inventory. */
export function releasePlayer(f: Franchise, playerId: string): MoveResult {
  // In a fire sale another club pays to take over his contract.
  const player = f.league.players[playerId];
  const price = player ? playerSalePrice(f, player) : 0;
  const result = release(f.league, userTeam(f.league), playerId);
  if (!result.ok) return result;
  for (const item of f.gear) if (item.wornBy === playerId) item.wornBy = null;
  if (price > 0) book(f, 'sales', price);
  return result;
}

/** What the next level costs in tape, or null at the top level. */
export function levelCost(item: GearItem): number | null {
  if (item.level >= data.maxLevel) return null;
  return rarityInfo(item.rarity).levelCost[item.level - 1] ?? null;
}

export function levelUp(f: Franchise, itemId: string): MoveResult {
  const item = f.gear.find((g) => g.id === itemId);
  if (!item) return refuse('You do not have that piece.');
  const cost = levelCost(item);
  if (cost === null) return refuse(`It is already at the top level (${data.maxLevel}).`);
  if (f.tape < cost) return refuse(`You need ${cost} tape and have ${f.tape}.`);
  f.tape -= cost;
  item.level += 1;
  return { ok: true };
}

/** Scraps a piece nobody is wearing for tape. */
export function scrap(f: Franchise, itemId: string): MoveResult {
  const item = f.gear.find((g) => g.id === itemId);
  if (!item) return refuse('You do not have that piece.');
  if (item.wornBy !== null) return refuse('Take it off first.');
  f.gear = f.gear.filter((g) => g.id !== itemId);
  f.tape += rarityInfo(item.rarity).scrap;
  return { ok: true };
}
