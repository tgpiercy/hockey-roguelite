import { hitBoards } from './rink';
import { goalieReaction } from './lines';
import { attackDir, availableSkaters, dist, givePuck, loosePuck, otherTeam, ownNet, skatersOf } from './team';
import type { Tuning } from './tuning';
import type { Player, SimEvent, Vec, World } from './types';
import { STEPS_PER_SECOND } from './clock';

/** What the goalie currently believes about the puck: where it was one reaction time ago. */
function perceived(g: Player, world: World, t: Tuning): { pos: Vec; vel: Vec; loose: boolean } {
  const state = g.goalie!;
  const delaySteps = Math.round(goalieReaction(g, t) * STEPS_PER_SECOND);
  const index = Math.max(0, state.seen.length - 1 - delaySteps);
  return state.seen[index] ?? { pos: world.puck.pos, vel: world.puck.vel, loose: world.puck.carrier === null };
}

/** Remembers the puck's position this step, for the goalie's delayed reaction. */
export function recordPuck(g: Player, world: World, t: Tuning): void {
  const state = g.goalie!;
  const puck = world.puck;
  state.seen.push({ pos: { x: puck.pos.x, y: puck.pos.y }, vel: { x: puck.vel.x, y: puck.vel.y }, loose: puck.carrier === null });
  const keep = Math.round(goalieReaction(g, t) * STEPS_PER_SECOND) + 2;
  while (state.seen.length > keep) state.seen.shift();
}

/**
 * Where the goalie wants to stand. Normally on the line from the net to the puck, a set depth out.
 * Against a shot already on its way, where that shot will cross his depth instead.
 */
export function goalieTarget(g: Player, world: World, t: Tuning): Vec {
  const state = g.goalie!;
  const net = ownNet(g.team, t);
  const out = attackDir(g.team);
  const seen = perceived(g, world, t);
  const standX = net.x + out * state.fx.depth;
  const limit = t.goalie.creaseHalfWidth;

  // Puck behind the goal line: hug the post on that side.
  if (out * (seen.pos.x - net.x) <= 0) {
    const side = seen.pos.y < 0 ? -1 : 1;
    return { x: net.x + out * t.goalie.bodyRadius * 0.5, y: side * (t.net.mouthWidth / 2 - t.goalie.bodyRadius * 0.5) };
  }

  // A shot heading for the net: go to where it will arrive.
  const speed = Math.hypot(seen.vel.x, seen.vel.y);
  const towardNet = -out * seen.vel.x;
  if (seen.loose && speed >= t.goalie.shotSpeedThreshold && towardNet > 0 && out * (seen.pos.x - standX) > 0) {
    const time = (out * (seen.pos.x - standX)) / towardNet;
    const y = seen.pos.y + seen.vel.y * time;
    if (Math.abs(y) <= limit + 1) return { x: standX, y: Math.max(-limit, Math.min(limit, y)) };
  }

  // Otherwise play the angle.
  const dx = seen.pos.x - net.x;
  const dy = seen.pos.y - net.y;
  const d = Math.hypot(dx, dy) || 1;
  const depth = Math.min(state.fx.depth, d * 0.5);
  return { x: net.x + (dx / d) * depth, y: Math.max(-limit, Math.min(limit, (dy / d) * depth)) };
}

/** Moves the goalie toward his spot, no faster than his lateral speed. */
export function stepGoalie(g: Player, world: World, t: Tuning, dt: number): void {
  const state = g.goalie!;
  state.ignorePuck = Math.max(0, state.ignorePuck - dt);
  const target = goalieTarget(g, world, t);
  const dx = target.x - g.pos.x;
  const dy = target.y - g.pos.y;
  const d = Math.hypot(dx, dy);
  const move = Math.min(d, state.fx.lateralSpeed * dt);
  if (d > 1e-6) {
    g.vel.x = ((dx / d) * move) / dt;
    g.vel.y = ((dy / d) * move) / dt;
    g.pos.x += (dx / d) * move;
    g.pos.y += (dy / d) * move;
  } else {
    g.vel.x = 0;
    g.vel.y = 0;
  }
  g.facing = Math.atan2(world.puck.pos.y - g.pos.y, world.puck.pos.x - g.pos.x);
  hitBoards(g.pos, g.vel, t.goalie.bodyRadius, 0, t);
}

