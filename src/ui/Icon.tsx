import type { ComponentChildren } from 'preact';

/**
 * Every icon in the menus, drawn as simple line shapes on a 24 by 24 grid so they stay sharp at any size
 * and take the colour of the text around them. Nothing here is an image file.
 */
const ICONS = {
  roster: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5c2.8 0 5 2.2 5 5.5" />
    </>
  ),
  lineup: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  freeAgents: (
    <>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.6 2.9-6.5 6.5-6.5 1.5 0 2.9.5 4 1.3" />
      <path d="M18 13v6M15 16h6" />
    </>
  ),
  trade: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  mascot: (
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="6.5" cy="6.5" r="2.4" />
      <circle cx="17.5" cy="6.5" r="2.4" />
      <path d="M9.5 12v.5M14.5 12v.5M10 16q2 1.6 4 0" />
    </>
  ),
  powerups: <path d="M13 2 5 13h6l-1 9 8-11h-6z" />,
  finances: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.6 9.2c-.6-1-1.5-1.6-2.8-1.6-1.6 0-2.6.9-2.6 2.1 0 2.9 5.6 1.3 5.6 4.3 0 1.3-1.1 2.2-2.8 2.2-1.4 0-2.5-.6-3-1.7M12 6v1.6M12 16.4V18" />
    </>
  ),
  staff: (
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5 21c0-4 3.1-7 7-7s7 3 7 7M12 14l-1.2 4 1.2 1.5 1.2-1.5z" />
    </>
  ),
  facilities: (
    <>
      <path d="M4 21V8l8-5 8 5v13M2 21h20" />
      <path d="M9.5 21v-6h5v6M8.5 10.5h1.5M14 10.5h1.5" />
    </>
  ),
  prestige: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.2 9.4l6.1-.8z" />,
  report: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 17v-3M12 17V9M15 17v-5" />
    </>
  ),
  packs: (
    <>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M6 9h12M10 13l2 2 2-2" />
    </>
  ),
  gear: <path d="M17 3 9.5 16.5c-.5.9-1.5 1.5-2.6 1.5H4v3h3.2c2 0 3.8-1.1 4.7-2.8L19.5 4" />,
  artifacts: (
    <>
      <path d="M6 4h12l3 5-9 11L3 9z" />
      <path d="M3 9h18M9 4l3 16 3-16" />
    </>
  ),
  jersey: <path d="M8 3 3 6l2 4 2-1v11h10V9l2 1 2-4-5-3c-.6 1.2-2 2-4 2s-3.4-.8-4-2z" />,
  difficulty: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4-5.5" />
      <circle cx="12" cy="17" r="1" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  detail: (
    <>
      <path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </>
  ),
  play: <path d="M7 4l13 8-13 8z" />,
  simulate: <path d="M4 5l8 7-8 7zM13 5l8 7-8 7z" />,
  exhibition: <path d="M6 21V4M6 5h12l-3 4 3 4H6" />,
  contracts: (
    <>
      <path d="M17 11V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
      <path d="M8 8h6M8 12h5M13.5 20.5l6-6 1.5 1.5-6 6h-1.5z" />
    </>
  ),
  game: <path d="M5 4l9 13c.6.9 1.6 1.4 2.6 1.4H20M19 4l-9 13c-.6.9-1.6 1.4-2.6 1.4H4" />,
  training: <path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" />,
  event: (
    <>
      <path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4" />
      <path d="M12 18v.5" />
    </>
  ),
  shop: (
    <>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" />
    </>
  ),
  boss: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  team: <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />,
  office: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5h6v2M3 13h18" />
    </>
  ),
  collection: (
    <>
      <rect x="4" y="6" width="11" height="14" rx="2" />
      <path d="M9 3h9a2 2 0 0 1 2 2v12" />
    </>
  ),
  bailout: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </>
  ),
} satisfies Record<string, ComponentChildren>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** One icon, sized in pixels, in the colour of the text around it. */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
