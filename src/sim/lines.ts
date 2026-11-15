import { STEP_SECONDS } from './clock';
import type { SkaterEffects } from './ratings';
import { createSkater } from './skater';
import { attackDir, carrierOf, dist, skatersOf } from './team';
import type { Tuning } from './tuning';
import type { InputFrame, Player, SimEvent, Vec, World } from './types';

/** Where a team's bench door is: on the top boards, on its own side of centre. */
export function benchDoor(team: 0 | 1, t: Tuning): Vec {
  return { x: -attackDir(team) * t.bench.doorX, y: -t.rink.width / 2 + t.skater.radius + 0.1 };
}

/**
 * How much a tired player keeps of something: 1 while his energy is above the "tired" level,
 * falling in a straight line to `floor` at zero energy.
 */
export function energyScale(p: Player, floor: number, t: Tuning): number {
  if (p.energy >= t.energy.tiredBelow) return 1;
  return floor + (1 - floor) * (p.energy / t.energy.tiredBelow);
}

/** A skater's abilities right now: his ratings, worn down by fatigue (speed and shot power). */
export function currentFx(p: Player, t: Tuning): SkaterEffects {
  const speed = energyScale(p, t.energy.minSpeedScale, t);
  if (speed === 1) return p.fx;
  return {
    ...p.fx,
    topSpeedScale: p.fx.topSpeedScale * speed,
    accelerationScale: p.fx.accelerationScale * speed,
    shotPower: p.fx.shotPower * energyScale(p, t.energy.minShotScale, t),
  };
}

/** A goalie's reaction delay right now: longer as he tires. */
export function goalieReaction(g: Player, t: Tuning): number {
  return g.goalie!.fx.reactionSeconds * (1 + (1 - g.energy) * t.energy.goalieReactionPenalty);
}

/** Energy falls on the ice (faster when sprinting) and refills on the bench. Time on ice is counted here too. */
export function stepEnergy(world: World, t: Tuning): void {
  const dt = STEP_SECONDS;
  const e = t.energy;
  for (const p of world.players) {
    if (!p.onIce) {
      p.energy = Math.min(1, p.energy + e.benchRecoverPerSecond * p.fx.recoverScale * dt);
      continue;
    }
    p.stats.timeOnIce += dt;
    if (world.rules !== 'game') continue;
    if (p.role === 'goalie') {
      p.energy = Math.max(0, p.energy - e.goalieDrainPerSecond * dt);
    } else {
      const rate = e.drainPerSecond + (p.sprinting ? e.sprintDrainPerSecond : 0);
      p.energy = Math.max(0, p.energy - rate * p.fx.drainScale * dt);
    }
  }
}

/** Average energy of one of a team's lines. */
export function lineEnergy(world: World, team: 0 | 1, line: 0 | 1): number {
  const members = world.players.filter((p) => p.team === team && p.role === 'skater' && p.line === line);
  return members.length === 0 ? 0 : members.reduce((sum, p) => sum + p.energy, 0) / members.length;
}

/** True while any of the team's skaters is still on his way off. */
export function changing(world: World, team: 0 | 1): boolean {
  return skatersOf(world, team).some((p) => p.leaving);
}

/** Sends the line on the ice to the bench. Each skater is replaced as he reaches the door. */
export function callChange(world: World, team: 0 | 1, t: Tuning): boolean {
  // No line changes while the goalie is pulled: everyone who is on stays on.
  if (changing(world, team) || world.teams[team].pulled) return false;
  const state = world.teams[team];
  state.line = state.line === 0 ? 1 : 0;
  state.changeCooldown = t.bench.changeCooldownSeconds;
  for (const p of skatersOf(world, team)) p.leaving = p.line !== state.line;
  return true;
}

/** Puts a skater on the ice at a spot, standing still and ready. Energy, ratings and stats are kept. */
export function putOnIce(p: Player, x: number, y: number, facing: number): void {
  Object.assign(p, createSkater(x, y), { facing, hand: p.hand });
  p.onIce = true;
  p.leaving = false;
  p.stagger = 0;
  p.pickupLock = 0;
  p.checkCooldown = 0;
  p.passCharge = 0;
  p.passHeld = false;
  p.checkHeld = false;
  p.ai.thinkIn = 0;
  p.ai.shootSteps = 0;
  p.ai.passSteps = 0;
}

/** Skaters who have reached their door step off and their replacements step on. The puck carrier waits. */
export function stepChanges(world: World, t: Tuning, events: SimEvent[]): void {
  for (const p of world.players) {
    if (!p.onIce || !p.leaving || world.puck.carrier === p.id || p.stagger > 0) continue;
    const door = benchDoor(p.team, t);
    if (dist(p.pos, door) > t.bench.doorRadius) continue;
    // The extra skater going off when the goalie returns is not replaced by anyone.
    if (world.teams[p.team].extra === p.id) {
      p.onIce = false;
      p.leaving = false;
      p.sprinting = false;
      p.vel = { x: 0, y: 0 };
      world.teams[p.team].extra = null;
      if (world.puck.passTarget === p.id) world.puck.passTarget = null;
      continue;
    }
    const next = world.players.find(
      (o) => o.team === p.team && o.role === 'skater' && o.line === world.teams[p.team].line && o.slot === p.slot,
    );
    if (!next) continue;
    p.onIce = false;
    p.leaving = false;
    p.sprinting = false;
    p.vel = { x: 0, y: 0 };
    putOnIce(next, door.x, door.y, Math.PI / 2);
    if (world.puck.passTarget === p.id) world.puck.passTarget = null;
    if (world.human && world.human.controlled === p.id) world.human.controlled = next.id;
    events.push({ type: 'change', team: p.team, off: p.id, on: next.id });
  }
}

