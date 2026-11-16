import type { JerseyPattern } from '../../core/crest';
import type { PoseInput, Shape, Tag } from '../figure';

/**
 * Pieces the candidate figure styles share. A candidate builds a player facing right, with his feet at
 * (0, 0), already in the figure's units (one footprint radius). The numbers in each candidate are in its
 * own file while the owner chooses between them; the one chosen moves its table to rinkLook.json.
 */
export interface Raw {
  shapes: Shape[];
  hand: { x: number; y: number };
  stickEnd: { x: number; y: number } | null;
}

export const circle = (tag: Tag, x: number, y: number, r: number, bare = false): Shape => ({ kind: 'circle', tag, x, y, r, ...(bare ? { bare } : {}) });
export const limb = (tag: Tag, x1: number, y1: number, x2: number, y2: number, w: number, bare = false): Shape => ({ kind: 'limb', tag, x1, y1, x2, y2, w, ...(bare ? { bare } : {}) });
export const poly = (tag: Tag, points: [number, number][], bare = false): Shape => ({ kind: 'poly', tag, points, ...(bare ? { bare } : {}) });

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** What a pose asks of the legs and the lean, the same for every upright style. */
export function gait(p: PoseInput): { speed: number; wind: number; swing: number } {
  return { speed: clamp01(p.speed), wind: clamp01(p.windUp), swing: Math.sin(p.stride) };
}

/** A team's jersey pattern across a body from waist to chest. */
export function patternOn(pattern: JerseyPattern, waist: [number, number], chest: [number, number], width: number, stripe: number): Shape[] {
  const [wx, wy] = waist;
  const [cx, cy] = chest;
  if (pattern === 'hoop') {
    const mx = (wx + cx) / 2;
    const my = (wy + cy) / 2;
    return [limb('accent', mx - width * 0.36, my, mx + width * 0.36, my, stripe, true)];
  }
  if (pattern === 'yoke') return [limb('accent', cx - width * 0.3, cy, cx + width * 0.3, cy, stripe * 1.5, true)];
  return [limb('accent', wx - width * 0.25, wy, cx + width * 0.25, cy, stripe, true)];
}
