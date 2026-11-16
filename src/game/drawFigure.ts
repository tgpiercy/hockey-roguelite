import look from '../data/rinkLook.json';
import type { Shape, Tag } from './figure';

const F = look.figure;

/** How big a figure's picture is, in footprint radii, and where his feet are in it. */
export const FIGURE_BOX = { width: F.box.width, height: F.box.height, feetY: F.box.height - F.box.below };

function piece(ctx: CanvasRenderingContext2D, s: Shape, colour: string, grow: number): void {
  if (s.kind === 'circle') {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r + grow, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (s.kind === 'limb') {
    ctx.strokeStyle = colour;
    ctx.lineWidth = s.w + grow * 2;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineWidth = grow * 2;
  ctx.beginPath();
  s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  if (grow > 0) ctx.stroke();
}

/**
 * Paints a figure facing right into a canvas of its own, `pixelsPerUnit` pixels to one footprint radius:
 * a bold outline round the whole silhouette first, then each piece in its colour. The rink keeps these as
 * textures, one per pose, so a player costs one picture to draw instead of dozens of shapes every frame.
 */
export function paintFigure(canvas: HTMLCanvasElement, shapes: readonly Shape[], colours: Record<Tag, string>, pixelsPerUnit: number): void {
  canvas.width = Math.ceil(FIGURE_BOX.width * pixelsPerUnit);
  canvas.height = Math.ceil(FIGURE_BOX.height * pixelsPerUnit);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, canvas.width / 2, FIGURE_BOX.feetY * pixelsPerUnit);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of shapes) if (!s.bare) piece(ctx, s, F.colours.outline, F.outline);
  for (const s of shapes) piece(ctx, s, colours[s.tag], 0);
  // Light from above: lighter at the top of the picture and darker toward the ice, laid over what is painted.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  const shade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  shade.addColorStop(0, `rgba(255, 255, 255, ${F.shade.light})`);
  shade.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  shade.addColorStop(0.55, 'rgba(8, 20, 44, 0)');
  shade.addColorStop(1, `rgba(8, 20, 44, ${F.shade.dark})`);
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}
