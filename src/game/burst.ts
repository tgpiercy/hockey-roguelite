import { createRng } from '../core/rng';

/**
 * The jagged shape a comic puts behind a shouted word: points round a circle of radius 1, going out to the
 * edge and back in by `depth` in turn, each nudged by up to `jitter` so no two words wear the same shape.
 * The same words always give the same shape. The scene stretches it to fit the word.
 */
export function burstPoints(words: string, spikes: number, depth: number, jitter: number): [number, number][] {
  const rng = createRng(`burst/${words}`);
  const out: [number, number][] = [];
  const n = Math.max(3, Math.round(spikes)) * 2;
  for (let i = 0; i < n; i++) {
    const outer = i % 2 === 0;
    const radius = (outer ? 1 : 1 - depth) + (rng.next() * 2 - 1) * jitter * (outer ? 1 : 0.5);
    const angle = ((i + (rng.next() - 0.5) * 0.5) / n) * Math.PI * 2;
    out.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return out;
}

/**
 * How big a word is drawn as it lands, as a share of its full size: it grows from nothing, goes `over`
 * past full, and settles at 1 after `seconds`.
 */
export function popScale(age: number, seconds: number, over: number): number {
  if (seconds <= 0 || age >= seconds) return 1;
  const k = Math.max(0, age / seconds);
  // Up to full size in the first part of the time, with a swell over the whole of it.
  return Math.min(1, k * 2.5) * (1 + over * Math.sin(k * Math.PI));
}

/** The points stretched to `rx` by `ry`, turned by `degrees` and moved to (cx, cy). */
export function placed(points: readonly [number, number][], cx: number, cy: number, rx: number, ry: number, degrees: number): { x: number; y: number }[] {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return points.map(([x, y]) => ({ x: cx + x * rx * cos - y * ry * sin, y: cy + x * rx * sin + y * ry * cos }));
}

/**
 * Which way a shouted word is put from the player it is about, so that it does not sit on the play: away
 * from the puck, and leaning up the screen by `upBias` so it tends to stand over heads. A direction of
 * length 1; straight up when the puck is where he is.
 */
export function awayFrom(from: { x: number; y: number }, puck: { x: number; y: number }, upBias: number): { x: number; y: number } {
  const dx = from.x - puck.x;
  const dy = from.y - puck.y;
  const d = Math.hypot(dx, dy);
  const x = d < 1e-6 ? 0 : dx / d;
  const y = (d < 1e-6 ? 0 : dy / d) - upBias;
  const length = Math.hypot(x, y);
  return length < 1e-6 ? { x: 0, y: -1 } : { x: x / length, y: y / length };
}

/** True if a point is under a burst of half-widths `rx` and `ry` at (cx, cy), made `margin` times as big. */
export function covers(cx: number, cy: number, rx: number, ry: number, margin: number, point: { x: number; y: number }): boolean {
  const u = (point.x - cx) / (rx * margin);
  const v = (point.y - cy) / (ry * margin);
  return u * u + v * v < 1;
}
