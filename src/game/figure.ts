import type { Crest, JerseyPattern } from '../core/crest';
import { mascotLook, type MascotKind } from '../core/mascotKind';
import type { PlayerLook } from '../core/playerLook';
import mascotData from '../data/mascotLook.json';
import { lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';

const F = look.figure;
const B = F.body;
const G = F.goalie;

/** What a shape of the figure is, which decides its colour. */
export type Tag = 'skin' | 'hair' | 'eye' | 'helmet' | 'visor' | 'cage' | 'jersey' | 'accent' | 'glove' | 'pants' | 'sock' | 'skate' | 'blade' | 'pad' | 'stick' | 'mark' | 'fur' | 'muzzle';

export const TAGS: readonly Tag[] = ['skin', 'hair', 'eye', 'helmet', 'visor', 'cage', 'jersey', 'accent', 'glove', 'pants', 'sock', 'skate', 'blade', 'pad', 'stick', 'mark', 'fur', 'muzzle'];

/**
 * One piece of the figure. A limb is a thick line with round ends. `bare` pieces get no outline round them;
 * `far` pieces are on the side of him away from us, and are drawn a shade darker.
 */
export type Shape =
  | { kind: 'circle'; tag: Tag; x: number; y: number; r: number; bare?: boolean; far?: boolean }
  | { kind: 'limb'; tag: Tag; x1: number; y1: number; x2: number; y2: number; w: number; bare?: boolean; far?: boolean }
  | { kind: 'poly'; tag: Tag; points: [number, number][]; bare?: boolean; far?: boolean };

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
  /** Gliding on both skates: he keeps his lean for his speed but takes no strides. */
  glide?: boolean;
  /** A pass just made, a poke or a hit being thrown, a deke, a tired glide; for a goalie, the glove thrown up. */
  action?: Action;
  pattern: JerseyPattern;
}

/** The parts of a player's look that change the shapes drawn. (His colours are in `figureColours`.) */
export type FigureLook = Pick<PlayerLook, 'hair' | 'beard' | 'build' | 'mark' | 'costume'>;

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
  /** How many pieces at the end of the list are his near arm, which the stick goes behind. */
  nearArm: number;
}

export const STANDING: PoseInput = { side: 1, stride: 0, speed: 0, windUp: 0, goalie: false, down: false, tilt: 0, pattern: 'hoop' };

type Raw = Pick<Figure, 'shapes' | 'hand' | 'stickEnd'>;

type P = [number, number];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const circle = (tag: Tag, at: P, r: number, bare = false): Shape => ({ kind: 'circle', tag, x: at[0], y: at[1], r, ...(bare ? { bare } : {}) });
const limb = (tag: Tag, a: P, b: P, w: number, bare = false): Shape => ({ kind: 'limb', tag, x1: a[0], y1: a[1], x2: b[0], y2: b[1], w, ...(bare ? { bare } : {}) });
const poly = (tag: Tag, points: P[], bare = false): Shape => ({ kind: 'poly', tag, points, ...(bare ? { bare } : {}) });
const between = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const far = (shapes: Shape[]): Shape[] => shapes.map((s) => ({ ...s, far: true }));

/** A limb that is thicker at one end than the other: the outline round two circles. */
function taper(tag: Tag, a: P, ra: number, b: P, rb: number): Shape {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d <= Math.abs(ra - rb) + 1e-3) return ra >= rb ? circle(tag, a, ra) : circle(tag, b, rb);
  const base = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const phi = Math.acos((ra - rb) / d);
  const points: P[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const at = base + phi + ((2 * Math.PI - 2 * phi) * i) / steps;
    points.push([a[0] + Math.cos(at) * ra, a[1] + Math.sin(at) * ra]);
  }
  for (let i = 0; i <= steps; i++) {
    const at = base - phi + (2 * phi * i) / steps;
    points.push([b[0] + Math.cos(at) * rb, b[1] + Math.sin(at) * rb]);
  }
  return poly(tag, points);
}

/** A closed curve through the points given, as a many-sided shape. */
function smooth(points: P[], per = 4): P[] {
  const n = points.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i - 1 + n) % n]!, points[i]!, points[(i + 1) % n]!, points[(i + 2) % n]!];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const at = (j: 0 | 1): number => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t * t * t);
      out.push([at(0), at(1)]);
    }
  }
  return out;
}

