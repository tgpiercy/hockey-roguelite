import { itemName, type GearItem } from '../core/gear';
import { GearCard } from './gearParts';

interface Props {
  /** What the pack is called, printed on it while it is still sealed. */
  title: string;
  items: GearItem[];
  /** How many cards have been turned over. Zero means the pack is still sealed. */
  shown: number;
}

/**
 * Opening a pack: a sealed pack that shakes, then its cards face down in a row, turned over one at a time
 * with a glow in the piece's rarity colour. The card just turned is shown in full underneath.
 * The movement is all CSS, and is switched off for anyone whose device asks for reduced motion.
 */
export function PackOpening({ title, items, shown }: Props) {
  if (shown === 0) {
    return (
      <div class="pack-stage">
        <div class="pack sealed">
          <div class="pack-band" />
          <div class="pack-name">{title}</div>
          <div class="pack-count">{items.length} pieces</div>
        </div>
      </div>
    );
  }
  const latest = items[Math.min(shown, items.length) - 1];
  return (
    <div class="pack-stage opened">
      <div class="pack-cards">
        {items.map((item, i) => {
          const up = i < shown;
          const fresh = i === shown - 1;
          return (
            <div key={item.id} class={`pack-card${up ? ` turned rarity-${item.rarity}` : ""}${fresh ? ' fresh' : ''}`}>
              {up ? (
                <>
                  <span class="pack-card-rarity">{item.rarity}</span>
                  <span class="pack-card-name">{itemName(item)}</span>
                </>
              ) : (
                <span class="pack-card-back">?</span>
              )}
            </div>
          );
        })}
      </div>
      {latest && <GearCard item={latest} />}
    </div>
  );
}
