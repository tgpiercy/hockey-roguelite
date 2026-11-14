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