/** A stripe round a limb from `a` to `b`: the part between `from` and `to` of the way along. */
function band(tag: Tag, a: P, ra: number, b: P, rb: number, from: number, to: number): Shape {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: P = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
  const edge = (t: number, side: number): P => {
    const [x, y] = between(a, b, t);
    const r = ra + (rb - ra) * t;
    return [x + n[0] * r * side, y + n[1] * r * side];
  };
  return poly(tag, [edge(from, 1), edge(to, 1), edge(to, -1), edge(from, -1)], true);
}

/**
 * Two bones from `root` reaching for `target`: where the joint between them is, and where the end comes
 * to (the target, or as near as the bones reach). `bend` says which way the joint sticks out.
 */
function reach(root: P, target: P, first: number, second: number, bend: 1 | -1): { mid: P; end: P } {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const span = Math.max(Math.abs(first - second) + 1e-3, Math.min(d, (first + second) * 0.995));
  const base = Math.atan2(dy, dx);
  const corner = Math.acos(Math.max(-1, Math.min(1, (first * first + span * span - second * second) / (2 * first * span))));
  const at = base + bend * corner;
  return { mid: [root[0] + Math.cos(at) * first, root[1] + Math.sin(at) * first], end: [root[0] + (dx / d) * span, root[1] + (dy / d) * span] };
}

/** A skate whose sole would rest at (x, y) if it were flat: the boot and the steel, tipped toe-down by `pitch` radians about the ankle. */
function boot(x: number, y: number, pitch = 0): Shape[] {
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  // Turned about the ankle, so the shin stays joined to it.
  const at = (u: number, v: number): P => [x + u * cos - (v + B.ankle) * sin, y - B.ankle + u * sin + (v + B.ankle) * cos];
  return [
    poly('skate', [at(-0.26, -0.1), at(-0.25, -0.5), at(0.06, -0.52), at(0.15, -0.32), at(0.46, -0.27), at(0.59, -0.15), at(0.57, -0.08), at(-0.26, -0.08)]),
    limb('blade', at(-0.32, -0.02), at(0.62, -0.02), F.bladeWidth, true),
  ];
}

/** One leg from the hip to the ice: hockey pants to the knee, a striped sock over the shin pad, a skate. */
function leg(hip: P, foot: P, thigh: number, shin: number, width: number, pitch = 0): Shape[] {
  const ankle: P = [foot[0], foot[1] - B.ankle];
  const { mid: knee, end } = reach(hip, ankle, thigh, shin, -1);
  return [
    taper('sock', knee, B.kneeRadius, end, B.ankleRadius),
    band('accent', knee, B.kneeRadius, end, B.ankleRadius, 0.42, 0.56),
    band('accent', knee, B.kneeRadius, end, B.ankleRadius, 0.64, 0.72),
    taper('pants', hip, B.thighRadius * width, between(hip, knee, B.pantsTo), B.kneeRadius * 1.1),
    ...boot(end[0], end[1] + B.ankle, pitch),
  ];
}

/** An arm from the shoulder to a glove at `target`, bent at the elbow, with a stripe round the forearm. */
function arm(root: P, target: P, width: number, captain: boolean): { shapes: Shape[]; hand: P } {
  const { mid: elbow, end: hand } = reach(root, target, B.upperArm, B.foreArm, 1);
  const shoulder = B.shoulderRadius * Math.sqrt(width);
  const shapes: Shape[] = [taper('jersey', root, shoulder, elbow, B.elbowRadius), taper('jersey', elbow, B.elbowRadius, between(elbow, hand, 0.8), B.wristRadius), band('accent', elbow, B.elbowRadius, hand, B.wristRadius, 0.22, 0.46)];
  if (captain) shapes.push(band('mark', root, shoulder, elbow, B.elbowRadius, 0.5, 0.78));
  shapes.push(taper('glove', between(elbow, hand, 0.62), B.wristRadius + 0.1, hand, B.fist * 0.86), circle('glove', hand, B.fist));
  return { shapes, hand };
}

/** The hair that shows below the back of the helmet, in the head's own units. */
function hairBehind(style: FigureLook['hair'], at: (x: number, y: number) => P, r: number): Shape[] {
  switch (style) {
    case 'bald':
      return [];
    case 'buzz':
      return [circle('hair', at(-0.62, 0.42), 0.2 * r)];
    case 'flow':
      return [circle('hair', at(-0.74, 0.42), 0.36 * r), limb('hair', at(-0.8, 0.5), at(-0.98, 1.05), 0.4 * r)];
    case 'curly':
      return [circle('hair', at(-0.84, 0.32), 0.28 * r), circle('hair', at(-0.76, 0.66), 0.3 * r), circle('hair', at(-0.5, 0.86), 0.24 * r)];
    default:
      return [circle('hair', at(-0.72, 0.42), 0.32 * r)];
  }
}

