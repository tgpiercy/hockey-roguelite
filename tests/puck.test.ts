import { describe, expect, it } from 'vitest';
import { createPuck, stepLoosePuck } from '../src/sim/puck';
import { goalLineX, hitBoards } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import type { Puck, Vec } from '../src/sim/types';
import { STEP_SECONDS } from '../src/sim/world';

const t = cloneTuning();

const puckAt = (x: number, y: number, vx: number, vy: number): Puck => {
  const puck = createPuck(x, y);
  puck.vel = { x: vx, y: vy };
  return puck;
};

/** True if the puck is inside the boards (within a hair). */
const inside = (p: Vec): boolean => {
  const copy = { x: p.x, y: p.y };
  hitBoards(copy, { x: 0, y: 0 }, t.puck.radius, 0, t);
  return Math.hypot(copy.x - p.x, copy.y - p.y) < 1e-6;
};

const run = (puck: Puck, steps: number, each?: (p: Puck) => void): void => {
  for (let i = 0; i < steps; i++) {
    stepLoosePuck(puck, t, STEP_SECONDS);
    each?.(puck);
  }
};

describe('loose puck', () => {
  it('bounces straight back off the end boards and loses speed', () => {
    const puck = puckAt(0, 4, 30, 0);
    let bounced = false;
    run(puck, 120, (p) => {
      if (!bounced && p.vel.x < 0) {
        bounced = true;
        expect(Math.abs(p.vel.x)).toBeLessThan(30 * t.rink.boardBounce + 0.01);
        expect(p.vel.y).toBeCloseTo(0);
        expect(p.pos.x).toBeLessThanOrEqual(t.rink.length / 2 - t.puck.radius + 1e-9);
      }
    });
    expect(bounced).toBe(true);
  });

  it('bounces off the side boards', () => {
    const puck = puckAt(0, 0, 0, 30);
    run(puck, 60);
    expect(puck.vel.y).toBeLessThan(0);
    expect(puck.vel.x).toBeCloseTo(0);
  });

  it('stays inside the rink through a rounded corner', () => {
    const puck = puckAt(15, 5, 25, 25);
    run(puck, 600, (p) => expect(inside(p.pos)).toBe(true));
  });

  it('bounces off a post', () => {
    const postY = t.net.mouthWidth / 2;
    const puck = puckAt(10, postY, 30, 0);
    let hitPost = false;
    for (let i = 0; i < 60 && !hitPost; i++) {
      const result = stepLoosePuck(puck, t, STEP_SECONDS);
      hitPost = result.hitPost;
      expect(result.scored).toBe(0);
    }
    expect(hitPost).toBe(true);
    expect(puck.vel.x).toBeLessThan(0);
    expect(puck.pos.x).toBeLessThan(goalLineX(t));
  });

  it('slows with friction and comes to rest', () => {
    const puck = puckAt(-10, 0, 5, 0);
    run(puck, 60);
    const afterOneSecond = Math.hypot(puck.vel.x, puck.vel.y);
    expect(afterOneSecond).toBeLessThan(5);
    expect(afterOneSecond).toBeGreaterThan(0);
    run(puck, 60 * 20);
    expect(puck.vel).toEqual({ x: 0, y: 0 });
  });

  it('never leaves the rink, even at twice maximum shot speed in any direction', () => {
    const speed = t.shot.maxSpeed * 2;
    const starts: Vec[] = [
      { x: 0, y: 0 },
      { x: 18, y: 9 },
      { x: -24, y: -11 },
      { x: 25, y: 0 },
    ];
    for (const start of starts) {
      for (let a = 0; a < 72; a++) {
        const angle = (a / 72) * Math.PI * 2;
        const puck = puckAt(start.x, start.y, Math.cos(angle) * speed, Math.sin(angle) * speed);
        run(puck, 240, (p) => expect(inside(p.pos)).toBe(true));
      }
    }
  });

  it('cannot pass through the netting from behind or from the side', () => {
    const speed = t.shot.maxSpeed * 2;
    const gx = goalLineX(t);
    const behind = puckAt(gx + t.net.depth + 2, 0, -speed, 0);
    const side = puckAt(gx + t.net.depth / 2, -5, 0, speed);
    for (const puck of [behind, side]) {
      for (let i = 0; i < 240; i++) {
        expect(stepLoosePuck(puck, t, STEP_SECONDS).scored).toBe(0);
        const inNet =
          puck.pos.x > gx && puck.pos.x < gx + t.net.depth && Math.abs(puck.pos.y) < t.net.mouthWidth / 2 - t.puck.radius;
        expect(inNet).toBe(false);
      }
    }
  });
});