/**
 * Calls a change for a team when its line is tired, the bench is fresher and the moment is safe:
 * the team has the puck, or the puck is in the other team's half.
 */
export function autoChange(world: World, team: 0 | 1, t: Tuning): boolean {
  const state = world.teams[team];
  if (state.changeCooldown > 0 || changing(world, team)) return false;
  const benchLine = state.line === 0 ? 1 : 0;
  const onIceEnergy = lineEnergy(world, team, state.line);
  if (onIceEnergy >= t.energy.changeBelow) return false;
  if (lineEnergy(world, team, benchLine) < onIceEnergy + t.energy.changeMargin) return false;
  const carrier = carrierOf(world);
  const safe = carrier ? carrier.team === team : attackDir(team) * world.puck.pos.x > 0;
  return safe && callChange(world, team, t);
}

/** At a stoppage: the bench line goes on if it is clearly fresher, with no skating to the bench. Returns the three on the ice. */
export function freshLineOn(world: World, team: 0 | 1, t: Tuning): Player[] {
  const state = world.teams[team];
  // Any stoppage puts a pulled goalie back in his net.
  state.pulled = false;
  state.extra = null;
  for (const p of world.players) if (p.team === team && p.role === 'goalie') p.onIce = true;
  const other = state.line === 0 ? 1 : 0;
  if (lineEnergy(world, team, other) > lineEnergy(world, team, state.line) + t.energy.changeMargin) state.line = other;
  const door = benchDoor(team, t);
  const line: Player[] = [];
  for (const p of world.players) {
    if (p.team !== team || p.role !== 'skater') continue;
    p.leaving = false;
    p.onIce = p.line === state.line;
    if (p.onIce) line.push(p);
    else {
      p.pos = { x: door.x, y: door.y };
      p.vel = { x: 0, y: 0 };
    }
  }
  return line.sort((a, b) => a.slot - b.slot);
}

/** True if this team may have its goalie off right now: late in regulation and behind by a goal or two. */
export function mayPull(world: World, team: 0 | 1, t: Tuning): boolean {
  if (world.rules !== 'game' || world.overtime || world.phase !== 'play' || world.period < t.period.count) return false;
  if (world.clock > t.pull.seconds) return false;
  const behind = (world.score[team === 0 ? 1 : 0] as number) - (world.score[team] as number);
  return behind >= 1 && behind <= t.pull.maxDeficit;
}

/** Takes the goalie off and sends a rested skater on from the bench as a fourth attacker. */
export function pullGoalie(world: World, team: 0 | 1, t: Tuning, events: SimEvent[]): boolean {
  const state = world.teams[team];
  if (state.pulled) return false;
  const goalie = world.players.find((p) => p.team === team && p.role === 'goalie');
  const extra = world.players.find((p) => p.team === team && p.role === 'skater' && !p.onIce && p.slot === 0) ?? world.players.find((p) => p.team === team && p.role === 'skater' && !p.onIce);
  if (!goalie || !extra) return false;
  // Skaters already on their way off stay on after all.
  for (const p of skatersOf(world, team)) p.leaving = false;
  goalie.onIce = false;
  if (world.puck.carrier === goalie.id) world.puck.carrier = null;
  const door = benchDoor(team, t);
  putOnIce(extra, door.x, door.y, Math.PI / 2);
  state.pulled = true;
  state.extra = extra.id;
  events.push({ type: 'pull', team, on: true });
  return true;
}

/** Puts the goalie back in his net during play; the extra skater heads for the bench. */
export function returnGoalie(world: World, team: 0 | 1, t: Tuning, events: SimEvent[]): boolean {
  const state = world.teams[team];
  if (!state.pulled) return false;
  const goalie = world.players.find((p) => p.team === team && p.role === 'goalie');
  if (goalie) {
    goalie.onIce = true;
    goalie.pos = { x: -attackDir(team) * (t.rink.length / 2 - t.rink.goalLineFromEnd) + attackDir(team) * goalie.goalie!.fx.depth, y: 0 };
    goalie.vel = { x: 0, y: 0 };
    goalie.goalie!.seen = [];
    goalie.goalie!.hold = 0;
  }
  const extra = state.extra === null ? undefined : world.players[state.extra];
  if (extra && extra.onIce) extra.leaving = true;
  else state.extra = null;
  state.pulled = false;
  events.push({ type: 'pull', team, on: false });
  return true;
}

/**
 * The goalie pull, once a step. An AI team pulls when it may and it has the puck or the puck is up the ice,
 * and puts him back when it no longer may. The human's team does it on the button.
 */
export function stepPulls(world: World, humanInput: InputFrame, t: Tuning, events: SimEvent[]): void {
  for (const team of [0, 1] as const) {
    const state = world.teams[team];
    const may = mayPull(world, team, t);
    if (state.pulled && !may && world.phase === 'play') {
      returnGoalie(world, team, t, events);
      continue;
    }
    if (world.human && world.human.team === team) {
      const pressed = Boolean(humanInput.pullGoalie) && !state.pullHeld;
      state.pullHeld = Boolean(humanInput.pullGoalie);
      if (pressed && may) {
        if (state.pulled) returnGoalie(world, team, t, events);
        else pullGoalie(world, team, t, events);
      }
      continue;
    }
    if (may && !state.pulled) {
      const carrier = carrierOf(world);
      const safe = carrier ? carrier.team === team : attackDir(team) * world.puck.pos.x > 0;
      if (safe) pullGoalie(world, team, t, events);
    }
  }
}