/**
 * A mascot's costume head, seen from the side: a big round head of fur with the ears, snout and markings
 * of the animal he is, one large eye with a brow, and a grin. No helmet.
 */
function mascotHead(centre: P, tilt: number, costume: MascotKind): Shape[] {
  const K = mascotLook(costume);
  const r = B.headRadius * mascotData.headScale;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const lift = -0.35;
  const at = (x: number, y: number): P => [centre[0] + (x * cos - (y + lift) * sin) * r, centre[1] + (x * sin + (y + lift) * cos) * r];
  const bare = (s: Shape): Shape => ({ ...s, bare: true });
  const out: Shape[] = [];
  if (K.ears === 'round') out.push(circle('fur', at(-0.5, -1.0), 0.42 * r), circle('muzzle', at(-0.5, -1.0), 0.22 * r, true));
  else if (K.ears === 'small') out.push(circle('fur', at(-0.6, -0.95), 0.27 * r));
  else if (K.ears === 'pointed') out.push(poly('fur', [at(-0.98, -0.55), at(-0.78, -1.8), at(-0.08, -1.0)]), poly('muzzle', [at(-0.8, -0.85), at(-0.72, -1.45), at(-0.36, -1.0)], true));
  else if (K.ears === 'tufts') out.push(poly('fur', [at(-0.75, -0.8), at(-0.9, -1.65), at(-0.25, -1.05)]), poly('fur', [at(0.1, -1.05), at(0.38, -1.7), at(0.62, -0.9)]));
  else if (K.ears === 'crest') out.push(limb('fur', at(-0.3, -1.0), at(-0.95, -1.6), 0.24 * r), limb('fur', at(-0.1, -1.05), at(-0.5, -1.85), 0.24 * r), limb('fur', at(0.1, -1.05), at(0.05, -1.8), 0.24 * r));
  else out.push(circle('fur', at(-0.78, -0.75), 0.26 * r), limb('muzzle', at(-0.2, -1.0), at(-0.5, -1.95), 0.17 * r), limb('muzzle', at(-0.42, -1.62), at(-1.0, -1.85), 0.15 * r), limb('muzzle', at(-0.35, -1.4), at(0.2, -1.9), 0.15 * r));
  out.push(circle('fur', at(0, -0.1), 1.15 * r));
  if (K.snout === 'long') out.push(circle('muzzle', at(0.2, 0.45), 0.58 * r, true));
  if (K.snout === 'beak' && K.ears === 'tufts') out.push(circle('muzzle', at(0.4, -0.2), 0.62 * r, true));
  if (K.stripe) out.push(limb('eye', at(1.15, 0.05), at(-0.3, -0.95), 0.36 * r, true));
  if (K.snout === 'short') out.push(circle('muzzle', at(0.72, 0.3), 0.56 * r), circle('eye', at(1.2, 0.12), 0.16 * r, true));
  else if (K.snout === 'long') out.push(poly('muzzle', smooth([at(0.2, -0.05), at(1.0, -0.02), at(1.62, 0.2), at(1.64, 0.5), at(1.0, 0.76), at(0.2, 0.8)], 3)), circle('eye', at(1.62, 0.24), 0.17 * r, true));
  else out.push(poly('mark', [at(0.72, -0.06), at(K.ears === 'tufts' ? 1.4 : 1.85, 0.34), at(0.72, 0.64)]));
  out.push(bare(circle('pad', at(0.42, -0.32), 0.28 * r)), bare(circle('eye', at(0.5, -0.3), 0.14 * r)), limb('eye', at(0.14, -0.74), at(0.76, -0.54), 0.1 * r, true));
  if (K.snout !== 'beak') out.push(limb('eye', at(0.58, 0.64), at(K.snout === 'long' ? 1.3 : 1.02, 0.56), 0.07 * r, true));
  return out;
}

