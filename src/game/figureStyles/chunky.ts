import type { PoseInput, Shape } from '../figure';
import { circle, gait, limb, patternOn, poly, type Raw } from './shared';

/**
 * Candidate B, "chunky pros": a hockey player's silhouette, exaggerated. Big shoulder pads, a barrel
 * chest, baggy pants, striped sleeves and socks, a small helmeted head.
 */
const N = {
  headR: 0.6,
  headY: -3.4,
  hipY: -1.7,
  shoulderY: -2.75,
  chest: 1.5,
  pad: 0.62,
  arm: 0.56,
  glove: 0.42,
  thigh: 0.78,
  shin: 0.5,
  reach: 0.85,
  lean: 0.45,
};

function skate(x: number, y: number): Shape[] {
  return [limb('skate', x - 0.18, y - 0.17, x + 0.44, y - 0.17, 0.34), limb('blade', x - 0.3, y, x + 0.56, y, 0.08, true)];
}

function head(x: number, y: number, caged: boolean): Shape[] {
  const r = N.headR;
  const out: Shape[] = [circle('hair', x - r * 0.55, y + r * 0.6, r * 0.38), circle('skin', x + r * 0.42, y + r * 0.4, r * 0.84), circle('helmet', x, y, r), limb('accent', x - r * 0.7, y - r * 0.45, x + r * 0.6, y - r * 0.6, 0.12, true)];
  if (caged) {
    for (const k of [0.15, 0.45, 0.75]) out.push(limb('cage', x + r * 0.25, y - r * 0.2 + r * k, x + r * 1.1, y - r * 0.05 + r * k, 0.07, true));
    out.push(limb('cage', x + r * 0.7, y - r * 0.15, x + r * 0.75, y + r * 0.8, 0.07, true));
  } else {
    out.push(limb('visor', x + r * 0.3, y + r * 0.02, x + r * 1.02, y + r * 0.18, 0.18, true));
    out.push(circle('eye', x + r * 0.86, y + r * 0.52, 0.1, true));
  }
  return out;
}

/** An arm in two parts with a stripe round the forearm. */
function arm(sx: number, sy: number, hx: number, hy: number): Shape[] {
  const ex = (sx + hx) / 2 - 0.12;
  const ey = (sy + hy) / 2 + 0.22;
  const fx = ex + (hx - ex) * 0.5;
  const fy = ey + (hy - ey) * 0.5;
  return [limb('jersey', sx, sy, ex, ey, N.arm), limb('jersey', ex, ey, hx, hy, N.arm * 0.92), limb('accent', fx, fy, fx + (hx - ex) * 0.16, fy + (hy - ey) * 0.16, N.arm * 0.92, true), circle('glove', hx, hy, N.glove)];
}

