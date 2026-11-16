import { hitBoards } from './rink';
import { goalieReaction } from './lines';
import { screened } from './tips';
import { attackDir, availableSkaters, clearAhead, dist, givePuck, humansOn, loosePuck, otherTeam, ownNet, skatersOf } from './team';
import type { Tuning } from './tuning';
import type { Player, SimEvent, Vec, World } from './types';
import { STEPS_PER_SECOND } from './clock';

/**
 * Goalie assist, like aim assist and check assist: the goalie of a team a person plays on gets help on the
 * chance his skaters could do nothing about, an opponent in alone with nobody between him and the net.
 * True while the opponent carrying the puck, or the one who has just shot it, has a clear path.
 */
export function goalieHelped(g: Player, world: World, t: Tuning): boolean {
  if (t.goalieAssist.strength <= 0 || humansOn(world, g.team).length === 0) return false;
  const id = world.puck.carrier ?? world.puck.shotBy;
  const attacker = id === null ? undefined : world.players[id];
  return attacker !== undefined && attacker.team !== g.team && attacker.role === 'skater' && clearAhead(world, attacker);
}

/** What the goalie currently believes about the puck: where it was one reaction time ago. */
function perceived(g: Player, world: World, t: Tuning): { pos: Vec; vel: Vec; loose: boolean } {
  const state = g.goalie!;
  // An attacker standing in his sightline makes him slower to see where the puck has gone.
  // A shot at the end of a passing chain reaches a goalie still moving across: he reacts a little later for each pass in it.
  const chained = 1 + t.chain.reactionPerStep * world.puck.shotChain;
  // Helped (see above), he reads the play sooner.
  const helped = goalieHelped(g, world, t) ? 1 - t.goalieAssist.strength * (1 - t.goalieAssist.reactionScale) : 1;
  const delaySteps = Math.round(goalieReaction(g, t) * (screened(g, world, t) ? t.tips.screenScale : 1) * chained * helped * STEPS_PER_SECOND);
  const index = Math.max(0, state.seen.length - 1 - delaySteps);
  return state.seen[index] ?? { pos: world.puck.pos, vel: world.puck.vel, loose: world.puck.carrier === null };
}

/** Remembers the puck's position this step, for the goalie's delayed reaction. */
export function recordPuck(g: Player, world: World, t: Tuning): void {
  const state = g.goalie!;
  const puck = world.puck;
  state.seen.push({ pos: { x: puck.pos.x, y: puck.pos.y }, vel: { x: puck.vel.x, y: puck.vel.y }, loose: puck.carrier === null });
  const keep = Math.round(goalieReaction(g, t) * Math.max(1, t.tips.screenScale) * STEPS_PER_SECOND) + 2;
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
  // He meets it at the depth he is already standing at, so having come out to challenge is not undone.
  const meetX = out * (g.pos.x - standX) > 0 ? g.pos.x : standX;
  if (seen.loose && speed >= t.goalie.shotSpeedThreshold && towardNet > 0 && out * (seen.pos.x - meetX) > 0) {
    const time = (out * (seen.pos.x - meetX)) / towardNet;
    const y = seen.pos.y + seen.vel.y * time;
    if (Math.abs(y) <= limit + 1) return { x: meetX, y: Math.max(-limit, Math.min(limit, y)) };
  }

  // Otherwise play the angle.
  const dx = seen.pos.x - net.x;
  const dy = seen.pos.y - net.y;
  const d = Math.hypot(dx, dy) || 1;
  // A carrier coming straight down the middle is challenged: he steps out further to cut the angle.
  const straightOn = !seen.loose && d <= t.goalie.challengeRange && Math.abs(dy) <= t.goalie.challengeHalfWidth;
  // Helped, he comes out further still against the man in alone.
  const extra = straightOn && goalieHelped(g, world, t) ? t.goalieAssist.challengeDepth * t.goalieAssist.strength : 0;
  const depth = Math.min(state.fx.depth + (straightOn ? t.goalie.challengeDepth : 0) + extra, d * 0.5);
  return { x: net.x + (dx / d) * depth, y: Math.max(-limit, Math.min(limit, (dy / d) * depth)) };
}

/** Moves the goalie toward his spot, no faster than his lateral speed. */
export function stepGoalie(g: Player, world: World, t: Tuning, dt: number): void {
  const state = g.goalie!;
  state.ignorePuck = Math.max(0, state.ignorePuck - dt);
  // He has bitten on a shot fake: stuck where he is until it wears off.
  if (state.bitten > 0) {
    state.bitten = Math.max(0, state.bitten - dt);
    g.vel.x = 0;
    g.vel.y = 0;
    return;
  }
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
  // Out from the goalie, pulled part of the way toward straight up the ice, so rebounds land in the slot.
  const away = Math.atan2(puck.pos.y - g.pos.y, puck.pos.x - g.pos.x);
  const upIce = attackDir(g.team) === 1 ? 0 : Math.PI;
  let turn = upIce - away;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  const out = away + turn * t.goalie.reboundToSlot + scatter;
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
