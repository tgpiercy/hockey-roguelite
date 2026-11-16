import type { Crest, JerseyPattern } from '../core/crest';
import type { PlayerLook } from '../core/playerLook';
import { lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';

const F = look.figure;
const B = F.body;
const G = F.goalie;
const H = F.helmet;

/** What a shape of the figure is, which decides its colour. */
export type Tag = 'skin' | 'hair' | 'eye' | 'helmet' | 'visor' | 'cage' | 'jersey' | 'accent' | 'glove' | 'pants' | 'sock' | 'skate' | 'blade' | 'pad' | 'stick' | 'mark';

export const TAGS: readonly Tag[] = ['skin', 'hair', 'eye', 'helmet', 'visor', 'cage', 'jersey', 'accent', 'glove', 'pants', 'sock', 'skate', 'blade', 'pad', 'stick', 'mark'];

/** One piece of the figure. A limb is a thick line with round ends. `bare` pieces get no outline round them. */
export type Shape =
  | { kind: 'circle'; tag: Tag; x: number; y: number; r: number; bare?: boolean }
  | { kind: 'limb'; tag: Tag; x1: number; y1: number; x2: number; y2: number; w: number; bare?: boolean }
  | { kind: 'poly'; tag: Tag; points: [number, number][]; bare?: boolean };

/** Something a player is doing for a moment, which changes how he is drawn. */
export type Action = 'pass' | 'poke' | 'hit' | 'deke' | 'tired' | 'glove';
export const ACTIONS: readonly Action[] = ['pass', 'poke', 'hit', 'deke', 'tired', 'glove'];

export interface PoseInput {
  /** Which way he faces on screen: 1 is right, -1 is left. */
  side: 1 | -1;
  /** How far through his stride he is, in radians. */
  stride: number;
  /** How fast he is going, 0 (standing) to 1 (flat out): he leans in and strides longer. */
  speed: number;
  /** How far a shot is wound up, 0 to 1: the hands come back and up. */
  windUp: number;
  goalie: boolean;
  /** A goalie down on his knees with the pads spread. */
  down: boolean;
  /** Tipped over, in radians: a skater knocked off balance. */
  tilt: number;
  /** Arms in the air: he has just scored. */
  cheer?: boolean;
  /** One arm in the air: his team-mate has just scored. */
  mateCheer?: boolean;
  /** Down on one knee to block a shot: the whole body sits lower. */
  kneel?: boolean;
  /** A pass just made, a poke or a hit being thrown, a deke, a tired glide; for a goalie, the glove thrown up. */
  action?: Action;
  pattern: JerseyPattern;
}

/** The parts of a player's look that change the shapes drawn. (His colours are in `figureColours`.) */
export type FigureLook = Pick<PlayerLook, 'hair' | 'beard' | 'build' | 'mark'>;

/** A player with nothing particular about him: short hair, no beard, an ordinary build. */
export const PLAIN_LOOK: FigureLook = { hair: 'short', beard: 'none', build: 'regular' };

export interface Figure {
  /** Back to front. Units are the player's footprint radius; the feet are at (0, 0) and y runs down the screen. */
  shapes: Shape[];
  /** Where the lower hand grips the stick. */
  hand: { x: number; y: number };
  /** Where a goalie's stick meets the ice. Null for a skater, whose blade goes to the puck. */
  stickEnd: { x: number; y: number } | null;
  /** The highest point of the figure (a negative y). */
  top: number;
}

export const STANDING: PoseInput = { side: 1, stride: 0, speed: 0, windUp: 0, goalie: false, down: false, tilt: 0, pattern: 'hoop' };

type Raw = Pick<Figure, 'shapes' | 'hand' | 'stickEnd'>;

const circle = (tag: Tag, x: number, y: number, r: number, bare = false): Shape => ({ kind: 'circle', tag, x, y, r, ...(bare ? { bare } : {}) });
const limb = (tag: Tag, x1: number, y1: number, x2: number, y2: number, w: number, bare = false): Shape => ({ kind: 'limb', tag, x1, y1, x2, y2, w, ...(bare ? { bare } : {}) });
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** A skate at a foot: the boot, and the steel under it. */
function skate(x: number, y: number): Shape[] {
  return [
    limb('skate', x - B.bootBack, y - B.bootHeight, x + B.bootFront, y - B.bootHeight, B.bootWidth),
    limb('blade', x - B.bootBack - B.bladeOver, y, x + B.bootFront + B.bladeOver, y, F.bladeWidth, true),
  ];
}

/** The hair that shows below and behind the helmet, at the nape of the neck. */
function hairBehind(x: number, y: number, style: FigureLook['hair']): Shape[] {
  switch (style) {
    case 'bald':
      return [];
    case 'buzz':
      return [circle('hair', x - 0.7, y + 0.5, 0.26)];
    case 'flow':
      return [circle('hair', x - 0.78, y + 0.5, 0.42), limb('hair', x - 0.86, y + 0.6, x - 1.0, y + 1.25, 0.46)];
    case 'curly':
      return [circle('hair', x - 0.86, y + 0.36, 0.32), circle('hair', x - 0.78, y + 0.74, 0.34), circle('hair', x - 0.5, y + 0.98, 0.28)];
    case 'side':
      return [circle('hair', x - 0.8, y + 0.52, 0.36)];
    default:
      return [circle('hair', x - 0.78, y + 0.5, 0.4)];
  }
}

/** A beard or a moustache, drawn on the face. */
function beardOn(x: number, y: number, beard: FigureLook['beard']): Shape[] {
  if (beard === 'full') return [circle('hair', x + 0.42, y + 0.74, 0.46, true), limb('hair', x - 0.2, y + 0.9, x + 0.5, y + 1.02, 0.3, true)];
  if (beard === 'stubble') return [limb('hair', x + 0.05, y + 0.98, x + 0.7, y + 0.86, 0.13, true)];
  if (beard === 'moustache') return [limb('hair', x + 0.56, y + 0.6, x + 0.98, y + 0.58, 0.14, true)];
  return [];
}

/** Points along an arc round a centre, from one angle to another (degrees, y down the screen), a point every `step` degrees. */
function arc(cx: number, cy: number, radius: number, from: number, to: number, step = 15): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.max(1, Math.round(Math.abs(to - from) / step));
  for (let i = 0; i <= n; i++) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return out;
}

