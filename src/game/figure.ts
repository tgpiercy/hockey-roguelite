import type { Crest, JerseyPattern } from '../core/crest';
import { mascotLook, type MascotKind } from '../core/mascotKind';
import type { PlayerLook } from '../core/playerLook';
import mascotData from '../data/mascotLook.json';
import { darken, lighten } from '../core/teamColours';
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
/** How a skater is seen: side-on, coming toward us, or going away. */
export type View = 'side' | 'front' | 'back' | 'quarter' | 'quarterBack';

export type Action = 'pass' | 'poke' | 'hit' | 'deke' | 'tired' | 'shot' | 'stop' | 'glove' | 'kick' | 'slide' | 'rise' | 'post';
export const ACTIONS: readonly Action[] = ['pass', 'poke', 'hit', 'deke', 'tired', 'shot', 'stop', 'glove', 'kick', 'slide', 'rise', 'post'];
/** The ones that are a goalie's. */
export const GOALIE_ACTIONS: readonly Action[] = ['glove', 'kick', 'slide', 'rise', 'post'];

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
  /** Knocked flat on the ice by a big hit. */
  fallen?: boolean;
  /** A goalie: how near the play is, from 0 (at the other end: he stands easy) to 1 (in his end: set). Left out, set. */
  alert?: number;
  /** Which way he is seen: from the side (the usual), or from the front or behind when he skates down or up the rink. */
  view?: View;
  /** A pass just made, a poke or a hit being thrown, a deke, a tired glide; for a goalie, the glove thrown up. */
  action?: Action;
  /**
   * How far into what he is doing he is drawn, 0 to 1 (left out: all the way): part-way between the same man without
   * his action, his cheer or his pads down, and with them. It is what lets a move ease in and out instead of snapping.
   */
  amount?: number;
  /** Carving a hard turn: he stops striding, crosses one skate over and leans in. 1 turns toward us, -1 away. */
  carve?: 1 | -1;
  /** Which cheer the scorer gives: left out, arms up; 1, up on his toes with his arms flung wide; 2, sliding on his knees with his fists up. */
  cheerStyle?: 1 | 2;
  pattern: JerseyPattern;
}