export function skater(p: PoseInput): Raw {
  const { speed, wind, swing } = gait(p);
  const reach = N.reach * (0.35 + 0.65 * speed);
  const lean = speed * N.lean;
  const drop = p.kneel ? 0.85 : 0;
  const hipY = N.hipY + drop;
  const shY = N.shoulderY + drop;
  const shapes: Shape[] = [];

  for (const leg of [-1, 1]) {
    const footX = swing * reach * leg;
    const footY = -0.3 * Math.max(0, -swing * leg) * speed;
    const hipX = 0.2 * leg;
    const kneeX = (hipX + footX) / 2 + 0.16;
    const kneeY = (hipY + footY) / 2;
    shapes.push(limb('pants', hipX, hipY, kneeX, kneeY, N.thigh));
    shapes.push(limb('sock', kneeX, kneeY, footX, footY - 0.28, N.shin));
    // A hoop round the sock.
    const mx = (kneeX + footX) / 2;
    const my = (kneeY + footY - 0.28) / 2;
    shapes.push(limb('accent', mx - 0.02, my - 0.08, mx + 0.02, my + 0.08, N.shin, true));
    shapes.push(...skate(footX, footY));
  }

  const top = { x: lean + 0.4 - wind * 0.6, y: drop - 2.15 - wind * 0.6 + swing * 0.12 * speed };
  const low = { x: lean + 1.02 - wind * 0.36, y: drop - 1.62 - wind * 0.6 - swing * 0.12 * speed };
  if (p.cheer) {
    top.x = lean - 0.7;
    top.y = -4.1;
    low.x = lean + 0.8;
    low.y = -4.2;
  }
  shapes.push(...arm(lean - 0.18, shY + 0.12, top.x, top.y));

  // Baggy pants, a barrel chest, a shoulder pad on top.
  shapes.push(limb('pants', -0.05, hipY + 0.05, lean * 0.3, hipY - 0.3, 1.3));
  const waist: [number, number] = [lean * 0.3, hipY - 0.32];
  const chest: [number, number] = [lean * 0.9, shY + 0.42];
  shapes.push(limb('jersey', waist[0], waist[1], chest[0], chest[1], N.chest));
  shapes.push(limb('accent', waist[0] - 0.5, waist[1] + 0.3, waist[0] + 0.5, waist[1] + 0.3, 0.16, true));
  shapes.push(...patternOn(p.pattern, waist, chest, N.chest, 0.22));
  shapes.push(circle('jersey', lean - 0.05, shY + 0.1, N.pad));
  shapes.push(...head(lean * 1.2 + 0.14, N.headY + drop, false));

  shapes.push(circle('jersey', lean + 0.28, shY + 0.14, N.pad * 0.92));
  shapes.push(...arm(lean + 0.3, shY + 0.16, low.x, low.y));
  return { shapes, hand: low, stickEnd: null };
}

export function goalie(p: PoseInput): Raw {
  const shapes: Shape[] = [];
  const hipY = p.down ? -0.8 : -1.55;
  const shY = hipY - 1.1;
  if (p.down) {
    shapes.push(limb('pad', -0.2, -0.46, -1.85, -0.44, 0.9));
    shapes.push(limb('pad', 0.2, -0.46, 1.85, -0.44, 0.9));
  } else {
    for (const leg of [-1, 1]) {
      const x = 0.55 * leg;
      shapes.push(limb('pad', x * 0.8, hipY + 0.1, x, -0.46, 0.9));
      shapes.push(limb('accent', x - 0.32, -0.9, x + 0.32, -0.9, 0.12, true));
      shapes.push(limb('accent', x - 0.32, -0.5, x + 0.32, -0.5, 0.12, true));
      shapes.push(...skate(x + 0.12, 0));
    }
  }
  const catcher = { x: -1.15, y: shY + 0.5 };
  shapes.push(limb('jersey', -0.2, shY + 0.2, catcher.x, catcher.y, N.arm));
  shapes.push(circle('glove', catcher.x, catcher.y, 0.6));
  shapes.push(circle('pad', catcher.x - 0.12, catcher.y - 0.1, 0.3, true));

  shapes.push(limb('pants', 0, hipY, 0, hipY - 0.3, 1.95));
  const waist: [number, number] = [0, hipY - 0.32];
  const chest: [number, number] = [0.14, shY + 0.36];
  shapes.push(limb('jersey', waist[0], waist[1], chest[0], chest[1], 2.1));
  shapes.push(...patternOn(p.pattern, waist, chest, 2.1, 0.22));
  shapes.push(circle('jersey', -0.5, shY + 0.14, 0.62));
  shapes.push(circle('jersey', 0.62, shY + 0.14, 0.62));
  shapes.push(...head(0.2, shY - 0.62, true));

  const blocker = { x: 1.2, y: shY + 0.7 };
  shapes.push(limb('jersey', 0.5, shY + 0.2, blocker.x, blocker.y, N.arm));
  shapes.push(poly('pad', [
    [blocker.x - 0.36, blocker.y - 0.52],
    [blocker.x + 0.36, blocker.y - 0.52],
    [blocker.x + 0.36, blocker.y + 0.52],
    [blocker.x - 0.36, blocker.y + 0.52],
  ]));
  return { shapes, hand: blocker, stickEnd: { x: 1.95, y: -0.08 } };
}
