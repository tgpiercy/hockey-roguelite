import type { PoseInput, Shape } from '../figure';
import { circle, gait, limb, type Raw } from './shared';

/**
 * Candidate C, "from above": the player seen from overhead, as the rink is. He is built facing right (+x)
 * round a centre lifted off the ground line by `ABOVE_CENTRE`, so that his picture fits the same box as an
 * upright figure; the rink turns the picture to the way he truly faces instead of mirroring it.
 */
export const ABOVE_CENTRE = 2.6;

const N = {
  shoulder: 1.0,
  body: 1.05,
  helmet: 0.58,
  arm: 0.46,
  glove: 0.36,
  skate: 0.3,
  stride: 0.55,
};

/** The stick is part of the picture in this style: shaft from the hands out to the blade, in front and to the right. */
function stick(handX: number, handY: number): Shape[] {
  const tipX = 2.15;
  const tipY = handY + 0.55;
  return [limb('stick', handX - 0.5, handY - 0.35, tipX, tipY, 0.14, true), limb('stick', tipX, tipY, tipX + 0.1, tipY - 0.5, 0.2, true)];
}

function at(shapes: Shape[]): Shape[] {
  const c = -ABOVE_CENTRE;
  return shapes.map((s): Shape => {
    if (s.kind === 'circle') return { ...s, y: s.y + c };
    if (s.kind === 'limb') return { ...s, y1: s.y1 + c, y2: s.y2 + c };
    return { ...s, points: s.points.map(([x, y]) => [x, y + c]) };
  });
}

export function skater(p: PoseInput): Raw {
  const { speed, wind, swing } = gait(p);
  const reach = N.stride * (0.3 + 0.7 * speed);
  const shapes: Shape[] = [];
  // The skates, one ahead and one behind as he strides.
  for (const leg of [-1, 1]) {
    const x = -0.15 + swing * reach * leg;
    shapes.push(limb('sock', x - 0.75, 0.46 * leg, x - 0.1, 0.46 * leg, N.skate * 1.1));
    shapes.push(limb('skate', x - 0.1, 0.46 * leg, x + 0.72, 0.46 * leg, N.skate));
    shapes.push(limb('blade', x - 0.05, 0.46 * leg, x + 0.8, 0.46 * leg, 0.07, true));
  }
  shapes.push(limb('pants', -0.35, -0.4, -0.35, 0.4, 0.8));
  // Hands on the stick, out in front; a wind-up draws them back and across.
  const hands = p.cheer ? { x: 0.2, y: 0 } : { x: 0.95 - wind * 1.1, y: 0.42 + wind * 0.5 };
  if (!p.cheer) shapes.push(...stick(hands.x, hands.y));
  if (p.cheer) {
    for (const side of [-1, 1]) {
      shapes.push(limb('jersey', 0, N.shoulder * side, 0.25, 1.75 * side, N.arm));
      shapes.push(circle('glove', 0.25, 1.75 * side, N.glove));
    }
  } else {
    shapes.push(limb('jersey', 0.05, -N.shoulder, hands.x - 0.42, hands.y - 0.3, N.arm));
    shapes.push(circle('glove', hands.x - 0.42, hands.y - 0.3, N.glove));
    shapes.push(limb('jersey', 0.05, N.shoulder, hands.x, hands.y, N.arm));
    shapes.push(circle('glove', hands.x, hands.y, N.glove));
  }
  // Shoulders across, with the team's pattern, and the helmet on top.
  shapes.push(limb('jersey', 0, -N.shoulder, 0, N.shoulder, N.body));
  if (p.pattern === 'hoop') shapes.push(limb('accent', -0.3, -N.shoulder, -0.3, N.shoulder, 0.2, true));
  else if (p.pattern === 'yoke') shapes.push(limb('accent', 0.28, -N.shoulder * 0.9, 0.28, N.shoulder * 0.9, 0.3, true));
  else shapes.push(limb('accent', -0.35, -N.shoulder * 0.8, 0.35, N.shoulder * 0.8, 0.22, true));
  shapes.push(circle('helmet', 0.12, 0, N.helmet));
  shapes.push(limb('accent', -0.4, 0, 0.5, 0, 0.14, true));
  shapes.push(limb('visor', 0.6, -0.3, 0.6, 0.3, 0.16, true));
  return { shapes: at(shapes), hand: { x: hands.x, y: hands.y - ABOVE_CENTRE }, stickEnd: null };
}

export function goalie(p: PoseInput): Raw {
  const shapes: Shape[] = [];
  const spread = p.down ? 1.7 : 1.0;
  // Leg pads out to each side, wider when he is down.
  for (const side of [-1, 1]) {
    shapes.push(limb('pad', 0.25, 0.3 * side, 0.45, spread * side, 0.7));
    shapes.push(limb('accent', 0.1, spread * 0.7 * side, 0.75, spread * 0.7 * side, 0.1, true));
  }
  shapes.push(circle('pants', -0.2, 0, 0.9));
  // The goal stick, lying across in front of him.
  shapes.push(limb('stick', 0.5, 0.9, 1.5, 0.2, 0.16, true));
  shapes.push(limb('stick', 1.5, 0.2, 1.55, -0.75, 0.3, true));
  shapes.push(limb('jersey', 0, -1.2, 0.55, -1.6, 0.5));
  shapes.push(circle('glove', 0.6, -1.65, 0.52));
  shapes.push(limb('jersey', 0, 1.2, 0.5, 1.25, 0.5));
  shapes.push({ kind: 'poly', tag: 'pad', points: [[0.3, 0.95], [1.05, 0.95], [1.05, 1.6], [0.3, 1.6]] });
  shapes.push(limb('jersey', 0, -1.2, 0, 1.2, 1.3));
  shapes.push(limb('accent', -0.35, -1.1, -0.35, 1.1, 0.2, true));
  shapes.push(circle('helmet', 0.18, 0, 0.64));
  for (const k of [-0.3, 0, 0.3]) shapes.push(limb('cage', 0.45, k, 0.85, k, 0.07, true));
  return { shapes: at(shapes), hand: { x: 0.5, y: 0.9 - ABOVE_CENTRE }, stickEnd: null };
}
