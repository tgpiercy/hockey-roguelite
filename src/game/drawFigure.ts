import { darken, lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';
import type { Shape, Tag } from './figure';

const F = look.figure;

/** How big a figure's picture is, in footprint radii, and where his feet are in it. */
export const FIGURE_BOX = { width: F.box.width, height: F.box.height, feetY: F.box.height - F.box.below };

/** How a figure is inked, as a comic is: a heavy line round the whole of him, a thin one round each piece, and a hard-edged shadow on the side of each piece away from the light, with a lit rim toward it. In footprint radii. */
const INK = F.ink;

/** Pieces too small or too flat to carry a shadow of their own. */
const FLAT: ReadonlySet<Tag> = new Set<Tag>(['eye', 'visor', 'cage', 'blade', 'stick']);

/** Adds a piece's outline to the path being made, grown by `grow` and moved by (dx, dy). */
function add(ctx: CanvasRenderingContext2D, s: Shape, grow: number, dx = 0, dy = 0): void {
  if (s.kind === 'circle') {
    ctx.moveTo(s.x + dx + Math.max(0, s.r + grow), s.y + dy);
    ctx.arc(s.x + dx, s.y + dy, Math.max(0, s.r + grow), 0, Math.PI * 2);
    return;
  }
  if (s.kind === 'limb') {
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const r = Math.max(0, s.w / 2 + grow);
    ctx.moveTo(s.x1 + dx + Math.cos(a + Math.PI / 2) * r, s.y1 + dy + Math.sin(a + Math.PI / 2) * r);
    ctx.arc(s.x1 + dx, s.y1 + dy, r, a + Math.PI / 2, a + (3 * Math.PI) / 2);
    ctx.arc(s.x2 + dx, s.y2 + dy, r, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
    return;
  }
  s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + dx, y + dy) : ctx.lineTo(x + dx, y + dy)));
  ctx.closePath();
}

function piece(ctx: CanvasRenderingContext2D, s: Shape, colour: string, grow: number): void {
  ctx.beginPath();
  add(ctx, s, s.kind === 'poly' ? 0 : grow);
  ctx.fillStyle = colour;
  ctx.fill();
  if (s.kind === 'poly' && grow > 0) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = grow * 2;
    ctx.stroke();
  }
}

/** Fills the part of the clipped piece that the same piece, moved by (dx, dy), does not cover. */
function uncovered(ctx: CanvasRenderingContext2D, s: Shape, dx: number, dy: number, colour: string): void {
  ctx.beginPath();
  ctx.rect(-FIGURE_BOX.width, -FIGURE_BOX.height, FIGURE_BOX.width * 2, FIGURE_BOX.height * 2);
  add(ctx, s, 0, dx, dy);
  ctx.fillStyle = colour;
  ctx.fill('evenodd');
}

/** A piece in its colour, with a hard-edged shadow on the side away from the light and a lit rim toward it. */
function celPiece(ctx: CanvasRenderingContext2D, s: Shape, colour: string, ink: typeof INK): void {
  piece(ctx, s, colour, 0);
  ctx.save();
  ctx.beginPath();
  add(ctx, s, 0);
  ctx.clip();
  uncovered(ctx, s, -ink.shadeX, -ink.shadeY, darken(colour, ink.shadeDark));
  if (ink.rim > 0) uncovered(ctx, s, ink.shadeX * 0.5, ink.shadeY * 0.5, lighten(colour, ink.rim));
  ctx.restore();
}

/**
 * Paints a figure facing right into a canvas of its own, `pixelsPerUnit` pixels to one footprint radius,
 * as a comic figure: a heavy line round the whole silhouette, then each piece with a thin line round it,
 * its colour, its shadow and its lit edge; pieces on his far side a shade darker. The rink keeps these as
 * textures, one per pose, so a player costs one picture to draw instead of dozens of shapes every frame.
 */
export function paintFigure(canvas: HTMLCanvasElement, shapes: readonly Shape[], colours: Record<Tag, string>, pixelsPerUnit: number, inkOver: Partial<typeof INK> = {}): void {
  const ink = { ...INK, ...inkOver };
  canvas.width = Math.ceil(FIGURE_BOX.width * pixelsPerUnit);
  canvas.height = Math.ceil(FIGURE_BOX.height * pixelsPerUnit);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, canvas.width / 2, FIGURE_BOX.feetY * pixelsPerUnit);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of shapes) if (!s.bare) piece(ctx, s, F.colours.outline, ink.outline);
  for (const s of shapes) {
    if (!s.bare) piece(ctx, s, F.colours.outline, ink.inner);
    const colour = s.far ? darken(colours[s.tag], F.farDark) : colours[s.tag];
    if (FLAT.has(s.tag)) piece(ctx, s, colour, 0);
    else celPiece(ctx, s, colour, ink);
  }
}
