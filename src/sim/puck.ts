import { goalCrossed, hitBoards, hitNets } from './rink';
import type { Tuning } from './tuning';
import type { Puck, Skater, Vec } from './types';

export function createPuck(x: number, y: number): Puck {
  return { pos: { x, y }, vel: { x: 0, y: 0 }, carrier: null, air: 0, passTarget: null, lastTeam: null, touches: [], shotBy: null };
}

/** Something round that stops the puck, such as a goalie. */
export interface Blocker {
  pos: Vec;
  radius: number;
}

export interface PuckStepResult {
  /** Side of the net scored on, or 0. */
  scored: -1 | 0 | 1;
  hitPost: boolean;
  /** Index of the blocker the puck ran into, or -1. The puck stops moving for this step when it does. */
  blocker: number;
}

/**
 * Moves a loose puck for dt seconds: friction, then bounces off boards, posts and netting.
 * The move is split into sub-steps short enough that a hard shot cannot pass through anything.
 */
export function stepLoosePuck(puck: Puck, t: Tuning, dt: number, blockers: Blocker[] = []): PuckStepResult {
  const result: PuckStepResult = { scored: 0, hitPost: false, blocker: -1 };
  const speedNow = Math.hypot(puck.vel.x, puck.vel.y);
  const parts = Math.max(1, Math.ceil((speedNow * dt) / (t.puck.radius * 0.5)));
  const h = dt / parts;

  for (let i = 0; i < parts; i++) {
    const speed = Math.hypot(puck.vel.x, puck.vel.y);
    // A puck in the air (saucer pass) does not rub on the ice.
    if (speed > 0 && puck.air <= 0) {
      const slowed = Math.max(0, speed - (speed * t.puck.drag + t.puck.slideDecel) * h);
      puck.vel.x *= slowed / speed;
      puck.vel.y *= slowed / speed;
    }

    const prev: Vec = { x: puck.pos.x, y: puck.pos.y };
    puck.pos.x += puck.vel.x * h;
    puck.pos.y += puck.vel.y * h;

    hitBoards(puck.pos, puck.vel, t.puck.radius, t.rink.boardBounce, t);
    if (hitNets(puck.pos, puck.vel, t.puck.radius, t.net.postBounce, t.net.nettingBounce, t) === 'post') {
      result.hitPost = true;
    }

    for (let b = 0; b < blockers.length; b++) {
      const blocker = blockers[b] as Blocker;
      const dx = puck.pos.x - blocker.pos.x;
      const dy = puck.pos.y - blocker.pos.y;
      const d = Math.hypot(dx, dy);
      const reach = blocker.radius + t.puck.radius;
      if (d < reach) {
        // Put the puck on the blocker's surface, on the side it came from.
        const nx = d > 0 ? dx / d : speed > 0 ? -puck.vel.x / speed : 1;
        const ny = d > 0 ? dy / d : speed > 0 ? -puck.vel.y / speed : 0;
        puck.pos.x = blocker.pos.x + nx * reach;
        puck.pos.y = blocker.pos.y + ny * reach;
        result.blocker = b;
        return result;
      }
    }

    if (result.scored === 0) result.scored = goalCrossed(prev, puck.pos, t);
    if (result.scored !== 0) return result;
  }
  return result;
}

/** Where a carried puck wants to sit: ahead of the skater, on the stick side. */
export function carrySpot(s: Skater, t: Tuning): Vec {
  const fx = Math.cos(s.facing);
  const fy = Math.sin(s.facing);
  return {
    x: s.pos.x + fx * t.puck.carryForward - fy * t.puck.carrySide * s.hand,
    y: s.pos.y + fy * t.puck.carryForward + fx * t.puck.carrySide * s.hand,
  };
}

/** Moves a carried puck toward its spot on the stick. Returns the side scored on if it was carried into a net, or 0. */
export function stepCarriedPuck(puck: Puck, s: Skater, t: Tuning, dt: number): -1 | 0 | 1 {
  const spot = carrySpot(s, t);
  const pull = Math.min(1, t.puck.carryFollow * dt);
  const prev: Vec = { x: puck.pos.x, y: puck.pos.y };
  puck.pos.x += (spot.x - puck.pos.x) * pull;
  puck.pos.y += (spot.y - puck.pos.y) * pull;
  puck.vel.x = s.vel.x;
  puck.vel.y = s.vel.y;

  // The puck cannot be carried through the boards or the netting.
  const still: Vec = { x: 0, y: 0 };
  hitBoards(puck.pos, still, t.puck.radius, 0, t);
  hitNets(puck.pos, still, t.puck.radius, 0, 0, t);
  return goalCrossed(prev, puck.pos, t);
}