/** A mascot's tail, behind his hips: a bushy one with a pale tip, or a thick one that tapers. */
function tail(hip: P, costume: MascotKind): Shape[] {
  const K = mascotLook(costume);
  if (K.tail === 'bushy') return [taper('fur', [hip[0] - 0.3, hip[1] - 0.1], 0.2, [hip[0] - 1.05, hip[1] - 0.5], 0.36), circle('muzzle', [hip[0] - 1.2, hip[1] - 0.6], 0.22, true)];
  if (K.tail === 'thick') return [taper('fur', [hip[0] - 0.25, hip[1]], 0.3, [hip[0] - 1.0, hip[1] + 0.45], 0.14)];
  return [];
}

/**
 * The head, seen from the side: a face in profile with a brow, a nose and a jaw, his beard and the hair at
 * his nape, and over it the helmet, with a visor for a skater and a cage and chin guard for a goalie.
 * A mascot wears a costume head instead (`mascotHead`).
 */
function head(centre: P, tilt: number, caged: boolean, who: FigureLook): Shape[] {
  const r = B.headRadius;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const at = (x: number, y: number): P => [centre[0] + (x * cos - y * sin) * r, centre[1] + (x * sin + y * cos) * r];
  if (who.mark === 'mascot') return mascotHead(centre, tilt, who.costume ?? 'bear');
  const out: Shape[] = [...hairBehind(who.hair, at, r)];
  out.push(
    poly('skin', [at(-0.3, 0.3), at(-0.2, 0.78), at(0.4, 1.02), at(0.68, 0.94), at(0.76, 0.7), at(0.72, 0.5), at(0.98, 0.42), at(0.82, 0.1), at(0.84, -0.14), at(0.6, -0.5), at(-0.3, -0.5)]),
  );
  if (who.beard === 'full') out.push(poly('hair', [at(-0.22, 0.42), at(0.3, 0.6), at(0.7, 0.56), at(0.76, 0.7), at(0.68, 0.94), at(0.4, 1.06), at(-0.22, 0.82)], true));
  else if (who.beard === 'stubble') out.push(limb('hair', at(-0.08, 0.76), at(0.5, 0.94), 0.1 * r, true));
  else if (who.beard === 'moustache') out.push(limb('hair', at(0.54, 0.52), at(0.8, 0.54), 0.11 * r, true));
  if (who.hair === 'side' || who.hair === 'flow') out.push(circle('hair', at(0.5, -0.22), 0.16 * r, true));
  out.push(circle('eye', at(0.6, 0.1), 0.1 * r, true), limb('eye', at(0.42, -0.08), at(0.78, 0), 0.06 * r, true), limb('eye', at(0.54, 0.7), at(0.74, 0.68), 0.05 * r, true));

  // The helmet: a shell from the brow over the crown to the nape, cut away round the ear.
  out.push(poly('helmet', smooth([at(0.9, -0.22), at(0.84, -0.66), at(0.36, -1.04), at(-0.38, -1.03), at(-0.98, -0.54), at(-1.0, 0.1), at(-0.52, 0.44), at(-0.14, 0.3), at(-0.06, -0.1), at(0.4, -0.2)])));
  const crown: P[] = [at(0.64, -0.7), at(0.22, -0.88), at(-0.3, -0.87), at(-0.72, -0.6)];
  for (let i = 1; i < crown.length; i++) out.push(limb('accent', crown[i - 1]!, crown[i]!, 0.15 * r, true));
  out.push(limb('cage', at(0.02, -0.5), at(0.22, -0.56), 0.06 * r, true), limb('cage', at(-0.42, -0.46), at(-0.22, -0.52), 0.06 * r, true), circle('cage', at(-0.4, 0.12), 0.1 * r, true));
  if (caged) {
    out.push(poly('helmet', [at(-0.24, 0.5), at(0.3, 0.74), at(0.86, 0.7), at(0.8, 1.0), at(0.34, 1.14), at(-0.28, 0.88)]));
    for (const y of [-0.12, 0.16, 0.44]) out.push(limb('cage', at(0.3, y - 0.04), at(1.04, y + 0.06), 0.06 * r, true));
    for (const x of [0.52, 0.8, 1.04]) out.push(limb('cage', at(x, -0.16), at(x, 0.7), 0.06 * r, true));
  } else {
    out.push(limb('visor', at(0.92, -0.22), at(1.1, 0.12), 0.07 * r, true), limb('visor', at(1.1, 0.12), at(0.98, 0.4), 0.07 * r, true));
    out.push(limb('cage', at(-0.3, 0.42), at(0.3, 0.92), 0.06 * r, true));
  }
  return out;
}

