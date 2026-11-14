import type { Crest, JerseyPattern } from '../core/crest';
import { lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';

const F = look.figure;

/** What a shape of the figure is, which decides its colour. */
export type Tag = 'skin' | 'eye' | 'helmet' | 'visor' | 'cage' | 'jersey' | 'accent' | 'glove' | 'pants' | 'sock' | 'skate' | 'blade' | 'pad' | 'stick';

export const TAGS: readonly Tag[] = ['skin', 'eye', 'helmet', 'visor', 'cage', 'jersey', 'accent', 'glove', 'pants', 'sock', 'skate', 'blade', 'pad', 'stick'];

/** One piece of the figure. A limb is a thick line with round ends. `bare` pieces get no outline round them. */
export type Shape =
  | { kind: 'circle'; tag: Tag; x: number; y: number; r: number; bare?: boolean }
  | { kind: 'limb'; tag: Tag; x1: number; y1: number; x2: number; y2: number; w: number; bare?: boolean }
  | { kind: 'poly'; tag: Tag; points: [number, number][]; bare?: boolean };

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
  pattern: JerseyPattern;
}

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

/** A skate at a foot: the boot, and the steel under it. */
function skate(x: number, y: number): Shape[] {
  return [
    limb('skate', x - F.bootBack, y - F.bootHeight, x + F.bootFront, y - F.bootHeight, F.bootWidth),
    limb('blade', x - F.bootBack - F.bladeOver, y, x + F.bootFront + F.bladeOver, y, F.bladeWidth, true),
  ];
}

/** The head: a face showing under and in front of the helmet, a visor, an eye. */
function head(x: number, y: number, caged: boolean): Shape[] {
  const r = F.headRadius;
  const out: Shape[] = [circle('skin', x + F.faceForward, y + F.faceDown, r * F.faceScale), circle('helmet', x, y, r)];
  if (caged) {
    // A goalie's mask: bars across the face.
    for (const k of [0.15, 0.45, 0.75]) out.push(limb('cage', x + r * 0.25, y - r * 0.2 + r * k, x + r * 1.05, y - r * 0.05 + r * k, F.cageWidth, true));
    out.push(limb('cage', x + r * 0.7, y - r * 0.15, x + r * 0.75, y + r * 0.75, F.cageWidth, true));
  } else {
    out.push(limb('visor', x + r * 0.3, y + r * 0.02, x + r * 1.0, y + r * 0.16, F.visorWidth, true));
    out.push(circle('eye', x + F.faceForward + r * 0.42, y + F.faceDown + r * 0.12, F.eyeRadius, true));
  }
  return out;
}

function accent(pattern: JerseyPattern, hipX: number, hipY: number, shX: number, shY: number, width: number): Shape[] {
  if (pattern === 'hoop') {
    const mx = (hipX + shX) / 2;
    const my = (hipY + shY) / 2;
    return [limb('accent', mx - width * 0.36, my, mx + width * 0.36, my, F.hoopWidth, true)];
  }
  if (pattern === 'yoke') return [limb('accent', shX - width * 0.28, shY, shX + width * 0.28, shY, F.yokeWidth, true)];
  return [circle('accent', shX + width * 0.2, shY + F.sashDrop, F.sashRadius, true)];
}

/** A skater facing right, in his own units before scaling. */
function skater(p: PoseInput): Raw {
  const speed = Math.max(0, Math.min(1, p.speed));
  const wind = Math.max(0, Math.min(1, p.windUp));
  const reach = F.strideReach * (F.stanceShare + (1 - F.stanceShare) * speed);
  const swing = Math.sin(p.stride);
  const lean = speed * F.lean;
  const hipY = -F.hipHeight;
  const shY = -F.shoulderHeight;
  const shapes: Shape[] = [];

  // Legs: the far one first. Whichever foot is behind is lifted a little off the ice.
  for (const leg of [-1, 1]) {
    const footX = swing * reach * leg;
    const footY = -F.footLift * Math.max(0, -swing * leg) * speed;
    const hipX = F.hipSpread * leg * 0.5;
    const kneeX = (hipX + footX) / 2 + F.kneeForward;
    const kneeY = (hipY + footY) / 2;
    shapes.push(limb('pants', hipX, hipY, kneeX, kneeY, F.thighWidth));
    shapes.push(limb('sock', kneeX, kneeY, footX, footY - F.ankleHeight, F.shinWidth));
    shapes.push(...skate(footX, footY));
  }

  // Hands on the stick: the top hand near the chest, the lower hand out in front. A wind-up draws both back and up.
  const topHand = { x: lean + F.topHandX - wind * F.windBack, y: F.topHandY - wind * F.windUp + swing * F.armSwing * speed };
  const lowHand = { x: lean + F.lowHandX - wind * F.windBack * 0.6, y: F.lowHandY - wind * F.windUp - swing * F.armSwing * speed };
  // The far arm, behind the body.
  shapes.push(limb('jersey', lean - F.shoulderSpread, shY + F.armDrop, topHand.x, topHand.y, F.armWidth));
  shapes.push(circle('glove', topHand.x, topHand.y, F.gloveRadius));

  shapes.push(limb('pants', 0, hipY + F.pantsDrop, lean * 0.3, hipY - F.pantsRise, F.pantsWidth));
  const waistX = lean * 0.3;
  const waistY = hipY - F.pantsRise;
  const chestY = shY + F.chestDrop;
  shapes.push(limb('jersey', waistX, waistY, lean, chestY, F.torsoWidth));
  shapes.push(...accent(p.pattern, waistX, waistY, lean, chestY, F.torsoWidth));
  shapes.push(...head(lean * F.headLean + F.headForward, -F.headHeight, false));

  // The near arm, in front.
  shapes.push(limb('jersey', lean + F.shoulderSpread, shY + F.armDrop, lowHand.x, lowHand.y, F.armWidth));
  shapes.push(circle('glove', lowHand.x, lowHand.y, F.gloveRadius));
  return { shapes, hand: lowHand, stickEnd: null };
}