/**
 * The puck has reached the goalie. A slow enough puck is frozen (he holds it);
 * a faster one is kicked out as a rebound.
 */
export function makeSave(g: Player, world: World, t: Tuning, events: SimEvent[]): void {
  const state = g.goalie!;
  const puck = world.puck;
  const speed = Math.hypot(puck.vel.x, puck.vel.y);
  const shooter = puck.shotBy === null ? undefined : world.players[puck.shotBy];
  if (shooter && shooter.team !== g.team) g.stats.saves += 1;
  puck.shotBy = null;

  if (speed <= state.fx.freezeSpeed) {
    givePuck(world, g);
    state.hold = t.goalie.holdSeconds;
    puck.vel.x = 0;
    puck.vel.y = 0;
    events.push({ type: 'save', goalie: g.id, frozen: true });
    return;
  }

  // Rebound: out from the goalie, scattered, with part of the shot's speed.
  const scatter = (world.rng.range(-1, 1) * t.goalie.reboundScatterDegrees * Math.PI) / 180;
  const out = Math.atan2(puck.pos.y - g.pos.y, puck.pos.x - g.pos.x) + scatter;
  const reboundSpeed = Math.max(t.goalie.reboundMinSpeed, speed * state.fx.reboundKeep);
  loosePuck(world);
  puck.vel.x = Math.cos(out) * reboundSpeed;
  puck.vel.y = Math.sin(out) * reboundSpeed;
  state.ignorePuck = t.goalie.ignoreSeconds;
  events.push({ type: 'save', goalie: g.id, frozen: false });
}

/** The teammate a goalie should pass out to: the one with the most room. */
export function outletTarget(g: Player, world: World): Player | null {
  const opponents = skatersOf(world, otherTeam(g.team));
  let best: Player | null = null;
  let bestRoom = -1;
  for (const mate of availableSkaters(world, g.team)) {
    const room = opponents.length === 0 ? 1 : Math.min(...opponents.map((o) => dist(o.pos, mate.pos)));
    if (room > bestRoom) {
      best = mate;
      bestRoom = room;
    }
  }
  return best;
}

/** While holding a frozen puck: count down, then lob it out to a teammate. */
export function stepGoalieHold(g: Player, world: World, t: Tuning, dt: number, events: SimEvent[]): void {
  const state = g.goalie!;
  const puck = world.puck;
  const out = attackDir(g.team);
  puck.pos.x = g.pos.x + out * (state.fx.coverRadius * 0.5);
  puck.pos.y = g.pos.y;
  puck.vel.x = 0;
  puck.vel.y = 0;
  state.hold -= dt;
  if (state.hold > 0) return;

  const mate = outletTarget(g, world);
  const speed = t.goalie.outletSpeed;
  let angle = out === 1 ? 0 : Math.PI;
  let flight = 1;
  if (mate) {
    angle = Math.atan2(mate.pos.y - puck.pos.y, mate.pos.x - puck.pos.x);
    flight = dist(mate.pos, puck.pos) / speed;
  }
  loosePuck(world);
  puck.vel.x = Math.cos(angle) * speed;
  puck.vel.y = Math.sin(angle) * speed;
  puck.passTarget = mate ? mate.id : null;
  puck.air = Math.min(t.pass.saucerMaxAirSeconds, flight * t.pass.saucerAirShare);
  puck.lastTeam = g.team;
  state.ignorePuck = t.goalie.ignoreSeconds;
  events.push({ type: 'pass', player: g.id, target: mate ? mate.id : null, saucer: true });
}