/** A row of short limbs along an arc: a stripe that follows the curve of the shell. */
function stripeAlong(cx: number, cy: number, radius: number, from: number, to: number, width: number): Shape[] {
  const points = arc(cx, cy, radius, from, to, 20);
  return points.slice(1).map(([x2, y2], i) => limb('accent', points[i]![0], points[i]![1], x2, y2, width, true));
}

/**
 * The helmet, drawn over the head at (x, y): a shell whose edge runs from the brow down to the nape, an ear
 * piece with its hole, a stripe over the crown, two vents and a chin strap; for a skater, a clear visor in
 * front of the eye. (The owner chose it from three drawn candidates.)
 */
function helmet(x: number, y: number, caged: boolean): Shape[] {
  const r = B.headRadius;
  const cx = x - H.back;
  const cy = y - H.up;
  const out: Shape[] = [{ kind: 'poly', tag: 'helmet', points: arc(cx, cy, r * H.scale, H.browAngle, H.napeAngle) }];
  out.push(limb('helmet', x - H.earX - 0.06, y + H.earTop, x - H.earX, y + H.earBottom, H.earWidth));
  out.push(circle('cage', x - H.earX, y + H.earBottom - 0.1, H.earHole, true));
  out.push(...stripeAlong(cx, cy, r * H.stripeRadius, -55, -150, B.stripeWidth));
  for (const a of H.vents) {
    const [[vx, vy]] = arc(cx, cy, r * H.ventRadius, a, a) as [[number, number]];
    out.push(limb('cage', vx, vy, vx + 0.2, vy - 0.1, H.strapWidth, true));
  }
  if (!caged) {
    out.push(limb('visor', x + 1.0, y - 0.36, x + 1.16, y + 0.1, H.visorWidth, true));
    out.push(limb('visor', x + 1.16, y + 0.1, x + 0.98, y + 0.52, H.visorWidth, true));
  }
  out.push(limb('cage', x - 0.12, y + 0.62, x + 0.5, y + 1.0, H.strapWidth, true));
  return out;
}

