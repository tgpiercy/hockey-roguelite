import { hitBoards } from './rink';
import { dist, givePuck } from './team';
import type { Tuning } from './tuning';
import type { Player, SimEvent, World } from './types';

export function bodyRadius(p: Player, t: Tuning): number {
  return p.role === 'goalie' ? t.goalie.bodyRadius : t.skater.radius;
}

/** Pushes overlapping players apart and stops them moving into each other. Goalies hold their ground. */
export function separateBodies(players: Player[], t: Tuning): void {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i] as Player;
      const b = players[j] as Player;
      const reach = bodyRadius(a, t) + bodyRadius(b, t);
      let dx = a.pos.x - b.pos.x;
      let dy = a.pos.y - b.pos.y;
      let d = Math.hypot(dx, dy);
      if (d >= reach) continue;
      if (d === 0) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      const overlap = reach - d;
      const aShare = a.role === 'goalie' ? 0 : b.role === 'goalie' ? 1 : 0.5;
      a.pos.x += nx * overlap * aShare;
      a.pos.y += ny * overlap * aShare;
      b.pos.x -= nx * overlap * (1 - aShare);
      b.pos.y -= ny * overlap * (1 - aShare);

      const closing = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * ny;
      if (closing < 0) {
        if (a.role !== 'goalie') {
          a.vel.x -= nx * closing * aShare;
          a.vel.y -= ny * closing * aShare;
        }
        if (b.role !== 'goalie') {
          b.vel.x += nx * closing * (1 - aShare);
          b.vel.y += ny * closing * (1 - aShare);
        }
      }
      hitBoards(a.pos, a.vel, bodyRadius(a, t), 0, t);
      hitBoards(b.pos, b.vel, bodyRadius(b, t), 0, t);
    }
  }
}

/**
 * A loose puck on the ice meets the skaters. Nearest first:
 * the intended receiver of a pass catches it; anyone close enough collects a puck slow enough to handle;
 * an opponent in the lane picks off a flat pass; a puck too fast to handle deflects off a body.
 */
export function resolveLoosePuck(world: World, t: Tuning, events: SimEvent[]): void {
  const puck = world.puck;
  if (puck.air > 0) return;
  const skaters = world.players
    .filter((p) => p.role === 'skater')
    .sort((a, b) => dist(a.pos, puck.pos) - dist(b.pos, puck.pos) || a.id - b.id);

  for (const p of skaters) {
    if (p.pickupLock > 0 || p.stagger > 0) continue;
    const d = dist(p.pos, puck.pos);
    const relSpeed = Math.hypot(puck.vel.x - p.vel.x, puck.vel.y - p.vel.y);
    const isTarget = puck.passTarget === p.id;
    const target = puck.passTarget === null ? null : world.players[puck.passTarget];
    const interception = target !== null && target !== undefined && target.team !== p.team && d <= t.pass.interceptRadius;

    const caught =
      (isTarget && d <= t.pass.receiveRadius) ||
      (d <= t.puck.pickupRadius && relSpeed <= t.body.handleSpeed * p.fx.handleSpeedScale) ||
      interception;
    if (caught) {
      givePuck(world, p);
      events.push({ type: 'pickup', player: p.id });
      return;
    }

    // Too hot to handle: it glances off the body.
    const reach = t.skater.radius + t.puck.radius;
    if (d < reach && d > 0) {
      const nx = (puck.pos.x - p.pos.x) / d;
      const ny = (puck.pos.y - p.pos.y) / d;
      const into = (puck.vel.x - p.vel.x) * nx + (puck.vel.y - p.vel.y) * ny;
      if (into < 0) {
        puck.vel.x -= (1 + t.body.deflectBounce) * into * nx;
        puck.vel.y -= (1 + t.body.deflectBounce) * into * ny;
      }
      puck.pos.x = p.pos.x + nx * reach;
      puck.pos.y = p.pos.y + ny * reach;
      puck.passTarget = null;
    }
  }
}
