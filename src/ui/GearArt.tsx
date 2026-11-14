import type { ComponentChildren } from 'preact';

/**
 * A small drawing of each kind of gear, on a 32 by 32 grid. The frame and the piece take the rarity's colour
 * from the CSS class, so a Legendary stick looks different from a Common one at a glance.
 */
const ART: Record<string, ComponentChildren> = {
  stick: <path d="M22 4 11.5 21.5c-.6 1-1.7 1.7-2.9 1.7H5v3.6h4.1c2.4 0 4.6-1.3 5.8-3.4L25 6z" />,
  skates: (
    <>
      <path d="M9 4h7v8l7 3.500c1.200.600 2 1.800 2 3.100V20H7V7z" />
      <path d="M10 20h2.500v3.500H10zM20.500 20H23v3.500h-2.500zM5 23.500h23V26H5z" />
    </>
  ),
  gloves: (
    <>
      <path d="M10 13V7.5a1.8 1.8 0 0 1 3.6 0V6a1.8 1.8 0 0 1 3.6 0v1.5a1.8 1.8 0 0 1 3.6 0V12l1.4-1.6a1.9 1.9 0 0 1 3 2.3L21 19v3H10z" />
      <path d="M9 22h13v5H9z" />
    </>
  ),
  helmet: (
    <>
      <path d="M6 18a10 10 0 0 1 20 0v3H6z" />
      <path d="M17 21v5h9v-8M17 23.5h9M21.5 18v8" fill="none" />
    </>
  ),
  pads: (
    <>
      <circle cx="8.500" cy="12.500" r="5.500" />
      <circle cx="23.500" cy="12.500" r="5.500" />
      <path d="M11 9h10v17H11z" />
      <path d="M11 15h10M11 20.500h10M16 9v17" fill="none" />
    </>
  ),
  jersey: (
    <>
      <path d="M11 4 4 8l2.5 5 2.5-1.2V27h14V11.8L25.500 13 28 8l-7-4c-.8 1.6-2.600 2.600-5 2.600S11.800 5.600 11 4z" />
      <path d="M9 20h14" fill="none" />
    </>
  ),
  mask: (
    <>
      <path d="M16 3c5.500 0 9 4 9 10 0 7-4 14-9 15.500C11 27 7 20 7 13c0-6 3.500-10 9-10z" />
      <path d="M11 13h10M11 17h10M16 9v13M12.500 21h7" fill="none" />
    </>
  ),
  legPads: (
    <>
      <path d="M11 3h10v19l3 5H8l3-5z" />
      <path d="M11 9h10M11 15h10M11 21h10" fill="none" />
    </>
  ),
  blocker: (
    <>
      <path d="M8 4h14v17H8z" />
      <path d="M12 21v7h6v-7M11 9h8M11 14h8" fill="none" />
    </>
  ),
};

/** The drawing for a gear slot, in a frame coloured by rarity. */
export function GearArt({ slot, rarity, size = 32 }: { slot: string; rarity: string; size?: number }) {
  return (
    <span class={`gear-art gear-art-${rarity}`} style={{ width: `${size}px`, height: `${size}px` }}>
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 32 32" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {ART[slot] ?? ART.stick}
      </svg>
    </span>
  );
}

export const GEAR_ART_SLOTS = Object.keys(ART);