/** The parts of a player's look that change the shapes drawn. (His colours are in `figureColours`.) */
export type FigureLook = Pick<PlayerLook, 'hair' | 'beard' | 'build' | 'mark' | 'costume' | 'face'>;

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
function arm(root: P, target: P, width: number, captain: boolean, bend: 1 | -1 = 1): { shapes: Shape[]; hand: P } {
  const { mid: elbow, end: hand } = reach(root, target, B.upperArm, B.foreArm, bend);
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
  const J = F.faces[who.face ?? 'round'];
  out.push(
    // His jaw and chin are his own: squarer, or longer, as his portrait has them.
    poly('skin', [at(-0.3, 0.3), at(-0.2 - J.jaw, 0.78 + J.jaw * 0.6), at(0.4, 1.02 + J.chin), at(0.68 + J.jaw * 0.4, 0.94 + J.chin), at(0.76, 0.7), at(0.72, 0.5), at(0.98, 0.42), at(0.82, 0.1), at(0.84, -0.14), at(0.6, -0.5), at(-0.3, -0.5)]),
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
  const going = speed <= 0 || p.glide || p.carve ? 0 : B.slowStride + (1 - B.slowStride) * speed;
  // He sinks a little twice a stride, as each leg takes his weight.
  const bob = B.bob * going * Math.cos(2 * p.stride);
  const drop = B.crouch * speed + bob + (p.kneel ? B.kneelDrop : 0) + (act === 'hit' ? B.hitDrop : act === 'tired' ? B.tiredDrop : act === 'stop' ? B.stopDrop : 0) + (p.carve ? B.carveDrop : 0) + (p.cheer && p.cheerStyle === 2 ? B.kneelDrop * 0.8 : p.cheer && p.cheerStyle === 1 ? -B.cheerLeap : 0);
  const lean = p.cheer ? (p.cheerStyle === 2 ? -B.cheerBack : 0) : (p.carve ? B.carveLean : 0) + B.lean + speed * B.speedLean + (act === 'poke' ? B.pokeLean : act === 'hit' ? B.hitLean : act === 'deke' ? B.dekeLean : act === 'tired' ? B.tiredLean : act === 'shot' ? B.shotLean : 0) + (act === 'stop' ? B.stopLean - B.lean - speed * B.speedLean : 0);
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
    // A hard stop: both skates thrown out ahead of him, side on to the way he was going.
    if (act === 'stop') return { foot: [B.stopFeet[side === 1 ? 1 : 0]!, 0], pitch: 0 };
    // A carve: no stride; the skate on the outside of the turn is lifted and crossed over ahead of the other.
    if (p.carve) return { foot: [side * p.carve * B.carveFeet, side === -p.carve ? -B.carveLift : 0], pitch: 0 };
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
    const wide = p.cheerStyle === 2 ? B.cheerFists : p.cheerStyle === 1 ? B.cheerWide : 1;
    top = [shoulder[0] - B.cheerOut * wide, shoulder[1] - B.cheerUp];
    low = [shoulder[0] + B.cheerOut * wide + 0.1, shoulder[1] - B.cheerUp - 0.06];
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
  } else if (act === 'shot') {
    // The follow-through: the stick carried on up and ahead, pointing where the puck went.
    low = [low[0] + B.shotReach, low[1] - B.shotLift];
    top = [top[0] + B.shotReach * 0.9, top[1] - B.shotLift * 0.5];
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

const V = F.front;

/** A skate seen from the front or from behind: the toe cap or the heel, and the steel end-on under it. */
function bootAhead(x: number, y: number): Shape[] {
  const at = (u: number, v: number): P => [x + u, y + v];
  return [poly('skate', [at(-0.17, -0.5), at(0.17, -0.5), at(0.21, -0.14), at(0.12, -0.05), at(-0.12, -0.05), at(-0.21, -0.14)]), limb('blade', at(0, -0.06), at(0, 0), F.bladeWidth, true)];
}

/** The head from the front: the face under the helmet, or the helmet's back with the hair below it. */
function headAhead(centre: P, back: boolean, who: FigureLook): Shape[] {
  const r = B.headRadius;
  const at = (x: number, y: number): P => [centre[0] + x * r, centre[1] + y * r];
  if (who.mark === 'mascot') {
    const K = mascotLook(who.costume ?? 'bear');
    const m = mascotData.headScale;
    const to = (x: number, y: number): P => [centre[0] + x * r * m, centre[1] + (y - 0.3) * r * m];
    const out: Shape[] = [];
    for (const side of [-1, 1]) {
      if (K.ears === 'pointed' || K.ears === 'tufts') out.push(poly('fur', [to(side * 0.95, -0.5), to(side * 0.85, -1.7), to(side * 0.2, -0.95)]));
      else if (K.ears === 'antlers') out.push(limb('muzzle', to(side * 0.5, -0.9), to(side * 1.1, -1.7), 0.17 * r * m), limb('muzzle', to(side * 0.85, -1.35), to(side * 1.4, -1.4), 0.14 * r * m));
      else if (K.ears === 'crest') out.push(limb('fur', to(side * 0.15, -1.0), to(side * 0.4, -1.75), 0.24 * r * m));
      else out.push(circle('fur', to(side * 0.82, -0.88), (K.ears === 'small' ? 0.27 : 0.4) * r * m));
    }
    out.push(circle('fur', to(0, -0.1), 1.15 * r * m));
    if (back) return out;
    if (K.stripe) for (const side of [-1, 1]) out.push(limb('eye', to(side * 0.42, -0.8), to(side * 0.5, 0.35), 0.34 * r * m, true));
    if (K.snout === 'beak') out.push(poly('mark', [to(-0.3, 0.05), to(0.3, 0.05), to(0, K.ears === 'tufts' ? 0.6 : 0.95)]));
    else out.push(circle('muzzle', to(0, 0.42), (K.snout === 'long' ? 0.5 : 0.56) * r * m), circle('eye', to(0, 0.2), 0.16 * r * m, true), limb('eye', to(-0.25, 0.6), to(0.25, 0.6), 0.07 * r * m, true));
    for (const side of [-1, 1]) out.push({ ...circle('pad', to(side * 0.42, -0.3), 0.27 * r * m), bare: true }, circle('eye', to(side * 0.38, -0.28), 0.13 * r * m, true), limb('eye', to(side * 0.72, -0.72), to(side * 0.18, -0.52), 0.1 * r * m, true));
    return out;
  }
  const out: Shape[] = [];
  // Hair showing at the sides (from the front) or across the nape (from behind).
  if (who.hair !== 'bald') {
    const long = who.hair === 'flow' || who.hair === 'curly';
    if (back) out.push(limb('hair', at(-0.7, 0.5), at(0.7, 0.5), (long ? 0.7 : 0.4) * r));
    else for (const side of [-1, 1]) out.push(circle('hair', at(side * 0.84, 0.36), (long ? 0.3 : 0.18) * r));
  }
  if (!back) {
    const J = F.faces[who.face ?? 'round'];
    out.push(poly('skin', smooth([at(-0.74, -0.2), at(-0.7 - J.jaw * 0.5, 0.45 + J.jaw), at(-0.36 - J.jaw, 0.95 + J.chin), at(0.36 + J.jaw, 0.95 + J.chin), at(0.7 + J.jaw * 0.5, 0.45 + J.jaw), at(0.74, -0.2), at(0, -0.6)], 3)));
    if (who.beard === 'full') out.push(poly('hair', [at(-0.68, 0.38), at(-0.36, 0.98), at(0.36, 0.98), at(0.68, 0.38), at(0.3, 0.6), at(-0.3, 0.6)], true));
    else if (who.beard === 'stubble') out.push(limb('hair', at(-0.34, 0.86), at(0.34, 0.86), 0.1 * r, true));
    else if (who.beard === 'moustache') out.push(limb('hair', at(-0.24, 0.52), at(0.24, 0.52), 0.11 * r, true));
    for (const side of [-1, 1]) out.push(circle('eye', at(side * 0.3, 0.12), 0.1 * r, true), limb('eye', at(side * 0.46, -0.06), at(side * 0.14, 0), 0.06 * r, true));
    out.push(limb('eye', at(-0.14, 0.7), at(0.14, 0.7), 0.05 * r, true));
  } else {
    out.push(limb('skin', at(-0.2, 0.75), at(0.2, 0.75), 0.4 * r));
  }
  // The helmet: from the front a dome over the brow with the ears covered; from behind the whole of it.
  out.push(
    back
      ? poly('helmet', smooth([at(-0.98, 0.2), at(-1.02, -0.4), at(-0.62, -0.96), at(0, -1.08), at(0.62, -0.96), at(1.02, -0.4), at(0.98, 0.2), at(0.5, 0.55), at(-0.5, 0.55)], 3))
      : poly('helmet', smooth([at(-0.98, 0.25), at(-1.02, -0.4), at(-0.62, -0.96), at(0, -1.08), at(0.62, -0.96), at(1.02, -0.4), at(0.98, 0.25), at(0.8, 0.12), at(0.72, -0.24), at(0, -0.34), at(-0.72, -0.24), at(-0.8, 0.12)], 3)),
  );
  out.push(limb('accent', at(0, -1.0), at(0, back ? 0.3 : -0.42), 0.16 * r, true));
  if (back) {
    for (const side of [-1, 1]) out.push(limb('cage', at(side * 0.45, -0.5), at(side * 0.45, -0.3), 0.06 * r, true));
    return out;
  }
  if (who.hair === 'side' || who.hair === 'flow') out.push(circle('hair', at(0.3, -0.28), 0.14 * r, true));
  out.push(limb('visor', at(-0.74, -0.2), at(-0.56, 0.3), 0.07 * r, true), limb('visor', at(-0.56, 0.3), at(0.56, 0.3), 0.07 * r, true), limb('visor', at(0.56, 0.3), at(0.74, -0.2), 0.07 * r, true));
  for (const side of [-1, 1]) out.push(limb('cage', at(side * 0.76, 0.3), at(side * 0.2, 0.96), 0.06 * r, true));
  return out;
}

/**
 * A skater coming toward us or going away, when he skates down or up the rink: the same man seen square
 * on. His legs push out to either side in turn, his shoulders are across the picture, and he holds his stick
 * across his body with the blade out to one side. From behind, his arms and stick are beyond his body.
 */
function upright(p: PoseInput, who: FigureLook, back: boolean): Built {
  const build = F.builds[who.build];
  const speed = clamp01(p.speed);
  const wind = clamp01(p.windUp);
  const act = p.action;
  const going = speed <= 0 || p.glide || p.carve ? 0 : B.slowStride + (1 - B.slowStride) * speed;
  const bob = B.bob * going * Math.cos(2 * p.stride);
  const drop = B.crouch * speed + bob + (p.kneel ? B.kneelDrop : 0) + (act === 'hit' ? B.hitDrop : act === 'tired' ? B.tiredDrop : 0) + (p.carve ? B.carveDrop : 0) + (p.cheer && p.cheerStyle === 2 ? B.kneelDrop * 0.8 : p.cheer && p.cheerStyle === 1 ? -B.cheerLeap : 0);
  // Leaning into his skating, he is seen from further over the top: his body looks shorter.
  const lean = p.cheer ? 0 : speed * B.speedLean + (act === 'hit' ? B.hitLean : act === 'tired' ? B.tiredLean : 0);
  const spine = B.spine * (1 - V.squash * Math.min(1, lean / (B.speedLean + B.hitLean)));
  const w = build.width;
  // He sways toward the leg that is pushing.
  // Carving, his hips go over to the inside of the turn while his skates stay where they were.
  const hip: P = [V.sway * going * Math.sin(p.stride) + (p.carve ?? 0) * V.carveSway, B.hipY * build.legs + drop];
  const shY = hip[1] - spine * 0.9;
  // His shoulders follow his hips part of the way.
  const sx = hip[0] * 0.6;
  const shapes: Shape[] = [];

  // Legs: each pushes out to its side through half the stride and is drawn back in through the other half.
  for (const side of [-1, 1] as const) {
    const at = p.stride + (side === 1 ? 0 : Math.PI);
    const out = Math.max(0, Math.sin(at)) * going;
    const foot: P = [side * (V.foot + V.push * out), -V.lift * Math.max(0, -Math.sin(at)) * going];
    const top: P = [hip[0] + side * V.hip * w, hip[1]];
    const ankle: P = [foot[0], foot[1] - B.ankle];
    const knee: P = [(top[0] + ankle[0]) / 2 + side * 0.06, (top[1] + ankle[1]) / 2];
    shapes.push(taper('sock', knee, B.kneeRadius, ankle, B.ankleRadius), band('accent', knee, B.kneeRadius, ankle, B.ankleRadius, 0.42, 0.56), band('accent', knee, B.kneeRadius, ankle, B.ankleRadius, 0.64, 0.72));
    shapes.push(taper('pants', top, B.thighRadius * w, between(top, knee, B.pantsTo), B.kneeRadius * 1.1), ...bootAhead(foot[0], foot[1]));
  }
  if (who.mark === 'mascot' && back) shapes.push(...tail([0.3, hip[1] + 0.2], who.costume ?? 'bear'));
  shapes.push(limb('pants', [hip[0] - V.hip * w, hip[1]], [hip[0] + V.hip * w, hip[1]], B.hipRadius * 2 * 0.9));

  // Hands: the lower one out to the side his stick is on, the top one across his body.
  let low: P = [V.lowHand[0]!, hip[1] + V.lowHand[1]!];
  let top: P = [V.topHand[0]!, hip[1] + V.topHand[1]!];
  low = [low[0] + wind * V.windOut, low[1] - wind * V.windUp];
  top = [top[0] + wind * V.windOut, top[1] - wind * V.windUp * 0.8];
  if (p.cheer) {
    low = [V.cheerOut, shY - V.cheerUp];
    top = [-V.cheerOut, shY - V.cheerUp];
  } else if (p.mateCheer) {
    top = [-V.cheerOut, shY - V.cheerUp];
  } else if (act === 'pass' || act === 'poke') {
    low = [low[0] + 0.12, low[1] + (act === 'poke' ? 0.34 : 0.22)];
    top = [top[0] + 0.1, top[1] + 0.16];
  } else if (act === 'hit') {
    low = [0.25, shY + 0.6];
    top = [-0.2, shY + 0.62];
  } else if (act === 'deke') {
    low = [low[0] + 0.2, low[1] - 0.25];
  } else if (act === 'tired') {
    low = [0.38, hip[1] + 0.6];
    top = [-0.38, hip[1] + 0.6];
  }
  const leftArm = arm([-V.shoulder * w + sx, shY + 0.12], top, w, false);
  // Elbows out to the sides, away from his body.
  const rightArm = arm([V.shoulder * w + sx, shY + 0.12], low, w, who.mark === 'captain', -1);
  const body: Shape[] = [poly('jersey', smooth([[-0.46 * w + hip[0], hip[1] - 0.08], [-0.56 * w + sx, (hip[1] + shY) / 2], [-0.7 * w + sx, shY + 0.16], [-0.44 * w + sx, shY - 0.08], [0.44 * w + sx, shY - 0.08], [0.7 * w + sx, shY + 0.16], [0.56 * w + sx, (hip[1] + shY) / 2], [0.46 * w + hip[0], hip[1] - 0.08]], 3))];
  body.push(limb('accent', [-0.38 * w, hip[1] - 0.12], [0.38 * w, hip[1] - 0.12], 0.13, true));
  const chestY = (hip[1] + shY) / 2;
  if (p.pattern === 'hoop') body.push(limb('accent', [-0.46 * w, chestY], [0.46 * w, chestY], 0.17, true));
  else if (p.pattern === 'yoke') body.push(poly('accent', [[-0.6 * w, shY + 0.14], [-0.4 * w, shY - 0.06], [0.4 * w, shY - 0.06], [0.6 * w, shY + 0.14], [0.3 * w, shY + 0.3], [-0.3 * w, shY + 0.3]], true));
  else body.push(limb('accent', [-0.4 * w, shY + 0.14], [0.4 * w, hip[1] - 0.3], 0.17, true));
  // A captain's patch on his chest, seen from the front.
  if (!back && who.mark === 'captain') body.push(circle('mark', [sx + 0.3 * w, shY + 0.34], 0.13, true));
  const headAt: P = [sx, shY - B.neck - B.headRadius * 0.86];
  const arms = [...leftArm.shapes, ...rightArm.shapes];
  // From the front his arms and gloves are before his body; from behind, beyond it.
  if (back) shapes.push(...far(arms), ...body, ...headAhead(headAt, true, who));
  else shapes.push(...body, ...headAhead(headAt, false, who), ...arms);
  return { shapes, hand: { x: rightArm.hand[0], y: rightArm.hand[1] }, stickEnd: null, nearArm: back ? shapes.length : arms.length };
}

/**
 * A skater flat on the ice after a big hit: on his front, head up, one arm out ahead and his legs trailing.
 * He is drawn this way and not as a standing man turned on his side.
 */
function sprawled(p: PoseInput, who: FigureLook): Built {
  const D = F.fallen;
  const w = F.builds[who.build].width;
  const y = D.bodyY;
  const shapes: Shape[] = [];
  // Legs trailing behind him, one a little bent.
  shapes.push(...far([taper('pants', [-0.5, y], B.thighRadius * w, [-1.15, y - 0.1], B.kneeRadius), taper('sock', [-1.15, y - 0.1], B.kneeRadius, [-1.75, y - 0.42], B.ankleRadius), ...boot(-1.85, y - 0.2, -1.2)]));
  shapes.push(taper('pants', [-0.5, y + 0.05], B.thighRadius * w, [-1.2, y + 0.12], B.kneeRadius), taper('sock', [-1.2, y + 0.12], B.kneeRadius, [-1.95, y + 0.14], B.ankleRadius), band('accent', [-1.2, y + 0.12], B.kneeRadius, [-1.95, y + 0.14], B.ankleRadius, 0.4, 0.56), ...boot(-2.1, y + 0.36, -1.45));
  // The far arm thrown out ahead of him.
  shapes.push(...far(arm([0.45, y - 0.2], [1.45, y + 0.1], w, false).shapes));
  // His body along the ice.
  shapes.push(circle('pants', [-0.5, y], B.hipRadius * w));
  shapes.push(poly('jersey', smooth([[-0.5, y - 0.42 * w], [0.1, y - 0.5 * w], [0.62, y - 0.42 * w], [0.74, y], [0.62, y + 0.36], [0.1, y + 0.4], [-0.5, y + 0.36]], 3)));
  if (p.pattern === 'yoke') shapes.push(limb('accent', [0.5, y - 0.3], [0.5, y + 0.28], 0.17, true));
  else shapes.push(limb('accent', [0.05, y - 0.36], [0.05, y + 0.3], 0.17, true));
  shapes.push(limb(who.mark === 'mascot' ? 'fur' : 'skin', [0.62, y - 0.12], [0.86, y - 0.3], 0.38));
  shapes.push(...head([D.headX, y - 0.42], D.tilt * 0.35, false, who));
  // The near arm propping him up.
  const near = arm([0.5, y - 0.1], [1.05, y + 0.32], w, who.mark === 'captain');
  shapes.push(...near.shapes);
  return { shapes, hand: { x: near.hand[0], y: near.hand[1] }, stickEnd: null, nearArm: near.shapes.length };
}

/** One leg of a goalie: pants to the knee, then the big pad down the shin to the ice, over his skate. */
function padLeg(hip: P, footX: number, lift: number, S: (typeof F.goalieStyles)[number], width: number): Shape[] {
  const ankle: P = [footX, -B.ankle - lift];
  const { mid: knee, end } = reach(hip, ankle, S.thigh, S.shin, -1);
  const d = Math.hypot(knee[0] - end[0], knee[1] - end[1]) || 1;
  const up: P = [(knee[0] - end[0]) / d, (knee[1] - end[1]) / d];
  const across: P = [-up[1], up[0]];
  const h = S.padWidth / 2;
  const foot: P = [end[0], end[1] + B.ankle - 0.1];
  const top: P = [knee[0] + up[0] * S.padTop, knee[1] + up[1] * S.padTop];
  const on = (k: number, side: number): P => [foot[0] + (top[0] - foot[0]) * k + across[0] * h * side, foot[1] + (top[1] - foot[1]) * k + across[1] * h * side];
  return [
    taper('pants', hip, 0.44 * width, knee, 0.32),
    ...boot(footX + 0.12, -lift),
    poly('pad', smooth([on(0, -1), on(0.9, -1.06), on(1, -0.9), on(1, 0.9), on(0.9, 1.06), on(0, 1)], 3)),
    limb('accent', on(0.78, -0.72), on(0.78, 0.72), 0.1, true),
    limb('accent', on(0.3, -0.72), on(0.3, 0.72), 0.1, true),
    limb('accent', on(0.36, 0), on(0.72, 0), 0.07, true),
  ];
}

/**
 * A goalie facing right, toward the shooter: knees bent, leaning into it, both hands in front of him.
 * The catching glove is on his far hand, open and held out ahead of his chest; the blocker and the stick are
 * on the near one, low in front. (An earlier drawing had the glove out behind his back, which no arm can do.)
 */
function goalie(p: PoseInput, who: FigureLook): Built {
  const S = F.goalieStyles[F.goalieStyle] ?? F.goalieStyles[0]!;
  const build = F.builds[who.build];
  const act = p.action;
  // With the play at the other end he stands easy: taller, less bent, the glove down by his side.
  const easy = p.down || act ? 0 : 1 - clamp01(p.alert ?? 1);
  // Sliding across he is half-way down; getting up, the same; at his post he stands tall and tight.
  const low = act === 'slide' || act === 'rise';
  const standY = S.hipY * build.legs * (1 + G.relaxRise * (easy + (act === 'post' ? 0.6 : 0)));
  const hip: P = p.down ? [0, G.downHipY] : low ? [S.hipX * 0.5, (standY + G.downHipY) / 2] : [S.hipX * (act === 'post' ? 0.3 : 1), standY];
  const lean = p.down ? S.lean * 0.5 : act === 'post' ? S.lean * 0.25 : S.lean * (1 - easy * (1 - G.relaxLean));
  const up: P = [Math.sin(lean), -Math.cos(lean)];
  const out: P = [Math.cos(lean), Math.sin(lean)];
  const wide = S.width * build.width;
  const body = (u: number, v: number): P => [hip[0] + up[0] * u * S.spine + out[0] * v * wide, hip[1] + up[1] * u * S.spine + out[1] * v * wide];
  const shoulder = body(0.9, 0.02);
  const shapes: Shape[] = [];
  const half = S.padWidth / 2;
  // Moving across his crease he shuffles: one pad forward and lifted a little, then the other.
  const shuffle = !p.down && p.speed > 0 ? Math.sin(p.stride) : 0;

  // The far leg.
  if (p.down) {
    // Down in the butterfly: knees on the ice in front of him, the pads lying along it behind.
    shapes.push(...far([taper('pants', hip, 0.44 * build.width, [G.downKnee + 0.12, -half], 0.3), limb('pad', [G.downKnee + 0.22, -half], [G.downFoot + 0.3, -half + 0.02], S.padWidth)]));
  } else if (act === 'slide') {
    // Pushing across: the far leg stretched out behind him, its skate dug in.
    shapes.push(...far(padLeg(hip, S.feet[0]! - G.slideBack, 0, S, build.width)));
  } else if (act === 'rise') {
    // Getting up: the far knee still on the ice.
    shapes.push(...far([taper('pants', hip, 0.44 * build.width, [G.downKnee + 0.12, -half], 0.3), limb('pad', [G.downKnee + 0.22, -half], [G.downFoot + 0.3, -half + 0.02], S.padWidth)]));
  } else {
    shapes.push(...far(padLeg(hip, (act === 'post' ? 0.1 : S.feet[0]!) - shuffle * G.shuffle, Math.max(0, -shuffle) * G.shuffleLift, S, build.width)));
  }

  // The catching glove, on the far hand: out in front, open to the shooter; thrown up and out for a glove save.
  const lift = p.action === 'glove' ? 1 : 0;
  // At his post the glove is tucked in against his chest; standing easy it hangs lower.
  const tuck = act === 'post' ? 1 : easy;
  const catcher = arm(body(0.88, -0.04), [shoulder[0] + S.catcher[0]! + lift * G.gloveOut + tuck * G.relaxGlove[0]!, shoulder[1] + S.catcher[1]! - lift * G.gloveUp + tuck * G.relaxGlove[1]!], 1, false);
  const [cx, cy] = catcher.hand;
  const r = S.catchRadius;
  shapes.push(
    ...far(catcher.shapes.slice(0, 3)),
    ...far([
      // The cuff, the pocket and the thumb: a trapper seen open.
      poly('pad', [[cx - r * 0.9, cy + r * 0.1], [cx - r * 0.5, cy + r * 1.1], [cx + r * 0.2, cy + r * 0.9], [cx - r * 0.1, cy]]),
      circle('glove', [cx + r * 0.15, cy - r * 0.1], r),
      limb('glove', [cx - r * 0.5, cy - r * 0.5], [cx - r * 0.7, cy - r * 1.25], r * 0.5),
      circle('pad', [cx + r * 0.3, cy - r * 0.15], r * 0.5, true),
    ]),
  );

  shapes.push(circle('pants', hip, 0.62 * build.width));

  // The near leg.
  if (p.down) {
    shapes.push(taper('pants', hip, 0.46 * build.width, [G.downKnee, -half], 0.32), limb('pad', [G.downKnee + 0.1, -half], [G.downFoot, -half + 0.02], S.padWidth));
    for (const k of [0.25, 0.7]) {
      const x = G.downKnee + 0.1 + (G.downFoot - G.downKnee - 0.1) * k;
      shapes.push(limb('accent', [x, -S.padWidth * 0.84], [x, -S.padWidth * 0.18], 0.1, true));
    }
    shapes.push(...boot(G.downFoot - 0.1, 0).slice(0, 1));
  } else if (act === 'slide') {
    // The leading knee is down and the pad lies along the ice, sealing it as he goes.
    shapes.push(taper('pants', hip, 0.46 * build.width, [G.downKnee, -half], 0.32), limb('pad', [G.downKnee + 0.1, -half], [G.downFoot + 0.4, -half + 0.02], S.padWidth), limb('accent', [G.downKnee - 0.3, -S.padWidth * 0.84], [G.downKnee - 0.3, -S.padWidth * 0.18], 0.1, true));
  } else if (act === 'rise') {
    // The near skate planted in front of him, pushing him up.
    shapes.push(...padLeg(hip, G.riseFoot, 0, S, build.width));
  } else if (p.action === 'kick') {
    // A kick save: the near pad thrust out along the ice to meet the puck.
    shapes.push(limb('pad', [hip[0] + 0.2, hip[1] + 0.3], [G.kickReach, -half], S.padWidth), limb('accent', [G.kickReach * 0.55, -half - 0.32], [G.kickReach * 0.7, -half + 0.2], 0.1, true), ...boot(G.kickReach + 0.2, 0).slice(0, 1));
  } else {
    shapes.push(...padLeg(hip, (act === 'post' ? 0.3 : S.feet[1]!) + shuffle * G.shuffle, Math.max(0, shuffle) * G.shuffleLift, S, build.width));
  }

  const headAt = body(0.9 + (B.neck + B.headRadius * 0.9) / S.spine, 0.08);
  shapes.push(limb('skin', body(0.92, 0.03), between(body(0.92, 0.03), headAt, 0.7), 0.4));
  shapes.push(...jersey(p.pattern, body));
  shapes.push(...head(headAt, 0, true, who));

  // The blocker, on the hand that holds the stick.
  const near = arm(shoulder, [shoulder[0] + S.blocker[0]!, shoulder[1] + S.blocker[1]!], 1, false);
  const [bx, by] = near.hand;
  const w = (G.blockerWidth / 2) * S.blockerScale;
  const h = (G.blockerHeight / 2) * S.blockerScale;
  const blocker: Shape[] = [...near.shapes.slice(0, 3), poly('pad', [[bx - w, by - h], [bx + w, by - h], [bx + w, by + h], [bx - w, by + h]]), limb('accent', [bx - w * 0.6, by - h * 0.5], [bx + w * 0.6, by - h * 0.5], 0.09, true)];
  shapes.push(...blocker);
  return { shapes, hand: { x: near.hand[0], y: near.hand[1] }, stickEnd: { x: Math.max(G.stickX, bx + 0.9), y: -F.bladeWidth }, nearArm: blocker.length };
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
  if (pose.amount !== undefined && pose.amount < 1) {
    // Part-way into a move: every piece is drawn between where it is without the move and where it is with it.
    const full: PoseInput = { ...pose };
    delete full.amount;
    const plain: PoseInput = { ...full, down: false, cheer: false, mateCheer: false };
    delete plain.action;
    delete plain.cheerStyle;
    return blended(figure(plain, who), figure(full, who), clamp01(pose.amount));
  }
  const view = pose.goalie ? 'side' : (pose.view ?? 'side');
  const turned = view === 'quarter' || view === 'quarterBack';
  let built = pose.goalie ? goalie(pose, who) : pose.fallen ? sprawled(pose, who) : view === 'side' ? skater(pose, who) : upright(pose, who, view === 'back' || view === 'quarterBack');
  // Part-way between side-on and square on: the man seen from the front (or from behind) and turned toward
  // the way he is going. Everything is drawn narrower, and what stands out from him (his face, his gloves and
  // stick hand, the toes of his skates) is carried across toward that side, as it would be if he had turned.
  if (turned && !pose.goalie && !pose.fallen) {
    const Q = F.quarter;
    const [cos, sin] = [Math.cos(Q.yaw), Math.sin(Q.yaw) * (view === 'quarter' ? 1 : -1)];
    const depths = Q.depth as Partial<Record<Tag, number>>;
    const shapes = built.shapes.map((s) => mapPoints({ shapes: [s], hand: { x: 0, y: 0 }, stickEnd: null }, (x, y) => [x * cos + (depths[s.tag] ?? 0) * sin, y]).shapes[0]!);
    built = { ...built, shapes, hand: { x: built.hand.x * cos + (depths.glove ?? 0) * sin, y: built.hand.y } };
  }
  let raw: Raw = scaled(built, SCALE);
  if (pose.side === -1) raw = mapPoints(raw, (x, y) => [-x, y]);
  if (pose.tilt !== 0) {
    const cos = Math.cos(pose.tilt * pose.side);
    const sin = Math.sin(pose.tilt * pose.side);
    raw = mapPoints(raw, (x, y) => [x * cos - y * sin, x * sin + y * cos]);
  }
  return { ...raw, top: topOf(raw.shapes), nearArm: built.nearArm };
}

/**
 * One figure part-way to another: each piece moved `w` of the way from where it is in `a` to where it is in `b`.
 * If the two are not made of the same pieces in the same order there is nothing to move, and it is `b`.
 */
function blended(a: Figure, b: Figure, w: number): Figure {
  if (a.shapes.length !== b.shapes.length) return b;
  const mix = (x: number, y: number): number => x + (y - x) * w;
  const shapes: Shape[] = [];
  for (const [i, s] of b.shapes.entries()) {
    const r = a.shapes[i] as Shape;
    if (r.kind !== s.kind || r.tag !== s.tag) return b;
    if (s.kind === 'circle' && r.kind === 'circle') shapes.push({ ...s, x: mix(r.x, s.x), y: mix(r.y, s.y), r: mix(r.r, s.r) });
    else if (s.kind === 'limb' && r.kind === 'limb') shapes.push({ ...s, x1: mix(r.x1, s.x1), y1: mix(r.y1, s.y1), x2: mix(r.x2, s.x2), y2: mix(r.y2, s.y2), w: mix(r.w, s.w) });
    else if (s.kind === 'poly' && r.kind === 'poly') {
      if (r.points.length !== s.points.length) return b;
      shapes.push({ ...s, points: s.points.map(([x, y], k) => [mix((r.points[k] as [number, number])[0], x), mix((r.points[k] as [number, number])[1], y)]) });
    }
  }
  return { ...b, shapes, hand: { x: mix(a.hand.x, b.hand.x), y: mix(a.hand.y, b.hand.y) }, top: mix(a.top, b.top) };
}

/** A few letters that name a look, for telling one player's pictures from another's. */
export function lookKey(who: FigureLook): string {
  return `${who.build}.${who.hair}.${who.beard}.${who.mark ?? ''}.${who.costume ?? ''}.${who.face ?? ''}`;
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

/**
 * How a skater is seen from the way he faces: from the front when he heads down the screen, from behind when
 * he heads up it, side-on otherwise. He keeps the view he had until he has clearly turned out of it, so he
 * does not flicker between two.
 */
export function viewOf(facing: number, previous: View | undefined): View {
  const across = Math.abs(Math.cos(facing));
  const down = Math.sin(facing) >= 0;
  // Square on, toward us or away: heading nearly straight down or up the screen.
  if (previous === 'front' || previous === 'back' ? across < V.leave : across < V.enter) return down ? 'front' : 'back';
  // On a diagonal he is part-turned; along the rink, side-on.
  if (previous === 'quarter' || previous === 'quarterBack' ? across < V.quarterLeave : across < V.quarterEnter) return down ? 'quarter' : 'quarterBack';
  return 'side';
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
    // Gloves in the club's second colour, a shade darker, so a home side is known by its hands as well.
    glove: darken(crest.secondary, F.homeGloveDarken),
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

/** The stick alone, from the lower hand to `end`: the shaft and the blade. */
export function stickOf(hand: { x: number; y: number }, end: { x: number; y: number }, side: 1 | -1): Shape[] {
  const dx = end.x - hand.x;
  const dy = end.y - hand.y;
  const length = Math.hypot(dx, dy) || 1;
  const butt = { x: hand.x - (dx / length) * F.stickGrip, y: hand.y - (dy / length) * F.stickGrip };
  return [
    { kind: 'limb', tag: 'stick', x1: butt.x, y1: butt.y, x2: end.x, y2: end.y, w: F.stickWidth, bare: true },
    { kind: 'limb', tag: 'stick', x1: end.x, y1: end.y, x2: end.x + side * F.bladeLength, y2: end.y, w: F.stickWidth * 1.4, bare: true },
  ];
}

/**
 * The figure's shapes with his stick added: a shaft from above his lower hand down to `end` (where the blade
 * meets the ice, in the figure's units) and the blade lying along the ice. It is slipped in behind his near
 * arm, so the glove is seen gripping it.
 */
export function withStick(fig: Figure, end: { x: number; y: number }, side: 1 | -1): Shape[] {
  const stick = stickOf(fig.hand, end, side);
  // Behind the near arm, which is the last pieces of the list.
  const at = Math.max(0, fig.shapes.length - fig.nearArm);
  return [...fig.shapes.slice(0, at), ...stick, ...fig.shapes.slice(at)];
}