/**
 * The head, which is most of him. The head is the face; the helmet is a cap over the top and back of it,
 * so the face shows: one big eye with a glint, a mouth, whatever beard he wears, his hair at the nape.
 * A goalie has bars across the face. A mascot wears no helmet and has ears.
 */
function head(x: number, y: number, caged: boolean, who: FigureLook): Shape[] {
  const r = B.headRadius;
  if (who.mark === 'mascot') {
    return [
      circle('mark', x - B.earSpread, y - r * 0.82, B.earRadius),
      circle('mark', x + B.earSpread * 0.7, y - r * 0.9, B.earRadius),
      circle('mark', x, y, r),
      circle('skin', x + 0.42, y + 0.42, r * 0.5, true),
      circle('eye', x + 0.58, y + 0.06, B.eyeRadius, true),
      circle('visor', x + 0.65, y - 0.01, B.glint, true),
      circle('eye', x + 0.86, y + 0.38, 0.13, true),
      limb('eye', x + 0.46, y + 0.7, x + 0.84, y + 0.66, 0.08, true),
    ];
  }
  const out: Shape[] = [...hairBehind(x, y, who.hair), circle('skin', x, y, r)];
  // A side parting shows a lock under the front of the helmet.
  if (who.hair === 'side' || who.hair === 'flow') out.push(circle('hair', x + 0.42, y - 0.3, 0.22, true));
  out.push(...beardOn(x, y, who.beard));
  out.push(...helmet(x, y, caged));
  if (caged) {
    for (const k of [0, 0.3, 0.6]) out.push(limb('cage', x + 0.2, y + 0.02 + k, x + 1.1, y + 0.1 + k, B.cageWidth, true));
    for (const k of [0.4, 0.75]) out.push(limb('cage', x + k, y - 0.05, x + k + 0.06, y + 0.85, B.cageWidth, true));
    out.push(circle('eye', x + 0.6, y + 0.22, 0.13, true));
  } else {
    out.push(circle('eye', x + 0.62, y + 0.3, B.eyeRadius, true));
    out.push(circle('visor', x + 0.69, y + 0.23, B.glint, true));
    out.push(limb('eye', x + 0.5, y + 0.78, x + 0.86, y + 0.72, 0.08, true));
  }
  return out;
}

/** A team's jersey pattern across a body from waist to chest. */
function patternOn(pattern: JerseyPattern, waist: [number, number], chest: [number, number], width: number): Shape[] {
  const [wx, wy] = waist;
  const [cx, cy] = chest;
  if (pattern === 'hoop') {
    const mx = (wx + cx) / 2;
    const my = (wy + cy) / 2;
    return [limb('accent', mx - width * 0.36, my, mx + width * 0.36, my, B.patternWidth, true)];
  }
  if (pattern === 'yoke') return [limb('accent', cx - width * 0.3, cy, cx + width * 0.3, cy, B.patternWidth * 1.5, true)];
  return [limb('accent', wx - width * 0.25, wy, cx + width * 0.25, cy, B.patternWidth, true)];
}

