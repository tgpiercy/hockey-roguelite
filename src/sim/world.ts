import { createRng } from '../core/rng';
import data from '../data/ai.json';
import { aiInput, aiLevel, createAiMemory } from './ai';
import { stepChecking } from './check';
import { STEP_SECONDS } from './clock';
import { resolveLoosePuck, separateBodies } from './contact';
import { updateControl } from './control';
import { makeSave, recordPuck, stepGoalie, stepGoalieHold } from './goalie';
import { stepPassing } from './pass';
import { createPuck, stepCarriedPuck, stepLoosePuck, type Blocker } from './puck';
import {
  defaultGoalieRatings,
  defaultSkaterRatings,
  goalieEffects,
  skaterEffects,
  type GoalieRatings,
  type SkaterRatings,
} from './ratings';
import { stepShooting } from './shot';
import { createSkater, stepSkater } from './skater';
import { attackDir, carrierOf, dist, givePuck, loosePuck, otherTeam, ownNet } from './team';
import type { Tuning } from './tuning';
import { NO_INPUT, type InputFrame, type Player, type SimEvent, type World } from './types';

export { STEP_SECONDS, STEPS_PER_SECOND } from './clock';

export interface WorldOptions {
  /** True (the default): team 0's controlled skater is driven by the input given to step(). False: all AI. */
  human?: boolean;
  /** "full" (the default) is 3 skaters and a goalie a side. "solo" is one skater alone, for skating tests. */
  lineup?: 'full' | 'solo';
  /** AI level per team, 0 to 1. Left out, team 1 uses the tuning's opponent difficulty and team 0 the teammate level. */
  levels?: [number | null, number | null];
  /** Ratings per team. Left out, everyone is rated 70. */
  skaterRatings?: [SkaterRatings, SkaterRatings];
  goalieRatings?: [GoalieRatings, GoalieRatings];
}

function createPlayer(id: number, team: 0 | 1, role: 'skater' | 'goalie', x: number, y: number, options: WorldOptions): Player {
  const body = createSkater(x, y);
  body.facing = team === 0 ? 0 : Math.PI;
  return {
    ...body,
    id,
    team,
    role,
    fx: skaterEffects(options.skaterRatings?.[team] ?? defaultSkaterRatings),
    goalie:
      role === 'goalie'
        ? { fx: goalieEffects(options.goalieRatings?.[team] ?? defaultGoalieRatings), seen: [], hold: 0, ignorePuck: 0 }
        : null,
    ai: createAiMemory(),
    passCharge: 0,
    passHeld: false,
    checkHeld: false,
    checkCooldown: 0,
    stagger: 0,
    pickupLock: 0,
  };
}

/** Three skaters and a goalie. In a full world a team's ids run from team * 4: three skaters, then the goalie. */
export const PLAYERS_PER_TEAM = 4;

function createPlayers(t: Tuning, options: WorldOptions): Player[] {
  const centreX = Math.abs(t.game.skaterStartX);
  if (options.lineup === 'solo') return [createPlayer(0, 0, 'skater', -centreX, 0, options)];
  const players: Player[] = [];
  for (const team of [0, 1] as const) {
    const dir = attackDir(team);
    const net = ownNet(team, t);
    const base = team * PLAYERS_PER_TEAM;
    players.push(createPlayer(base, team, 'skater', -dir * centreX, 0, options));
    players.push(createPlayer(base + 1, team, 'skater', -dir * t.game.wingStartX, dir * t.game.wingStartY, options));
    players.push(createPlayer(base + 2, team, 'skater', -dir * t.game.wingStartX, -dir * t.game.wingStartY, options));
    const goalie = createPlayer(base + 3, team, 'goalie', 0, 0, options);
    goalie.pos.x = net.x + dir * goalie.goalie!.fx.depth;
    players.push(goalie);
  }
  return players;
}

export function createWorld(t: Tuning, seed: number | string, options: WorldOptions = {}): World {
  return {
    tick: 0,
    players: createPlayers(t, options),
    puck: createPuck(0, 0),
    score: [0, 0],
    phase: 'play',
    phaseTime: 0,
    rng: createRng(seed),
    human: options.human === false ? null : { team: 0, controlled: 0, switchHeld: false },
    levels: options.levels ?? [null, null],
    lineup: options.lineup ?? 'full',
  };
}

/** Everyone back to their starting spots, puck loose at centre. Ratings and score are kept. */
function faceOff(world: World, t: Tuning): void {
  const fresh = createPlayers(t, { lineup: world.lineup });
  world.players.forEach((p, i) => {
    const start = fresh[i] as Player;
    const goalie = p.goalie ? { ...start.goalie!, fx: p.goalie.fx } : null;
    Object.assign(p, start, { fx: p.fx, goalie });
    if (goalie) p.pos.x = ownNet(p.team, t).x + attackDir(p.team) * goalie.fx.depth;
  });
  world.puck = createPuck(0, 0);
  world.phase = 'play';
  world.phaseTime = 0;
  if (world.human) world.human.controlled = world.human.team * PLAYERS_PER_TEAM;
}