/** A goalie facing right: wide, crouched, in big pads; on his knees with the pads spread when he is down. */
function goalie(p: PoseInput): Raw {
  const G = F.goalie;
  const shapes: Shape[] = [];
  const hipY = p.down ? -G.downHipHeight : -G.hipHeight;
  const shY = hipY - G.torsoLength;
  if (p.down) {
    shapes.push(limb('pad', -G.padSpread * 0.3, -G.padWidth * 0.5, -G.downReach, -G.padWidth * 0.45, G.padWidth));
    shapes.push(limb('pad', G.padSpread * 0.3, -G.padWidth * 0.5, G.downReach, -G.padWidth * 0.45, G.padWidth));
  } else {
    for (const leg of [-1, 1]) {
      const x = G.padSpread * leg;
      shapes.push(limb('pad', x * 0.8, hipY + G.padDrop, x, -G.padWidth * 0.5, G.padWidth));
      shapes.push(...skate(x + F.bootFront * 0.3, 0));
    }
  }
  // The catching glove, held out behind the body.
  const catcher = { x: -G.catchX, y: shY + G.catchDrop };
  shapes.push(limb('jersey', -F.shoulderSpread, shY + F.armDrop, catcher.x, catcher.y, F.armWidth));
  shapes.push(circle('glove', catcher.x, catcher.y, G.catchRadius));

  shapes.push(limb('pants', 0, hipY + F.pantsDrop, 0, hipY - F.pantsRise, G.torsoWidth * 0.95));
  shapes.push(limb('jersey', 0, hipY - F.pantsRise, G.crouch, shY + F.chestDrop, G.torsoWidth));
  shapes.push(...accent(p.pattern, 0, hipY - F.pantsRise, G.crouch, shY + F.chestDrop, G.torsoWidth));
  shapes.push(...head(G.crouch + F.headForward, shY - G.headRise, true));

  // The blocker, on the hand that holds the stick.
  const blocker = { x: G.crouch + G.blockerX, y: shY + G.blockerDrop };
  shapes.push(limb('jersey', G.crouch + F.shoulderSpread, shY + F.armDrop, blocker.x, blocker.y, F.armWidth));
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

/** A standing skater is drawn exactly `height` footprint radii tall; everything else keeps the same scale. */
const SCALE = F.height / -topOf(skater(STANDING).shapes);

/**
 * The figure in a pose: an upright cartoon player seen from the side, as a list of shapes to paint back to
 * front. It is built facing right, then mirrored to face left and tipped over if he is off balance, so the
 * two directions are exact mirror images.
 */
export function figure(pose: PoseInput): Figure {
  let raw = scaled(pose.goalie ? goalie(pose) : skater(pose), SCALE);
  if (pose.side === -1) raw = mapPoints(raw, (x, y) => [-x, y]);
  if (pose.tilt !== 0) {
    const cos = Math.cos(pose.tilt * pose.side);
    const sin = Math.sin(pose.tilt * pose.side);
    raw = mapPoints(raw, (x, y) => [x * cos - y * sin, x * sin + y * cos]);
  }
  return { ...raw, top: topOf(raw.shapes) };
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

/** The colour of each kind of piece for a team: its main colour on the jersey, its second colour as the accent and socks. */
export function figureColours(crest: Crest, goalie: boolean, skin: string): Record<Tag, string> {
  const jersey = goalie ? lighten(crest.primary, look.goalieLighten) : crest.primary;
  return {
    skin,
    eye: F.colours.eye,
    helmet: lighten(crest.primary, goalie ? F.goalieHelmetLighten : F.helmetLighten),
    visor: F.colours.visor,
    cage: F.colours.cage,
    jersey,
    accent: crest.secondary,
    glove: F.colours.glove,
    pants: F.colours.pants,
    sock: crest.secondary,
    skate: look.colours.skate,
    blade: F.colours.blade,
    pad: F.colours.pad,
    stick: look.colours.stick,
  };
}

/** A skin tone for a player, the same every time for the same number. */
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
  const at = Math.max(0, fig.shapes.length - 2);
  return [...fig.shapes.slice(0, at), ...stick, ...fig.shapes.slice(at)];
}