/** The jersey over the body, from the hem to the shoulders, with the team's pattern on it. */
function jersey(pattern: PoseInput['pattern'], at: (u: number, v: number) => P): Shape[] {
  const out: Shape[] = [poly('jersey', smooth([at(-0.14, -0.38), at(0.4, -0.43), at(0.9, -0.4), at(1.08, -0.16), at(1.06, 0.14), at(0.9, 0.42), at(0.5, 0.5), at(0.12, 0.46), at(-0.16, 0.38)]))];
  out.push(limb('accent', at(-0.03, -0.3), at(-0.05, 0.32), 0.13, true));
  if (pattern === 'hoop') out.push(limb('accent', at(0.46, -0.33), at(0.46, 0.4), 0.17, true));
  else if (pattern === 'yoke') out.push(poly('accent', [at(0.8, -0.36), at(0.96, -0.3), at(1.03, -0.12), at(1.01, 0.12), at(0.92, 0.32), at(0.78, 0.38)], true));
  else out.push(limb('accent', at(0.16, -0.28), at(0.88, 0.32), 0.17, true));
  return out;
}

type Built = Raw & { nearArm: number };

/** A skater facing right, in his own units before scaling. */
function skater(p: PoseInput, who: FigureLook): Built {
  const build = F.builds[who.build];
  const speed = clamp01(p.speed);
  const wind = clamp01(p.windUp);
  const act = p.action;
  // How much of a full stride he takes: none standing or gliding slowly, a shorter one at half speed.
  const going = speed <= 0 || p.glide ? 0 : B.slowStride + (1 - B.slowStride) * speed;
  // He sinks a little twice a stride, as each leg takes his weight.
  const bob = B.bob * going * Math.cos(2 * p.stride);
  const drop = B.crouch * speed + bob + (p.kneel ? B.kneelDrop : 0) + (act === 'hit' ? B.hitDrop : act === 'tired' ? B.tiredDrop : 0);
  const lean = p.cheer ? 0 : B.lean + speed * B.speedLean + (act === 'poke' ? B.pokeLean : act === 'hit' ? B.hitLean : act === 'deke' ? B.dekeLean : act === 'tired' ? B.tiredLean : 0);
  const hip: P = [-Math.sin(lean) * 0.4, B.hipY * build.legs + drop];
  const up: P = [Math.sin(lean), -Math.cos(lean)];
  const out: P = [Math.cos(lean), Math.sin(lean)];
  // A point on the body: `u` of the way up the spine, `v` body-widths in front of it.
  const body = (u: number, v: number): P => [hip[0] + up[0] * u * B.spine + out[0] * v * build.width, hip[1] + up[1] * u * B.spine + out[1] * v * build.width];
  const shoulder = body(0.9, 0.02);
  const shapes: Shape[] = [];

  // A stride, for each leg half a turn apart: the skate pushes back along the ice from in front of him to
  // behind, then lifts, toe down, and is carried forward again. Standing, his feet are simply apart.
  const step = (side: 1 | -1): { foot: P; pitch: number } => {
    const at = p.stride + (side === 1 ? 0 : Math.PI);
    const lifted = Math.max(0, -Math.sin(at));
    const x = side * B.stance * (1 - going) + going * (B.strideReach * Math.cos(at) - B.strideBack);
    return { foot: [x, -B.footLift * lifted * going], pitch: B.toeDown * lifted * (0.5 - 0.5 * Math.cos(at)) * going };
  };
  const [farStep, nearStep] = [step(-1), step(1)];
  if (who.mark === 'mascot') shapes.push(...tail(hip, who.costume ?? 'bear'));
  const sway = Math.cos(p.stride) * B.armSwing * going;
  shapes.push(...far(leg([hip[0] - 0.06, hip[1]], farStep.foot, B.thigh * build.legs, B.shin * build.legs, build.width, farStep.pitch)));

  // Hands on the stick: the lower hand out in front, the top hand above and behind it.
  let low: P = [hip[0] + B.lowHand[0]! + (lean - B.lean) * 0.5 - sway, hip[1] + B.lowHand[1]! + sway * 0.5];
  let top: P = [low[0] + B.topHand[0]! + sway * 0.5, low[1] + B.topHand[1]!];
  low = [low[0] - wind * B.windBack * 0.75, low[1] - wind * B.windUp];
  top = [top[0] - wind * B.windBack, top[1] - wind * B.windUp * 0.85];
  if (p.cheer) {
    top = [shoulder[0] - B.cheerOut, shoulder[1] - B.cheerUp];
    low = [shoulder[0] + B.cheerOut + 0.1, shoulder[1] - B.cheerUp - 0.06];
  } else if (p.mateCheer) {
    top = [shoulder[0] - B.cheerOut * 0.7, shoulder[1] - B.cheerUp];
  } else if (act === 'pass') {
    low = [low[0] + B.passReach, low[1] + 0.2];
    top = [top[0] + B.passReach * 0.7, top[1] + 0.12];
  } else if (act === 'poke') {
    low = [low[0] + B.pokeReach, low[1] + 0.2];
    top = [top[0] + B.pokeReach * 0.5, top[1] + 0.1];
  } else if (act === 'hit') {
    low = [shoulder[0] + 0.34, shoulder[1] + 0.66];
    top = [shoulder[0] + 0.08, shoulder[1] + 0.7];
  } else if (act === 'deke') {
    low = [low[0] + 0.12, low[1] - 0.3];
    top = [top[0], top[1] - 0.18];
  } else if (act === 'tired') {
    low = [hip[0] + 0.7, hip[1] + 0.62];
    top = [hip[0] + 0.5, hip[1] + 0.5];
  }
  shapes.push(...far(arm(body(0.9, -0.06), top, build.width, false).shapes));

  shapes.push(...leg([hip[0] + 0.06, hip[1]], nearStep.foot, B.thigh * build.legs, B.shin * build.legs, build.width, nearStep.pitch));
  shapes.push(circle('pants', hip, B.hipRadius * build.width));
  const headAt = body(0.9 + (B.neck + B.headRadius * 0.92) / B.spine, 0.1);
  shapes.push(limb(who.mark === 'mascot' ? 'fur' : 'skin', body(0.92, 0.04), between(body(0.92, 0.04), headAt, 0.7), 0.4));
  shapes.push(...jersey(p.pattern, body));
  shapes.push(...head(headAt, (lean - B.lean) * B.headTilt, false, who));

  const near = arm(shoulder, low, build.width, who.mark === 'captain');
  shapes.push(...near.shapes);
  return { shapes, hand: { x: near.hand[0], y: near.hand[1] }, stickEnd: null, nearArm: near.shapes.length };
}