/** An arm from shoulder to glove, with a stripe round the sleeve. `band` adds a captain's band above it. */
function arm(sx: number, sy: number, hx: number, hy: number, width: number, band: boolean): Shape[] {
  const at = (k: number): [number, number] => [sx + (hx - sx) * k, sy + (hy - sy) * k];
  const [ax, ay] = at(0.55);
  const [bx, by] = at(0.7);
  const out: Shape[] = [limb('jersey', sx, sy, hx, hy, width), limb('accent', ax, ay, bx, by, width, true)];
  if (band) {
    const [cx, cy] = at(0.2);
    const [dx, dy] = at(0.36);
    out.push(limb('mark', cx, cy, dx, dy, width, true));
  }
  out.push(circle('glove', hx, hy, B.gloveRadius));
  return out;
}

/** A skater facing right, in his own units before scaling. */
function skater(p: PoseInput, who: FigureLook): Raw {
  const build = F.builds[who.build];
  const speed = clamp01(p.speed);
  const wind = clamp01(p.windUp);
  const swing = Math.sin(p.stride);
  const reach = B.strideReach * (B.stanceShare + (1 - B.stanceShare) * speed);
  const act = p.action;
  const lean = speed * B.lean + (act === 'poke' ? B.pokeLean : act === 'hit' ? B.hitLean : act === 'deke' ? B.dekeLean : act === 'tired' ? B.tiredLean : 0);
  const drop = (p.kneel ? B.kneelDrop : 0) + (act === 'hit' ? B.hitDrop : act === 'tired' ? B.tiredDrop : 0);
  // A longer-legged build stands taller: everything above the feet rises with the hips.
  const rise = B.hipY * (build.legs - 1);
  const hipY = B.hipY + rise + drop;
  const shY = B.shoulderY + rise + drop;
  const width = B.torsoWidth * build.width;
  const armW = B.armWidth * Math.sqrt(build.width);
  const shapes: Shape[] = [];

  // Legs: the far one first. Whichever foot is behind is lifted a little off the ice.
  for (const leg of [-1, 1]) {
    const footX = swing * reach * leg;
    const footY = -B.footLift * Math.max(0, -swing * leg) * speed;
    const hipX = B.hipSpread * leg;
    const kneeX = (hipX + footX) / 2 + B.kneeForward;
    const kneeY = (hipY + footY) / 2;
    shapes.push(limb('pants', hipX, hipY, kneeX, kneeY, B.thighWidth * build.width));
    shapes.push(limb('sock', kneeX, kneeY, footX, footY - B.ankleHeight, B.shinWidth));
    // A hoop round the sock.
    const mx = (kneeX + footX) / 2;
    const my = (kneeY + footY - B.ankleHeight) / 2;
    shapes.push(limb('accent', mx - 0.02, my - 0.06, mx + 0.02, my + 0.06, B.shinWidth, true));
    shapes.push(...skate(footX, footY));
  }

  // Hands on the stick: the top hand near the chest, the lower hand out in front.
  const top = { x: lean + B.topHandX - wind * B.windBack, y: rise + drop + B.topHandY - wind * B.windUp + swing * B.armSwing * speed };
  const low = { x: lean + B.lowHandX - wind * B.windBack * 0.6, y: rise + drop + B.lowHandY - wind * B.windUp - swing * B.armSwing * speed };
  if (p.cheer) {
    top.x = lean - B.cheerBack;
    top.y = B.cheerHandY + rise;
    low.x = lean + B.cheerFront;
    low.y = B.cheerHandY + rise - 0.1;
  } else if (p.mateCheer) {
    top.x = lean - B.cheerBack * 0.9;
    top.y = B.mateCheerY + rise;
  } else if (act === 'pass') {
    // The follow-through: both hands pushed out along the ice toward where the puck went.
    low.x += B.passReach;
    low.y += B.passDrop;
    top.x += B.passReach * 0.7;
    top.y += B.passDrop * 0.5;
  } else if (act === 'poke') {
    low.x += B.pokeReach;
    low.y += B.passDrop;
    top.x += B.pokeReach * 0.5;
  } else if (act === 'hit') {
    // Shoulder down, hands tucked in.
    low.x = lean + 0.35;
    low.y = shY + 0.55;
    top.x = lean + 0.05;
    top.y = shY + 0.6;
  } else if (act === 'deke') {
    low.x += 0.1;
    low.y -= B.dekeLift;
    top.y -= B.dekeLift * 0.6;
  } else if (act === 'tired') {
    // Bent over, the stick across his knees.
    low.y = B.tiredHandY + rise;
    top.y = B.tiredHandY + rise - 0.15;
  }
  shapes.push(...arm(lean - 0.1, shY + 0.2, top.x, top.y, armW, false));

  shapes.push(limb('pants', 0, hipY + 0.02, lean * 0.3, hipY - 0.22, width * 0.9));
  const waist: [number, number] = [lean * 0.3, hipY - 0.22];
  const chest: [number, number] = [lean * 0.7, shY + 0.18];
  shapes.push(limb('jersey', waist[0], waist[1], chest[0], chest[1], width));
  shapes.push(...patternOn(p.pattern, waist, chest, width));
  shapes.push(...head(lean * B.headLean + B.headForward, B.headY + rise + drop, false, who));

  shapes.push(...arm(lean + 0.1, shY + 0.2, low.x, low.y, armW, who.mark === 'captain'));
  return { shapes, hand: low, stickEnd: null };
}

