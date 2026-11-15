import data from '../data/teamColours.json';
import { createRng } from './rng';

/** "#rrggbb" as three numbers, 0 to 255. */
function parts(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** How different two colours look, roughly: 0 is identical, about 440 is black against white. */
export function colourDistance(a: string, b: string): number {
  const [ar, ag, ab] = parts(a);
  const [br, bg, bb] = parts(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/**
 * The jersey colour for a team, from its name: the same team always gets the same colour.
 * If `avoid` is given (the colour the other side is wearing), a colour too close to it is skipped,
 * so the two teams on the ice can always be told apart.
 */
export function teamColour(teamName: string, avoid?: string): string {
  const palette = data.palette;
  const start = createRng(`team-colour/${teamName}`).int(0, palette.length - 1);
  for (let i = 0; i < palette.length; i++) {
    const colour = palette[(start + i) % palette.length] as string;
    if (avoid === undefined || colourDistance(colour, avoid) >= data.minDistance) return colour;
  }
  return palette[start] as string;
}

/** A lighter or darker companion to a colour, for a goalie or trim: mixed toward white by `amount` (0 to 1). */
export function lighten(hex: string, amount: number): string {
  const mixed = parts(hex).map((c) => Math.round(c + (255 - c) * amount));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The same toward black: `amount` 0 leaves it alone, 1 is black. */
export function darken(hex: string, amount: number): string {
  const mixed = parts(hex).map((c) => Math.round(c * (1 - amount)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** How bright a colour looks, 0 (black) to 1 (white): the relative luminance used for contrast. */
export function luminance(hex: string): number {
  const [r, g, b] = parts(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast between two colours, 1 (none) to 21 (black on white). Text wants 4.5 or more. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The ink to write with on a colour: white or near-black, whichever reads better. */
export const INK_LIGHT = data.inkLight;
export const INK_DARK = data.inkDark;
export function inkOn(hex: string): string {
  return contrast(hex, INK_LIGHT) >= contrast(hex, INK_DARK) ? INK_LIGHT : INK_DARK;
}

/**
 * The colours a menu takes from a team: its colour, a deeper shade of it for the far end of a band,
 * and the ink that reads on both.
 */
export function menuColours(hex: string): { team: string; deep: string; ink: string } {
  // The ink has to read on the whole band, so it is judged at whichever end is harder. A colour neither
  // ink reads on (a mid orange, say) is deepened a little at a time, for the menus only, until white does.
  let team = hex;
  for (let step = 0; step < 12; step++) {
    const deep = darken(team, data.menuDeepen);
    const light = Math.min(contrast(team, INK_LIGHT), contrast(deep, INK_LIGHT));
    const dark = Math.min(contrast(team, INK_DARK), contrast(deep, INK_DARK));
    if (Math.max(light, dark) >= data.menuContrast) return { team, deep, ink: light >= dark ? INK_LIGHT : INK_DARK };
    team = darken(team, 0.06);
  }
  return { team, deep: darken(team, data.menuDeepen), ink: INK_LIGHT };
}
