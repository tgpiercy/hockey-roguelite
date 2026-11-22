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

/** A canvas on the page, or one with no page: the second kind is all a background thread has. */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Pen = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Adds a piece's outline to the path being made, grown by `grow` and moved by (dx, dy). */
function add(ctx: Pen, s: Shape, grow: number, dx = 0, dy = 0): void {
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

function piece(ctx: Pen, s: Shape, colour: string, grow: number): void {
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
function uncovered(ctx: Pen, s: Shape, dx: number, dy: number, colour: string): void {
  ctx.beginPath();
  ctx.rect(-FIGURE_BOX.width, -FIGURE_BOX.height, FIGURE_BOX.width * 2, FIGURE_BOX.height * 2);
  add(ctx, s, 0, dx, dy);
  ctx.fillStyle = colour;
  ctx.fill('evenodd');
}

/** A piece in its colour, with a hard-edged shadow on the side away from the light and a lit rim toward it. */
function celPiece(ctx: Pen, s: Shape, colour: string, ink: typeof INK): void {
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
 * Small pictures made of many small strokes are painted in ordinary memory, not on the graphics card: measured on
 * 2026-11-19, a pose cost 9.5 ms the other way, most of it fetching the finished picture back.
 */
const SOFT: CanvasRenderingContext2DSettings = { willReadFrequently: true };

/** A second canvas the size of the one being painted, for working a shadow out before it is laid on. */
let scratch: AnyCanvas | null = null;

const pen = (canvas: AnyCanvas): Pen | null => (canvas as HTMLCanvasElement).getContext('2d', SOFT) as Pen | null;

/**
 * Several pieces of one colour as a single shape: one line round the lot, one colour, and one shadow and one
 * lit edge worked out for the whole of it. Nothing shows where an upper arm meets a forearm, or a hip a thigh,
 * so he reads as drawn in one go and not as beads on a string.
 */
function celGroup(ctx: Pen, group: readonly Shape[], colour: string, ink: typeof INK, pixelsPerUnit: number): void {
  for (const s of group) piece(ctx, s, F.colours.outline, ink.inner);
  for (const s of group) piece(ctx, s, colour, 0);
  const main = ctx.canvas;
  scratch ??= typeof document === 'undefined' ? new OffscreenCanvas(main.width, main.height) : document.createElement('canvas');
  if (scratch.width !== main.width || scratch.height !== main.height) {
    scratch.width = main.width;
    scratch.height = main.height;
  }
  const sc = pen(scratch);
  if (!sc) return;
  /** The part of the whole shape that the same shape, moved by (dx, dy), does not cover, in one colour. */
  const edge = (dx: number, dy: number, fill: string, dots: number): void => {
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, main.width, main.height);
    sc.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, main.width / 2, FIGURE_BOX.feetY * pixelsPerUnit);
    sc.fillStyle = fill;
    for (const s of group) {
      sc.beginPath();
      add(sc, s, 0);
      sc.fill();
    }
    sc.globalCompositeOperation = 'destination-out';
    for (const s of group) {
      sc.beginPath();
      add(sc, s, 0, dx, dy);
      sc.fill();
    }
    if (dots > 0) {
      // A comic's shading: the shadow is kept only where a grid of dots falls.
      sc.globalCompositeOperation = 'destination-in';
      sc.beginPath();
      const w = FIGURE_BOX.width;
      for (let y = -FIGURE_BOX.feetY, row = 0; y < FIGURE_BOX.height; y += dots * 0.87, row++) {
        for (let x = -w / 2 + (row % 2) * dots * 0.5; x < w / 2; x += dots) {
          sc.moveTo(x + dots * 0.36, y);
          sc.arc(x, y, dots * 0.36, 0, Math.PI * 2);
        }
      }
      sc.fill();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scratch as AnyCanvas, 0, 0);
    ctx.restore();
  };
  edge(-ink.shadeX, -ink.shadeY, darken(colour, ink.shadeDark), ink.dots);
  if (ink.rim > 0) edge(ink.shadeX * 0.5, ink.shadeY * 0.5, lighten(colour, ink.rim), 0);
}

/**
 * Paints a figure facing right into a canvas of its own, `pixelsPerUnit` pixels to one footprint radius,
 * as a comic figure: a heavy line round the whole silhouette, then each piece with a thin line round it,
 * its colour, its shadow and its lit edge; pieces on his far side a shade darker. The rink keeps these as
 * textures, one per pose, so a player costs one picture to draw instead of dozens of shapes every frame.
 * With `merge`, neighbouring pieces of one colour are painted as a single shape.
 */
export function paintFigure(canvas: AnyCanvas, shapes: readonly Shape[], colours: Record<Tag, string>, pixelsPerUnit: number, inkOver: Partial<typeof INK> = {}): void {
  const ink = { ...INK, ...inkOver };
  canvas.width = Math.ceil(FIGURE_BOX.width * pixelsPerUnit);
  canvas.height = Math.ceil(FIGURE_BOX.height * pixelsPerUnit);
  const ctx = pen(canvas);
  if (!ctx) return;
  ctx.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, canvas.width / 2, FIGURE_BOX.feetY * pixelsPerUnit);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of shapes) if (!s.bare) piece(ctx, s, F.colours.outline, ink.outline);
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i]!;
    const colour = s.far ? darken(colours[s.tag], F.farDark) : colours[s.tag];
    if (ink.merge && !s.bare && !FLAT.has(s.tag)) {
      // The run of pieces that follow in the same colour, on the same side of him.
      let end = i + 1;
      while (end < shapes.length && shapes[end]!.tag === s.tag && !shapes[end]!.bare && Boolean(shapes[end]!.far) === Boolean(s.far)) end++;
      celGroup(ctx, shapes.slice(i, end), colour, ink, pixelsPerUnit);
      i = end - 1;
      continue;
    }
    if (!s.bare) piece(ctx, s, F.colours.outline, ink.inner);
    if (FLAT.has(s.tag)) piece(ctx, s, colour, 0);
    else celPiece(ctx, s, colour, ink);
  }
}