/** A goalie facing right: wide, in big pads; on his knees with the pads spread when he is down. */
function goalie(p: PoseInput, who: FigureLook): Raw {
  const build = F.builds[who.build];
  const shapes: Shape[] = [];
  const rise = p.down ? 0 : G.hipY * (build.legs - 1);
  const hipY = (p.down ? G.downHipY : G.hipY) + rise;
  const shY = hipY - G.torsoLength;
  if (p.down) {
    shapes.push(limb('pad', -0.2, -G.padWidth / 2, -G.downReach, -G.padWidth / 2 + 0.02, G.padWidth));
    shapes.push(limb('pad', 0.2, -G.padWidth / 2, G.downReach, -G.padWidth / 2 + 0.02, G.padWidth));
    for (const x of [-G.downReach * 0.6, G.downReach * 0.6]) shapes.push(limb('accent', x, -G.padWidth * 0.82, x, -G.padWidth * 0.2, G.padStripe, true));
  } else {
    for (const leg of [-1, 1]) {
      const x = G.padSpread * leg;
      shapes.push(limb('pad', x * 0.8, hipY + 0.1, x, -G.padWidth / 2, G.padWidth));
      shapes.push(limb('accent', x - 0.3, -0.62, x + 0.3, -0.62, G.padStripe, true));
      shapes.push(limb('accent', x - 0.3, -0.3, x + 0.3, -0.3, G.padStripe, true));
      shapes.push(...skate(x + 0.12, 0));
    }
  }
  // The catching glove, held out behind the body; thrown up and out for a glove save.
  const up = p.action === 'glove' ? 1 : 0;
  const catcher = { x: -G.catchX - up * G.gloveOut, y: shY + G.catchDrop - up * G.gloveUp };
  shapes.push(limb('jersey', -0.1, shY + 0.2, catcher.x, catcher.y, B.armWidth));
  shapes.push(circle('glove', catcher.x, catcher.y, G.catchRadius));
  shapes.push(circle('pad', catcher.x - 0.12, catcher.y - 0.1, G.catchRadius * 0.5, true));

  shapes.push(limb('pants', 0, hipY, 0, hipY - 0.2, G.pantsWidth * build.width));
  const waist: [number, number] = [0, hipY - 0.2];
  const chest: [number, number] = [0.1, shY + 0.18];
  shapes.push(limb('jersey', waist[0], waist[1], chest[0], chest[1], G.torsoWidth * build.width));
  shapes.push(...patternOn(p.pattern, waist, chest, G.torsoWidth * build.width));
  shapes.push(...head(G.headForward, shY - G.headRise, true, who));

  // The blocker, on the hand that holds the stick.
  const blocker = { x: G.blockerX, y: shY + G.blockerDrop };
  shapes.push(limb('jersey', 0.2, shY + 0.2, blocker.x, blocker.y, B.armWidth));
  const w = G.blockerWidth / 2;
  const h = G.blockerHeight / 2;
  shapes.push({
    kind: 'poly',
    tag: 'pad',
    points: [
      [blocker.x - w, blocker.y - h],
      [blocker.x + w, blocker.y - h],
      [blocker.x + w, blocker.y + h],
      [blocker.x - w, blocker.y + h],
    ],
  });
  return { shapes, hand: blocker, stickEnd: { x: G.stickX, y: -F.bladeWidth } };
}

