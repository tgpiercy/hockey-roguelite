import type { PoseInput, Shape } from '../figure';
import { circle, gait, limb, patternOn, poly, type Raw } from './shared';

/**
 * Candidate A, "big heads": the head is more than half the figure, on a small body with big gloves and
 * skates. Built to read at phone size, and to leave room for a face.
 */
const N = {
  headR: 1.12,
  headY: -2.86,
  faceR: 0.98,
  faceX: 0.3,
  faceY: 0.26,
  eyeR: 0.22,
  hipY: -0.98,
  shoulderY: -1.7,
  torso: 1.2,
  arm: 0.44,
  glove: 0.44,
  thigh: 0.5,
  shin: 0.46,
  reach: 0.62,
  lean: 0.3,
  boot: 0.4,
};

function skate(x: number, y: number): Shape[] {
  return [limb('skate', x - 0.2, y - 0.2, x + 0.42, y - 0.2, N.boot), limb('blade', x - 0.34, y, x + 0.56, y, 0.09, true)];
}

function head(x: number, y: number, caged: boolean): Shape[] {
  // The head is the face; the helmet is a cap over the top and the back of it, so most of the face shows.
  const out: Shape[] = [
    circle('hair', x - 0.78, y + 0.5, 0.4),
    circle('skin', x, y, N.headR),
    circle('helmet', x - 0.22, y - 0.42, N.headR * 0.93),
    circle('helmet', x - 0.62, y + 0.12, 0.62, true),
    // A stripe over the crown.
    limb('accent', x - 0.95, y - 0.92, x + 0.3, y - 1.18, 0.2, true),
  ];
  if (caged) {
    for (const k of [0, 0.3, 0.6]) out.push(limb('cage', x + 0.2, y + 0.02 + k, x + 1.1, y + 0.1 + k, 0.08, true));
    for (const k of [0.4, 0.75]) out.push(limb('cage', x + k, y - 0.05, x + k + 0.06, y + 0.85, 0.08, true));
    out.push(circle('eye', x + 0.6, y + 0.22, 0.13, true));
  } else {
    // A brim, one big eye with a glint, a brow and a mouth.
    out.push(limb('helmet', x + 0.35, y - 0.16, x + 1.08, y - 0.04, 0.2));
    out.push(circle('eye', x + 0.62, y + 0.3, N.eyeR, true));
    out.push(circle('visor', x + 0.69, y + 0.23, 0.07, true));
    out.push(limb('eye', x + 0.5, y + 0.78, x + 0.86, y + 0.72, 0.08, true));
  }
  return out;
}

export function skater(p: PoseInput): Raw {
  const { speed, wind, swing } = gait(p);
  const reach = N.reach * (0.35 + 0.65 * speed);
  const lean = speed * N.lean;
  const drop = p.kneel ? 0.45 : 0;
  const hipY = N.hipY + drop;
  const shY = N.shoulderY + drop;
  const shapes: Shape[] = [];

  for (const leg of [-1, 1]) {
    const footX = swing * reach * leg;
    const footY = -0.26 * Math.max(0, -swing * leg) * speed;
    const hipX = 0.16 * leg;
    const kneeX = (hipX + footX) / 2 + 0.12;
    const kneeY = (hipY + footY) / 2;
    shapes.push(limb('pants', hipX, hipY, kneeX, kneeY, N.thigh));
    shapes.push(limb('sock', kneeX, kneeY, footX, footY - 0.3, N.shin));
    shapes.push(...skate(footX, footY));
  }

  const top = { x: lean + 0.3 - wind * 0.5, y: drop - 1.42 - wind * 0.55 + swing * 0.1 * speed };
  const low = { x: lean + 0.92 - wind * 0.3, y: drop - 1.08 - wind * 0.55 - swing * 0.1 * speed };
  if (p.cheer) {
    top.x = lean - 0.75;
    top.y = -2.5;
    low.x = lean + 0.95;
    low.y = -2.6;
  }
  shapes.push(limb('jersey', lean - 0.1, shY + 0.2, top.x, top.y, N.arm));
  shapes.push(circle('glove', top.x, top.y, N.glove));

  shapes.push(limb('pants', 0, hipY + 0.02, lean * 0.3, hipY - 0.22, N.torso * 0.9));
  const waist: [number, number] = [lean * 0.3, hipY - 0.22];
  const chest: [number, number] = [lean * 0.7, shY + 0.18];
  shapes.push(limb('jersey', waist[0], waist[1], chest[0], chest[1], N.torso));
  shapes.push(...patternOn(p.pattern, waist, chest, N.torso, 0.2));
  shapes.push(...head(lean * 1.1 + 0.08, N.headY + drop, false));

  shapes.push(limb('jersey', lean + 0.1, shY + 0.2, low.x, low.y, N.arm));
  shapes.push(circle('glove', low.x, low.y, N.glove));
  return { shapes, hand: low, stickEnd: null };
}

export function goalie(p: PoseInput): Raw {
  const shapes: Shape[] = [];
  const hipY = p.down ? -0.6 : -1.0;
  const shY = hipY - 0.7;
  if (p.down) {
    shapes.push(limb('pad', -0.2, -0.42, -1.75, -0.4, 0.82));
    shapes.push(limb('pad', 0.2, -0.42, 1.75, -0.4, 0.82));
  } else {
    for (const leg of [-1, 1]) {
      const x = 0.5 * leg;
      shapes.push(limb('pad', x * 0.8, hipY + 0.1, x, -0.42, 0.82));
      shapes.push(limb('accent', x - 0.3, -0.62, x + 0.3, -0.62, 0.12, true));
      shapes.push(...skate(x + 0.12, 0));
    }
  }
  const catcher = { x: -1.1, y: shY + 0.2 };
  shapes.push(limb('jersey', -0.1, shY + 0.2, catcher.x, catcher.y, N.arm));
  shapes.push(circle('glove', catcher.x, catcher.y, 0.56));

  shapes.push(limb('pants', 0, hipY, 0, hipY - 0.2, 1.7));
  const waist: [number, number] = [0, hipY - 0.2];
  const chest: [number, number] = [0.1, shY + 0.18];
  shapes.push(limb('jersey', waist[0], waist[1], chest[0], chest[1], 1.8));
  shapes.push(...patternOn(p.pattern, waist, chest, 1.8, 0.2));
  shapes.push(...head(0.16, shY - 1.2, true));

  const blocker = { x: 1.12, y: shY + 0.42 };
  shapes.push(limb('jersey', 0.2, shY + 0.2, blocker.x, blocker.y, N.arm));
  shapes.push(poly('pad', [
    [blocker.x - 0.34, blocker.y - 0.5],
    [blocker.x + 0.34, blocker.y - 0.5],
    [blocker.x + 0.34, blocker.y + 0.5],
    [blocker.x - 0.34, blocker.y + 0.5],
  ]));
  return { shapes, hand: blocker, stickEnd: { x: 1.9, y: -0.08 } };
}