function goal(world: World, side: -1 | 1, t: Tuning, events: SimEvent[]): void {
  // The net on side -1 is defended by team 0, so team 1 scores there.
  const team: 0 | 1 = side === -1 ? 1 : 0;
  world.score[team] += 1;
  world.phase = 'goal';
  world.phaseTime = t.game.goalPauseSeconds;
  loosePuck(world);
  events.push({ type: 'goal', side, team });
}

function levelFor(world: World, team: 0 | 1, t: Tuning): number {
  return world.levels[team] ?? (team === 1 ? t.game.opponentDifficulty : data.teammateLevel);
}

function stepSkaterBody(p: Player, input: InputFrame, t: Tuning, dt: number): void {
  p.checkCooldown = Math.max(0, p.checkCooldown - dt);
  p.pickupLock = Math.max(0, p.pickupLock - dt);
  if (p.stagger > 0) {
    // Knocked off balance: no control, and he slows quickly.
    p.stagger = Math.max(0, p.stagger - dt);
    const kept = Math.max(0, 1 - t.check.staggerDrag * dt);
    p.vel.x *= kept;
    p.vel.y *= kept;
    stepSkater(p, NO_INPUT, t, dt, p.fx);
    return;
  }
  stepSkater(p, input, t, dt, p.fx);
}

/** Advances the whole world by one fixed step and reports what happened. */
export function step(world: World, humanInput: InputFrame, t: Tuning): SimEvent[] {
  const dt = STEP_SECONDS;
  const events: SimEvent[] = [];
  const puck = world.puck;
  world.tick += 1;

  if (world.phase === 'goal') {
    // Celebration pause: everyone coasts, the puck settles in the net, then the reset.
    for (const p of world.players) if (p.role === 'skater') stepSkaterBody(p, NO_INPUT, t, dt);
    separateBodies(world.players, t);
    stepLoosePuck(puck, t, dt);
    world.phaseTime -= dt;
    if (world.phaseTime <= 0) faceOff(world, t);
    return events;
  }

  // Who is in control, and what everyone wants to do.
  updateControl(world, humanInput);
  const inputs = world.players.map((p) => {
    if (p.role === 'goalie') return NO_INPUT;
    if (world.human && world.human.controlled === p.id) return humanInput;
    return aiInput(world, p, t, aiLevel(levelFor(world, p.team, t)));
  });

  // Move.
  world.players.forEach((p, i) => {
    if (p.role === 'skater') stepSkaterBody(p, inputs[i] as InputFrame, t, dt);
    else stepGoalie(p, world, t, dt);
  });
  separateBodies(world.players, t);

  // Shoot, pass, check.
  world.players.forEach((p, i) => {
    if (p.role !== 'skater') return;
    const input = p.stagger > 0 ? NO_INPUT : (inputs[i] as InputFrame);
    const hadPuck = puck.carrier === p.id;
    const speed = stepShooting(p, hadPuck, puck, input, p.fx, t, world.rng, dt);
    if (speed !== null) {
      loosePuck(world);
      p.pickupLock = t.puck.pickupCooldown;
      events.push({ type: 'shot', speed, player: p.id });
    }
    stepPassing(world, p, input, t, dt, events);
    stepChecking(world, p, input, t, events);
  });

  // The puck.
  puck.air = Math.max(0, puck.air - dt);
  const carrier = carrierOf(world);
  if (carrier && carrier.role === 'goalie') {
    stepGoalieHold(carrier, world, t, dt, events);
  } else if (carrier) {
    const scored = stepCarriedPuck(puck, carrier, t, dt);
    // A goalie smothers a puck carried into him.
    const keeper = world.players.find(
      (g) => g.role === 'goalie' && g.team === otherTeam(carrier.team) && dist(g.pos, puck.pos) <= g.goalie!.fx.coverRadius,
    );
    if (keeper) {
      givePuck(world, keeper);
      keeper.goalie!.hold = t.goalie.holdSeconds;
      carrier.pickupLock = t.check.pickupLockSeconds;
      events.push({ type: 'save', goalie: keeper.id, frozen: true });
    } else if (scored !== 0) {
      goal(world, scored, t, events);
    }
  } else {
    const goalies = world.players.filter((g) => g.role === 'goalie' && g.goalie!.ignorePuck <= 0);
    const blockers: Blocker[] = goalies.map((g) => ({ pos: g.pos, radius: g.goalie!.fx.coverRadius }));
    const moved = stepLoosePuck(puck, t, dt, blockers);
    if (moved.hitPost) events.push({ type: 'post' });
    if (moved.blocker >= 0) makeSave(goalies[moved.blocker] as Player, world, t, events);
    else if (moved.scored !== 0) goal(world, moved.scored, t, events);
    else resolveLoosePuck(world, t, events);
  }

  for (const p of world.players) if (p.role === 'goalie') recordPuck(p, world);
  return events;
}