function mapPoints(raw: Raw, f: (x: number, y: number) => [number, number]): Raw {
  const at = (v: { x: number; y: number }): { x: number; y: number } => {
    const [x, y] = f(v.x, v.y);
    return { x, y };
  };
  const shapes = raw.shapes.map((s): Shape => {
    if (s.kind === 'circle') return { ...s, ...at(s) };
    if (s.kind === 'limb') {
      const [x1, y1] = f(s.x1, s.y1);
      const [x2, y2] = f(s.x2, s.y2);
      return { ...s, x1, y1, x2, y2 };
    }
    return { ...s, points: s.points.map(([x, y]) => f(x, y)) };
  });
  return { shapes, hand: at(raw.hand), stickEnd: raw.stickEnd ? at(raw.stickEnd) : null };
}

function scaled(raw: Raw, k: number): Raw {
  const moved = mapPoints(raw, (x, y) => [x * k, y * k]);
  return {
    ...moved,
    shapes: moved.shapes.map((s): Shape => (s.kind === 'circle' ? { ...s, r: s.r * k } : s.kind === 'limb' ? { ...s, w: s.w * k } : s)),
  };
}

/** The highest point any shape reaches. */
function topOf(shapes: readonly Shape[]): number {
  let top = 0;
  for (const s of shapes) {
    if (s.kind === 'circle') top = Math.min(top, s.y - s.r);
    else if (s.kind === 'limb') top = Math.min(top, Math.min(s.y1, s.y2) - s.w / 2);
    else for (const [, y] of s.points) top = Math.min(top, y);
  }
  return top;
}

/** A standing skater of ordinary build is drawn exactly `height` footprint radii tall; everything else keeps the same scale. */
const SCALE = F.height / -topOf(skater(STANDING, PLAIN_LOOK).shapes);

/**
 * The figure in a pose: an upright big-headed cartoon player seen from the side, as a list of shapes to
 * paint back to front. It is built facing right, then mirrored to face left and tipped over if he is off
 * balance, so the two directions are exact mirror images. `who` is what is particular to the player.
 */
export function figure(pose: PoseInput, who: FigureLook = PLAIN_LOOK): Figure {
  let raw = scaled(pose.goalie ? goalie(pose, who) : skater(pose, who), SCALE);
  if (pose.side === -1) raw = mapPoints(raw, (x, y) => [-x, y]);
  if (pose.tilt !== 0) {
    const cos = Math.cos(pose.tilt * pose.side);
    const sin = Math.sin(pose.tilt * pose.side);
    raw = mapPoints(raw, (x, y) => [x * cos - y * sin, x * sin + y * cos]);
  }
  return { ...raw, top: topOf(raw.shapes) };
}

/** A few letters that name a look, for telling one player's pictures from another's. */
export function lookKey(who: FigureLook): string {
  return `${who.build}.${who.hair}.${who.beard}.${who.mark ?? ''}`;
}

/**
 * Which way a player faces on screen. He keeps the side he had while he faces nearly straight up or down
 * the screen, so he does not flicker between left and right.
 */
