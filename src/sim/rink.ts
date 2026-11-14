import type { Tuning } from './tuning';
import type { Vec } from './types';

export interface Net {
  /** -1 for the left end, 1 for the right end. */
  side: -1 | 1;
  /** X of the goal line. */
  lineX: number;
  posts: [Vec, Vec];
  /** Netting as line segments: two sides and the back. */
  netting: [Vec, Vec][];
}

/** X distance from centre ice to each goal line. */
export function goalLineX(t: Tuning): number {
  return t.rink.length / 2 - t.rink.goalLineFromEnd;
}

export function nets(t: Tuning): [Net, Net] {
  const make = (side: -1 | 1): Net => {
    const lineX = side * goalLineX(t);
    const backX = side * (goalLineX(t) + t.net.depth);
    const half = t.net.mouthWidth / 2;
    const top: Vec = { x: lineX, y: -half };
    const bottom: Vec = { x: lineX, y: half };
    const backTop: Vec = { x: backX, y: -half };
    const backBottom: Vec = { x: backX, y: half };
    return {
      side,
      lineX,
      posts: [top, bottom],
      netting: [
        [top, backTop],
        [bottom, backBottom],
        [backTop, backBottom],
      ],
    };
  };
  return [make(-1), make(1)];
}

/** Bounces velocity v off a surface with normal n, keeping `bounce` of the speed into the surface. */
function reflect(v: Vec, nx: number, ny: number, bounce: number): void {
  const into = v.x * nx + v.y * ny;
  if (into < 0) {
    v.x -= (1 + bounce) * into * nx;
    v.y -= (1 + bounce) * into * ny;
  }
}

/**
 * Keeps a circle inside the boards (a rectangle with rounded corners, centred on 0,0).
 * Moves p back inside and bounces v. Returns true if it touched.
 */
export function hitBoards(p: Vec, v: Vec, radius: number, bounce: number, t: Tuning): boolean {
  const hx = t.rink.length / 2;
  const hy = t.rink.width / 2;
  const corner = Math.min(t.rink.cornerRadius, hx, hy);
  const cx = hx - corner;
  const cy = hy - corner;
  const sx = p.x < 0 ? -1 : 1;
  const sy = p.y < 0 ? -1 : 1;
  const ax = Math.abs(p.x);
  const ay = Math.abs(p.y);

  if (ax > cx && ay > cy) {
    const dx = ax - cx;
    const dy = ay - cy;
    const d = Math.hypot(dx, dy);
    const limit = Math.max(0, corner - radius);
    if (d <= limit || d === 0) return false;
    const k = limit / d;
    p.x = sx * (cx + dx * k);
    p.y = sy * (cy + dy * k);
    reflect(v, (-sx * dx) / d, (-sy * dy) / d, bounce);
    return true;
  }

  let touched = false;
  if (ax > hx - radius) {
    p.x = sx * (hx - radius);
    reflect(v, -sx, 0, bounce);
    touched = true;
  }
  if (ay > hy - radius) {
    p.y = sy * (hy - radius);
    reflect(v, 0, -sy, bounce);
    touched = true;
  }
  return touched;
}

function hitCircle(p: Vec, v: Vec, radius: number, c: Vec, cRadius: number, bounce: number): boolean {
  let dx = p.x - c.x;
  let dy = p.y - c.y;
  let d = Math.hypot(dx, dy);
  const reach = radius + cRadius;
  if (d >= reach) return false;
  if (d === 0) {
    // Dead centre: push back the way it came.
    const speed = Math.hypot(v.x, v.y);
    dx = speed > 0 ? -v.x / speed : 1;
    dy = speed > 0 ? -v.y / speed : 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  p.x = c.x + nx * reach;
  p.y = c.y + ny * reach;
  reflect(v, nx, ny, bounce);
  return true;
}

function hitSegment(p: Vec, v: Vec, radius: number, a: Vec, b: Vec, bounce: number): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const along = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  return hitCircle(p, v, radius, { x: a.x + abx * along, y: a.y + aby * along }, 0, bounce);
}

/**
 * Bounces a circle off the posts and netting of both nets.
 * Returns "post", "net" or null.
 */
export function hitNets(
  p: Vec,
  v: Vec,
  radius: number,
  postBounce: number,
  nettingBounce: number,
  t: Tuning,
): 'post' | 'net' | null {
  if (Math.abs(p.x) < goalLineX(t) - radius - t.net.postRadius) return null;
  let result: 'post' | 'net' | null = null;
  for (const net of nets(t)) {
    for (const post of net.posts) {
      if (hitCircle(p, v, radius, post, t.net.postRadius, postBounce)) result = 'post';
    }
    for (const [a, b] of net.netting) {
      if (hitSegment(p, v, radius, a, b, nettingBounce) && result === null) result = 'net';
    }
  }
  return result;
}

/**
 * Did a point moving from prev to next cross a goal line between the posts, going into the net?
 * Returns the side of the net scored on, or 0.
 */
export function goalCrossed(prev: Vec, next: Vec, t: Tuning): -1 | 0 | 1 {
  const half = t.net.mouthWidth / 2;
  for (const side of [-1, 1] as const) {
    const lineX = side * goalLineX(t);
    const before = side * (prev.x - lineX);
    const after = side * (next.x - lineX);
    if (before < 0 && after >= 0) {
      const yAtLine = prev.y + (next.y - prev.y) * (before / (before - after));
      if (Math.abs(yAtLine) < half) return side;
    }
  }
  return 0;
}
