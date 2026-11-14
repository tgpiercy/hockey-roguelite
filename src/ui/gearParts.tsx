import { boostedRatings, gearModifiers, itemName, itemSummary, setCounts, setInfo, wornBy, type GearItem } from '../core/gear';
import type { PlayerRecord } from '../core/player';
import type { Franchise } from '../core/season';
import gearData from '../data/gear.json';
import { RatingBar } from './parts';

const ratingNames = gearData.ratingNames as Record<string, string>;
export const slotName = (slot: string): string => (gearData.slotNames as Record<string, string>)[slot] ?? slot;

/** A piece's name in its rarity colour. */
export function GearName({ item }: { item: GearItem }) {
  return <span class={`gear gear-${item.rarity}`}>{itemName(item)}</span>;
}

/** One piece as a row: name, what it does, and who is wearing it. */
export function GearRow({ item, wearer }: { item: GearItem; wearer?: string }) {
  return (
    <span class="gear-row">
      <GearName item={item} />
      <span class="gear-what">{itemSummary(item)}</span>
      {wearer && <span class="note">worn by {wearer}</span>}
    </span>
  );
}

/** A big card for one piece, used when a pack is opened. */
export function GearCard({ item }: { item: GearItem }) {
  const set = item.set ? setInfo(item.set) : null;
  return (
    <div class={`gear-card gear-card-${item.rarity}`}>
      <div class="gear-card-name">{itemName(item)}</div>
      <div>{itemSummary(item)}</div>
      {set && (
        <div class="gear-card-set">
          {set.name} set: {set.bonuses.map((b) => `${b.pieces} pieces: ${b.description}`).join(' · ')}
        </div>
      )}
      <div class="gear-card-kind">{item.kind === 'goalie' ? 'Goalie gear' : 'Skater gear'}</div>
    </div>
  );
}

/** How far a set of worn pieces is toward each set's bonuses: "Sniper 2 of 4". */
export function setProgress(items: GearItem[]): string {
  return Object.entries(setCounts(items))
    .map(([id, count]) => {
      const set = setInfo(id);
      if (!set) return '';
      const top = set.bonuses[set.bonuses.length - 1]?.pieces ?? count;
      const active = set.bonuses.filter((b) => count >= b.pieces).map((b) => b.description);
      return `${set.name} ${Math.min(count, top)} of ${top}${active.length > 0 ? ` (${active.join('; ')})` : ''}`;
    })
    .filter((line) => line !== '')
    .join(' · ');
}

/** A player's ratings as the gear he wears leaves them, each with how much gear adds. */
export function GearedRatings({ f, player }: { f: Franchise; player: PlayerRecord }) {
  const items = wornBy(f, player.id);
  const base = player.ratings as unknown as Record<string, number>;
  const now = boostedRatings(player.ratings, gearModifiers(items)) as unknown as Record<string, number>;
  const progress = setProgress(items);
  return (
    <div class="ratings">
      {Object.keys(base).map((key) => (
        <RatingBar
          key={key}
          name={ratingNames[key] ?? key}
          value={now[key] as number}
          extra={now[key] !== base[key] ? <span class="bump"> +{(now[key] as number) - (base[key] as number)}</span> : undefined}
        />
      ))}
      {progress && <span class="rnote note">{progress}</span>}
    </div>
  );
}

/**
 * What putting a piece on a player would change: each rating that moves, as "now → after",
 * and his set progress afterwards. `candidate` null means taking the slot's piece off.
 */
export function EquipPreview({ f, player, slot, candidate }: { f: Franchise; player: PlayerRecord; slot: string; candidate: GearItem | null }) {
  const worn = wornBy(f, player.id);
  const afterItems = [...worn.filter((g) => g.slot !== slot && g.id !== candidate?.id), ...(candidate ? [candidate] : [])];
  const now = boostedRatings(player.ratings, gearModifiers(worn)) as unknown as Record<string, number>;
  const after = boostedRatings(player.ratings, gearModifiers(afterItems)) as unknown as Record<string, number>;
  const changed = Object.keys(now).filter((key) => now[key] !== after[key]);
  const progress = setProgress(afterItems);
  return (
    <div class="ratings">
      {changed.length === 0 && <span class="rnote">No rating changes.</span>}
      {changed.map((key) => (
        <RatingBar
          key={key}
          name={ratingNames[key] ?? key}
          value={after[key] as number}
          extra={
            <span class={(after[key] as number) > (now[key] as number) ? 'up' : 'down'}>
              {' '}
              ({(after[key] as number) > (now[key] as number) ? '+' : ''}
              {(after[key] as number) - (now[key] as number)})
            </span>
          }
        />
      ))}
      {candidate && <span class="rnote">{itemSummary(candidate)}</span>}
      {progress && <span class="rnote note">Sets after: {progress}</span>}
    </div>
  );
}