export function facingSide(facing: number, previous: 1 | -1 | undefined): 1 | -1 {
  const across = Math.cos(facing);
  if (previous !== undefined && Math.abs(across) < F.sideDeadBand) return previous;
  return across >= 0 ? 1 : -1;
}

/** Which jersey a team wears: its colour at home, white on the road. */
export type Kit = 'home' | 'away';

/**
 * The colour of each kind of piece for a team. At home: its main colour on the jersey, its second colour as
 * the accent and socks. On the road: a white jersey, with the main colour on the helmet, the jersey's
 * pattern, the gloves, pants and socks, so the two sides are one dark and one white. Skin and hair are the
 * player's own.
 */
export function figureColours(crest: Crest, goalie: boolean, skin: string, kit: Kit = 'home', hair: string = F.colours.hair): Record<Tag, string> {
  const own = { skin, hair, eye: F.colours.eye, visor: F.colours.visor, cage: F.colours.cage, skate: look.colours.skate, blade: F.colours.blade, pad: F.colours.pad, stick: look.colours.stick, mark: F.colours.mark };
  if (kit === 'away') {
    const K = F.awayKit;
    return {
      ...own,
      helmet: lighten(crest.primary, K.helmetLighten),
      jersey: goalie ? K.goalieJersey : K.jersey,
      accent: crest.primary,
      glove: crest.primary,
      pants: crest.primary,
      sock: crest.primary,
    };
  }
  return {
    ...own,
    helmet: lighten(crest.primary, goalie ? F.goalieHelmetLighten : F.helmetLighten),
    jersey: goalie ? lighten(crest.primary, look.goalieLighten) : crest.primary,
    accent: crest.secondary,
    glove: F.colours.glove,
    pants: F.colours.pants,
    sock: crest.secondary,
  };
}

/** A skin tone for a player whose own look is not known, the same every time for the same number. */
export function skinTone(id: number): string {
  const tones = F.colours.skin;
  return tones[(id * 7 + 3) % tones.length] as string;
}

/**
 * The figure's shapes with his stick added: a shaft from above his lower hand down to `end` (where the blade
 * meets the ice, in the figure's units) and the blade lying along the ice. It is slipped in behind his near
 * arm, so the glove is seen gripping it.
 */
export function withStick(fig: Figure, end: { x: number; y: number }, side: 1 | -1): Shape[] {
  const dx = end.x - fig.hand.x;
  const dy = end.y - fig.hand.y;
  const length = Math.hypot(dx, dy) || 1;
  const butt = { x: fig.hand.x - (dx / length) * F.stickGrip, y: fig.hand.y - (dy / length) * F.stickGrip };
  const stick: Shape[] = [
    { kind: 'limb', tag: 'stick', x1: butt.x, y1: butt.y, x2: end.x, y2: end.y, w: F.stickWidth, bare: true },
    { kind: 'limb', tag: 'stick', x1: end.x, y1: end.y, x2: end.x + side * F.bladeLength, y2: end.y, w: F.stickWidth * 1.4, bare: true },
  ];
  // Behind the near arm: its sleeve, stripe, glove and (for a captain) band are the last pieces.
  const last = fig.shapes[fig.shapes.length - 1];
  const near = last && last.kind === 'poly' ? 1 : nearArmPieces(fig.shapes);
  const at = Math.max(0, fig.shapes.length - near);
  return [...fig.shapes.slice(0, at), ...stick, ...fig.shapes.slice(at)];
}

/** How many pieces at the end of a skater's list are his near arm: the sleeve, its stripe, the glove, and a band if he has one. */
function nearArmPieces(shapes: readonly Shape[]): number {
  let n = 0;
  for (let i = shapes.length - 1; i >= 0; i--) {
    n += 1;
    const s = shapes[i] as Shape;
    if (s.tag === 'jersey' && s.kind === 'limb') break;
  }
  return n;
}
