import data from '../data/packs.json';
import type { GameResult } from '../sim/match';
import { generateItem, rollRarity, type GearItem, type RarityId } from './gear';
import { createRng } from './rng';
import type { Franchise } from './season';

export type PackType = 'bronze' | 'silver' | 'gold';

/** A pack waiting to be opened. Its contents were fixed when it was awarded. */
export interface Pack {
  id: string;
  type: PackType;
  /** Why it was awarded, for the screen. */
  reason: string;
  items: GearItem[];
}

export function packName(type: PackType): string {
  return data.types[type].name;
}

/**
 * Awards a pack: rolls its contents now, from the franchise's seed and a counter, and adds it to the
 * unopened packs. One slot honours the pack's guarantee. If too many packs have gone by without a
 * Legendary, this one is given one.
 */
export function awardPack(f: Franchise, type: PackType, reason: string): Pack {
  f.gearCount += 1;
  const packNumber = f.gearCount;
  const rng = createRng(`${f.league.seed}/pack/${packNumber}`);
  const spec = data.types[type];

  const rarities: RarityId[] = [];
  for (let i = 0; i < spec.items; i++) rarities.push(rollRarity(rng, i === 0 ? (spec.guarantee as RarityId | '') : ''));
  // Pity timer: after a long run with no Legendary, the guaranteed slot becomes one.
  if (!rarities.includes('legendary') && f.packsSinceLegendary >= data.pityPacks - 1) rarities[0] = 'legendary';
  f.packsSinceLegendary = rarities.includes('legendary') ? 0 : f.packsSinceLegendary + 1;

  const pack: Pack = {
    id: `pack-${packNumber}`,
    type,
    reason,
    items: rarities.map((rarity, i) => generateItem(rng, `g-${packNumber}-${i}`, rarity)),
  };
  f.packs.push(pack);
  return pack;
}

/** Which pack a finished game earns the player's team (team 0): none for a loss. */
export function packForWin(result: GameResult, isBoss: boolean): PackType | null {
  if (!result.finished || result.winner !== 0) return null;
  const [mine, theirs] = result.score;
  if (isBoss || theirs === 0 || mine - theirs >= data.silverMargin) return 'silver';
  return 'bronze';
}

/** Opens a pack: its pieces move into the inventory. Returns them, in order, for the reveal. */
export function openPack(f: Franchise, packId: string): GearItem[] | null {
  const pack = f.packs.find((p) => p.id === packId);
  if (!pack) return null;
  f.packs = f.packs.filter((p) => p.id !== packId);
  f.gear.push(...pack.items);
  return pack.items;
}
