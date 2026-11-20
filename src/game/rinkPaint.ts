import look from '../data/rinkLook.json';

/**
 * Depth and light for the sheet, painted once on the picture of the rink with the canvas's own tools (which can
 * shade one colour into another, as the rink's line drawing cannot): the far boards stand up with a face and a cap,
 * the glass rises above them with the crowd seen through it, and the lamps throw soft pools on the ice.
 * Drawing only. Every number is a style under `rinkDepth` in rinkLook.json.
 */
export type DepthStyle = (typeof look.rinkDepth.styles)[number];

/** The style in use: the one named in rinkLook.json, or none (the flat rink of before). */
export function depthStyle(index: number = look.rinkDepth.style): DepthStyle | null {
  return look.rinkDepth.styles[index] ?? null;
}

/** The sheet on the screen: its box in pixels, its corner's radius and how many pixels a metre is. */
export interface SheetBox {
  x: number;
  y: number;
  w: number;
  h: number;
  corner: number;
  z: number;
}

/** A stretch of the far boards in a colour of its own (a team's panel, a bench door), in pixels across the screen. */
export interface Span {
  x1: number;
  x2: number;
  colour: string;
}

export interface DepthColours {
  boards: string;
  rail: string;
  glass: string;
  light: string;
  lamp: string;
  shade: string;
  ink: string;
}

/** A rectangle with round corners as a path, moved up the screen by `lift`. */
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, lift = 0): void {
  const top = y - lift;
  ctx.moveTo(x + r, top);
  ctx.lineTo(x + w - r, top);
  ctx.arcTo(x + w, top, x + w, top + r, r);
  ctx.lineTo(x + w, top + h - r);
  ctx.arcTo(x + w, top + h, x + w - r, top + h, r);
  ctx.lineTo(x + r, top + h);
  ctx.arcTo(x, top + h, x, top + h - r, r);
  ctx.lineTo(x, top + r);
  ctx.arcTo(x, top, x + r, top, r);
  ctx.closePath();
}

/** The outline of something standing on a round-cornered rectangle and `lift` pixels tall: its top edge raised, its foot where it was. */
function standing(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, lift: number): void {
  ctx.moveTo(x + r, y - lift);
  ctx.lineTo(x + w - r, y - lift);
  ctx.arcTo(x + w, y - lift, x + w, y - lift + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y - lift + r);
  ctx.arcTo(x, y - lift, x + r, y - lift, r);
  ctx.closePath();
}

