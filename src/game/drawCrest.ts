import type * as Phaser from 'phaser';
import { EMBLEM_PARTS, SHAPE_POINTS, type Crest, type Point } from '../core/crest';

const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/**
 * Draws a team's badge on the ice or the scoreboard, centred at (x, y) and `size` pixels across.
 * It uses the same shapes as the menus' badge (src/ui/Crest.tsx).
 */
export function drawCrest(g: Phaser.GameObjects.Graphics, crest: Crest, x: number, y: number, size: number, alpha = 1): void {
  const half = size / 2;
  const fill = (points: Point[], scale: number, hex: string): void => {
    g.fillStyle(colour(hex), alpha);
    g.beginPath();
    points.forEach(([px, py], i) => {
      const sx = x + px * half * scale;
      const sy = y + py * half * scale;
      if (i === 0) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
    });
    g.closePath();
    g.fillPath();
  };
  const outline = SHAPE_POINTS[crest.shape];
  fill(outline, 1, crest.trim);
  fill(outline, 0.86, crest.primary);
  for (const part of EMBLEM_PARTS[crest.emblem] ?? []) fill(part.points, 0.82, part.cut ? crest.primary : crest.secondary);
}