/** A goalie facing right: wide, behind tall leg pads; on his knees with the pads along the ice when he is down. */
function goalie(p: PoseInput, who: FigureLook): Built {
  const build = F.builds[who.build];
  const hip: P = [0, p.down ? G.downHipY : G.hipY * build.legs];
  const up: P = [Math.sin(G.lean), -Math.cos(G.lean)];
  const out: P = [Math.cos(G.lean), Math.sin(G.lean)];
  const wide = G.width * build.width;
  const body = (u: number, v: number): P => [hip[0] + up[0] * u * G.spine + out[0] * v * wide, hip[1] + up[1] * u * G.spine + out[1] * v * wide];
  const shoulder = body(0.9, 0.02);
  const shapes: Shape[] = [];
  const half = G.padWidth / 2;

  // The catching glove, on the far hand, held out behind him; thrown up and out for a glove save.
  const lift = p.action === 'glove' ? 1 : 0;
  const catcher = arm(body(0.9, -0.1), [hip[0] + G.catcher[0]! - lift * G.gloveOut, shoulder[1] + 0.5 + G.catcher[1]! - lift * G.gloveUp], 1, false);
  shapes.push(...far(catcher.shapes.slice(0, 3)), ...far([circle('glove', catcher.hand, G.catchRadius)]), ...far([circle('pad', [catcher.hand[0] - 0.1, catcher.hand[1] - 0.08], G.catchRadius * 0.5, true)]));

  if (p.down) {
    shapes.push(...far([limb('pad', [-0.2, -half], [-G.downReach, -half + 0.02], G.padWidth)]));
    shapes.push(limb('pad', [0.2, -half], [G.downReach, -half + 0.02], G.padWidth));
    for (const x of [-G.downReach * 0.62, G.downReach * 0.62]) shapes.push(limb('accent', [x, -G.padWidth * 0.84], [x, -G.padWidth * 0.18], 0.12, true));
    shapes.push(...boot(G.downReach - 0.1, 0).slice(0, 1));
  } else {
    for (const side of [-1, 1] as const) {
      const x = side * G.padSpread;
      const pad: Shape[] = [
        ...boot(x + 0.14, 0),
        poly('pad', smooth([[x - half, -0.12], [x - half - 0.03, -1.0], [x - half + 0.06, -1.0 - G.padTop], [x + half - 0.04, -1.0 - G.padTop], [x + half + 0.05, -1.0], [x + half, -0.12]], 3)),
        limb('accent', [x - half * 0.75, -0.98], [x + half * 0.75, -0.98], 0.1, true),
        limb('accent', [x - half * 0.75, -0.42], [x + half * 0.75, -0.42], 0.1, true),
        limb('accent', [x, -0.9], [x, -0.5], 0.08, true),
      ];
      shapes.push(...(side === -1 ? far(pad) : pad));
    }
  }
  shapes.push(circle('pants', hip, 0.62 * build.width));
  const headAt = body(0.9 + (B.neck + B.headRadius * 0.9) / G.spine, 0.08);
  shapes.push(limb('skin', body(0.92, 0.03), between(body(0.92, 0.03), headAt, 0.7), 0.4));
  shapes.push(...jersey(p.pattern, body));
  shapes.push(...head(headAt, 0, true, who));

  // The blocker, on the hand that holds the stick.
  const near = arm(shoulder, [hip[0] + G.blocker[0]!, shoulder[1] + 0.5 + G.blocker[1]!], 1, false);
  const [bx, by] = near.hand;
  const w = G.blockerWidth / 2;
  const h = G.blockerHeight / 2;
  const blocker: Shape[] = [...near.shapes.slice(0, 3), poly('pad', [[bx - w, by - h], [bx + w, by - h], [bx + w, by + h], [bx - w, by + h]]), limb('accent', [bx - w * 0.6, by - h * 0.5], [bx + w * 0.6, by - h * 0.5], 0.09, true)];
  shapes.push(...blocker);
  return { shapes, hand: { x: near.hand[0], y: near.hand[1] }, stickEnd: { x: G.stickX, y: -F.bladeWidth }, nearArm: blocker.length };
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
 * The player in a pose, drawn as a comic figure seen from the side: a body with a shaped jersey, arms and
 * legs that bend at the elbow and knee, a face in profile under the helmet, and the far arm and leg in
 * shadow. A list of shapes to paint back to front. It is built facing right, then mirrored to face left and
 * tipped over if he is off balance, so the two directions are exact mirror images. `who` is what is
 * particular to the player. (The owner chose it from three drawn candidates.)
 */
export function figure(pose: PoseInput, who: FigureLook = PLAIN_LOOK): Figure {
  const built = pose.goalie ? goalie(pose, who) : skater(pose, who);
  let raw: Raw = scaled(built, SCALE);
  if (pose.side === -1) raw = mapPoints(raw, (x, y) => [-x, y]);
  if (pose.tilt !== 0) {
    const cos = Math.cos(pose.tilt * pose.side);
    const sin = Math.sin(pose.tilt * pose.side);
    raw = mapPoints(raw, (x, y) => [x * cos - y * sin, x * sin + y * cos]);
  }
  return { ...raw, top: topOf(raw.shapes), nearArm: built.nearArm };
}

/** A few letters that name a look, for telling one player's pictures from another's. */
export function lookKey(who: FigureLook): string {
  return `${who.build}.${who.hair}.${who.beard}.${who.mark ?? ''}.${who.costume ?? ''}`;
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
export function figureColours(crest: Crest, goalie: boolean, skin: string, kit: Kit = 'home', hair: string = F.colours.hair, costume?: MascotKind): Record<Tag, string> {
  const fur = mascotLook(costume ?? 'bear');
  // A mascot's paws and legs are fur, whatever kit his club wears.
  const paws = costume ? { glove: fur.fur, sock: fur.fur } : {};
  const own = { fur: fur.fur, muzzle: fur.muzzle, skin, hair, eye: F.colours.eye, visor: F.colours.visor, cage: F.colours.cage, skate: look.colours.skate, blade: F.colours.blade, pad: F.colours.pad, stick: look.colours.stick, mark: F.colours.mark };
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
      ...paws,
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
    ...paws,
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
  // Behind the near arm, which is the last pieces of the list.
  const at = Math.max(0, fig.shapes.length - fig.nearArm);
  return [...fig.shapes.slice(0, at), ...stick, ...fig.shapes.slice(at)];
}