const rgba = (hex: string, alpha: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/** How tall the far boards and the glass over them are drawn, in pixels, for a style at this size. */
export function depthHeights(style: DepthStyle, z: number): { face: number; glass: number } {
  return { face: Math.max(3, style.face * z), glass: Math.max(3, style.glass * z) };
}

/**
 * Paints the light on the ice, then the far boards and the glass over them.
 * `lamps` is how many pools of light there are down the middle of the sheet; `spans` are the coloured stretches of the far boards.
 */
export function paintDepth(ctx: CanvasRenderingContext2D, box: SheetBox, style: DepthStyle, colours: DepthColours, lamps: number, spans: readonly Span[], wall: number): void {
  const { x, y, w, h, corner, z } = box;
  const { face, glass } = depthHeights(style, z);

  // Light, on the ice only.
  ctx.save();
  ctx.beginPath();
  rounded(ctx, x, y, w, h, corner);
  ctx.clip();
  // Pools under the lamps: each a soft round of light, brightest in the middle.
  const pools = Math.max(1, lamps);
  for (let k = 0; k < pools; k++) {
    const px = x + ((k + 0.5) / pools) * w;
    const py = y + h / 2;
    const radius = h * style.poolSize;
    const pool = ctx.createRadialGradient(px, py, 0, px, py, radius);
    pool.addColorStop(0, rgba(colours.lamp, style.poolAlpha));
    pool.addColorStop(0.55, rgba(colours.lamp, style.poolAlpha * 0.45));
    pool.addColorStop(1, rgba(colours.lamp, 0));
    ctx.fillStyle = pool;
    ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  }
  // The corners and the ends fall away from the lamps.
  if (style.vignette > 0) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(w / h, 1);
    const dark = ctx.createRadialGradient(0, 0, (h / 2) * style.vignetteFrom, 0, 0, (h / 2) * 1.08);
    dark.addColorStop(0, rgba(colours.shade, 0));
    dark.addColorStop(1, rgba(colours.shade, style.vignette));
    ctx.fillStyle = dark;
    ctx.fillRect(-h, -h, h * 2, h * 2);
    ctx.restore();
  }
  // A shine lying across the sheet, as polished ice has under lamps.
  for (let k = 0; k < style.glossBands; k++) {
    const gx = x + ((k + 0.5) / style.glossBands) * w;
    const half = style.glossWidth * z;
    const lean = h * 0.35;
    const band = ctx.createLinearGradient(gx - half, 0, gx + half, 0);
    band.addColorStop(0, rgba(colours.light, 0));
    band.addColorStop(0.5, rgba(colours.light, style.gloss));
    band.addColorStop(1, rgba(colours.light, 0));
    ctx.save();
    ctx.transform(1, 0, -lean / h, 1, (lean / h) * (y + h / 2), 0);
    ctx.fillStyle = band;
    ctx.fillRect(gx - half, y, half * 2, h);
    ctx.restore();
  }
  // The far boards stand over the ice and shade a strip of it.
  const shade = ctx.createLinearGradient(0, y, 0, y + style.shade * z);
  shade.addColorStop(0, rgba(colours.shade, style.shadeAlpha));
  shade.addColorStop(1, rgba(colours.shade, 0));
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, style.shade * z);
  ctx.restore();

  // The far boards: a face standing up from the ice, seen from the near side. Only what is outside the ice is painted.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
  rounded(ctx, x, y, w, h, corner);
  ctx.clip('evenodd');
  ctx.beginPath();
  rounded(ctx, x, y, w, h, corner, face);
  ctx.save();
  ctx.clip();
  const boards = ctx.createLinearGradient(0, y - face, 0, y + corner);
  boards.addColorStop(0, style.boardTop);
  boards.addColorStop(1, style.boardFoot);
  ctx.fillStyle = boards;
  ctx.fillRect(x - 1, y - face - 1, w + 2, face + corner + 2);
  // Team colours and bench doors along the straight.
  const capPx = Math.max(1, style.cap * z);
  for (const span of spans) {
    ctx.fillStyle = rgba(span.colour, style.panelAlpha);
    ctx.fillRect(span.x1, y - face + capPx, span.x2 - span.x1, face - capPx);
  }
  // Seams between the panels of the boards.
  if (style.seamAlpha > 0) {
    ctx.strokeStyle = rgba(colours.ink, style.seamAlpha);
    ctx.lineWidth = 1;
    for (let sx = x + corner; sx <= x + w - corner + 0.5; sx += look.arena.boardPanel * z) {
      ctx.beginPath();
      ctx.moveTo(Math.round(sx) + 0.5, y - face + capPx);
      ctx.lineTo(Math.round(sx) + 0.5, y);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();

  // The glass over the far boards: between the top of the face and the top of the pane.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
  rounded(ctx, x, y, w, h, corner, face);
  ctx.clip('evenodd');
  ctx.beginPath();
  rounded(ctx, x, y, w, h, corner, face + glass);
  ctx.clip();
  const pane = ctx.createLinearGradient(0, y - face - glass, 0, y - face + corner * 0.6);
  pane.addColorStop(0, rgba(colours.glass, style.glassTop));
  pane.addColorStop(1, rgba(colours.glass, style.glassFoot));
  ctx.fillStyle = pane;
  ctx.fillRect(x - 1, y - face - glass - 1, w + 2, glass + corner + 2);
  // Light caught on the panes: slanted streaks, a pair to each stretch.
  if (style.streakAlpha > 0) {
    ctx.strokeStyle = rgba(colours.light, style.streakAlpha);
    for (let sx = x + corner * 0.5, k = 0; sx < x + w - corner * 0.5; sx += style.streakEvery * z, k++) {
      const lean = glass * 0.9;
      for (const [off, wide] of [[0, style.streakWidth], [style.streakWidth * 2.2, style.streakWidth * 0.45]] as const) {
        ctx.lineWidth = Math.max(1, wide * z);
        ctx.beginPath();
        ctx.moveTo(sx + off * z + (k % 2) * z, y - face + 1);
        ctx.lineTo(sx + off * z + (k % 2) * z + lean, y - face - glass - 1);
        ctx.stroke();
      }
    }
  }
  // The posts that hold the panes.
  if (style.postAlpha > 0) {
    ctx.strokeStyle = rgba(colours.rail, style.postAlpha);
    ctx.lineWidth = Math.max(1, wall * 0.16);
    for (let sx = x + corner; sx <= x + w - corner + 0.5; sx += look.rinkDetail.glassPosts * z) {
      ctx.beginPath();
      ctx.moveTo(Math.round(sx) + 0.5, y - face);
      ctx.lineTo(Math.round(sx) + 0.5, y - face - glass);
      ctx.stroke();
    }
  }
  ctx.restore();

  // The cap on top of the far boards, and the rail along the top of the glass.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ctx.canvas.width, y + h / 2);
  ctx.clip();
  ctx.lineWidth = capPx;
  ctx.strokeStyle = style.capColour;
  ctx.beginPath();
  rounded(ctx, x, y, w, h, corner, face);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, style.rail * z);
  ctx.strokeStyle = rgba(colours.rail, style.railAlpha);
  ctx.beginPath();
  rounded(ctx, x, y, w, h, corner, face + glass);
  ctx.stroke();
  ctx.restore();
  // The near boards are seen from above: a lit cap along their top.
  if (style.nearCap > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + h / 2, ctx.canvas.width, ctx.canvas.height);
    ctx.clip();
    ctx.lineWidth = Math.max(1, wall * 0.35);
    ctx.strokeStyle = rgba(colours.rail, style.nearCap);
    ctx.beginPath();
    rounded(ctx, x - wall * 0.5, y - wall * 0.5, w + wall, h + wall, corner + wall * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // Ink: a heavy line round the whole of it, the far side at the top of the glass, and a fine one where the boards meet the ice.
  const inkWidth = look.comicArena.ink;
  if (inkWidth > 0) {
    const out = wall * 1.9;
    ctx.strokeStyle = colours.ink;
    ctx.lineWidth = inkWidth;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    standing(ctx, x - out, y - out, w + out * 2, h + out * 2, corner + out, Math.max(0, face + glass - out * 0.5));
    ctx.stroke();
    ctx.lineWidth = Math.max(1, inkWidth * 0.5);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    rounded(ctx, x - 0.5, y - 0.5, w + 1, h + 1, corner);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
