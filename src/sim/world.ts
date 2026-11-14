import { createRng } from '../core/rng';
import { aiInput, aiLevel, createAiMemory } from './ai';
import { assistedAim } from './aim';
import { stepChecking } from './check';
import { STEP_SECONDS } from './clock';
import { resolveLoosePuck, separateBodies } from './contact';
import { updateControl } from './control';
import { afterGoal, levelFor, startFaceoff, stepBreak, stepFaceoff, tickClock } from './match';
import { makeSave, recordPuck, stepGoalie, stepGoalieHold } from './goalie';
import { autoChange, benchDoor, callChange, currentFx, putOnIce, stepChanges, stepEnergy } from './lines';
import { stepPassing } from './pass';
import { applyModifiers, type Modifier, type PowerupSpec } from './modifiers';
import { stepPowerups } from './powerups';
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
import { attackDir, carrierOf, dist, givePuck, goalieOf, loosePuck, onIce, otherTeam, ownNet, skatersOf } from './team';
import type { Tuning } from './tuning';
import { NO_INPUT, type InputFrame, type Player, type SimEvent, type World } from './types';

export { STEP_SECONDS, STEPS_PER_SECOND } from './clock';

/** A dressed team: 6 skaters (the first three are line 1, the next three line 2) and a goalie. */
export interface TeamSetup {
  skaters: SkaterRatings[];
  goalie: GoalieRatings;
  /** Forward or defenceman for each skater, in the same order. Left out, everyone is a forward. */
  positions?: ('F' | 'D')[];
  /** Lasting modifiers for the whole team: artifacts, boss traits, event effects. */
  modifiers?: Modifier[];
}

export interface WorldOptions {
  /** True (the default): team 0's controlled skater is driven by the input given to step(). False: all AI. */
  human?: boolean;
  /** "full" (the default) is 3 skaters and a goalie a side. "solo" is one skater alone, for skating tests. */
  lineup?: 'full' | 'solo';
  /** AI level per team, 0 to 1. Left out, team 1 uses the tuning's opponent difficulty and team 0 the teammate level. */
  levels?: [number | null, number | null];
  /** Ratings for every skater, or the goalie, of each team. Left out, everyone is rated 70. */
  skaterRatings?: [SkaterRatings, SkaterRatings];
  goalieRatings?: [GoalieRatings, GoalieRatings];
  /** Full rosters with a rating set per player. Takes priority over the two options above. */
  teams?: [TeamSetup, TeamSetup];
  /** Game rules only: overtime ends in a tie after this many seconds. Left out, it runs until someone scores. */
  overtimeLimit?: number;
  /** The human team's loaded powerups: one for each of the two buttons, or null. */
  powerups?: (PowerupSpec | null)[];
}

/** Dressed per team: two lines of three skaters, then the goalie. A team's ids run from team * 7. */
export const SKATERS_PER_LINE = 3;
export const SKATERS_PER_TEAM = 6;
export const PLAYERS_PER_TEAM = 7;

function createPlayer(id: number, team: 0 | 1, role: 'skater' | 'goalie', index: number, options: WorldOptions): Player {
  const skater = options.teams?.[team].skaters[index] ?? options.skaterRatings?.[team] ?? defaultSkaterRatings;
  const goalie = options.teams?.[team].goalie ?? options.goalieRatings?.[team] ?? defaultGoalieRatings;
  const modifiers = options.teams?.[team].modifiers ?? [];
  const fx = applyModifiers(skaterEffects(role === 'skater' ? skater : defaultSkaterRatings), modifiers);
  const goalieFx = applyModifiers(goalieEffects(goalie), modifiers);
  return {
    ...createSkater(0, 0),
    id,
    team,
    role,
    position: role === 'goalie' ? 'G' : (options.teams?.[team].positions?.[index] ?? 'F'),
    fx,
    baseFx: fx,
    goalie: role === 'goalie' ? { fx: goalieFx, baseFx: goalieFx, seen: [], hold: 0, ignorePuck: 0 } : null,
    ai: createAiMemory(),
    passCharge: 0,
    passHeld: false,
    checkHeld: false,
    checkCooldown: 0,
    stagger: 0,
    pickupLock: 0,
    onIce: true,
    line: role === 'skater' && index >= SKATERS_PER_LINE ? 1 : 0,
    slot: role === 'skater' ? index % SKATERS_PER_LINE : 0,
    energy: 1,
    leaving: false,
    stats: { goals: 0, assists: 0, shots: 0, hits: 0, timeOnIce: 0, saves: 0, goalsAgainst: 0 },
  };
}

/** Scrimmage starting spot for a skater, by his place in the line. */
function startSpot(team: 0 | 1, slot: number, t: Tuning): [number, number] {
  const dir = attackDir(team);
  if (slot === 0) return [-dir * Math.abs(t.game.skaterStartX), 0];
  return [-dir * t.game.wingStartX, (slot === 1 ? 1 : -1) * dir * t.game.wingStartY];
}

function createPlayers(t: Tuning, options: WorldOptions): Player[] {
  if (options.lineup === 'solo') {
    const solo = createPlayer(0, 0, 'skater', 0, options);
    solo.pos.x = -Math.abs(t.game.skaterStartX);
    return [solo];
  }
  const players: Player[] = [];
  for (const team of [0, 1] as const) {
    const base = team * PLAYERS_PER_TEAM;
    const door = benchDoor(team, t);
    for (let i = 0; i < SKATERS_PER_TEAM; i++) {
      const p = createPlayer(base + i, team, 'skater', i, options);
      p.onIce = p.line === 0;
      p.pos = { x: door.x, y: door.y };
      players.push(p);
    }
    players.push(createPlayer(base + SKATERS_PER_TEAM, team, 'goalie', 0, options));
  }
  return players;
}

function newTeamState(powerups: (PowerupSpec | null)[]): World['teams'][number] {
  return {
    line: 0,
    changeCooldown: 0,
    changeHeld: false,
    powerups: [powerups[0] ?? null, powerups[1] ?? null],
    powerupsUsed: [],
    powerupHeld: [false, false],
    boosts: [],
  };
}

/** Scrimmage reset: the line on the ice back to its starting spots, goalies home, puck loose at centre. */
function lineUp(world: World, t: Tuning): void {
  for (const p of onIce(world)) {
    if (p.role === 'skater') {
      const [x, y] = world.lineup === 'solo' ? [-Math.abs(t.game.skaterStartX), 0] : startSpot(p.team, p.slot, t);
      putOnIce(p, x, y, p.team === 0 ? 0 : Math.PI);
      p.stamina = 1;
    } else {
      p.pos = { x: ownNet(p.team, t).x + attackDir(p.team) * p.goalie!.fx.depth, y: 0 };
      p.vel = { x: 0, y: 0 };
      p.goalie!.seen = [];
      p.goalie!.hold = 0;
    }
  }
  world.puck = createPuck(0, 0);
  world.phase = 'play';
  world.phaseTime = 0;
  if (world.human) {
    const centre = skatersOf(world, world.human.team).find((p) => p.slot === 0);
    if (centre) world.human.controlled = centre.id;
  }
}

/** A scrimmage: endless play with no clock, faceoffs or line changes. Used for practice and most tests. */
export function createWorld(t: Tuning, seed: number | string, options: WorldOptions = {}): World {
  const world: World = {
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
    rules: 'scrimmage',
    period: 1,
    clock: t.period.seconds,
    overtime: false,
    overtimeLimit: options.overtimeLimit ?? 0,
    faceoff: null,
    teams: [newTeamState(options.human === false ? [] : (options.powerups ?? [])), newTeamState([])],
  };
  lineUp(world, t);
  return world;
}

/** A full game: three periods, faceoffs, line changes, fatigue and overtime. Starts lined up for the opening faceoff. */
export function createGame(t: Tuning, seed: number | string, options: WorldOptions = {}): World {
  const world = createWorld(t, seed, { ...options, lineup: 'full' });
  world.rules = 'game';
  startFaceoff(world, t);
  return world;
}

function goal(world: World, side: -1 | 1, t: Tuning, events: SimEvent[]): void {
  // The net on side -1 is defended by team 0, so team 1 scores there.
  const team: 0 | 1 = side === -1 ? 1 : 0;
  const puck = world.puck;
  world.score[team] += 1;

  // The last of the scoring team to touch it gets the goal; the one or two before him get assists.
  const run = puck.lastTeam === team ? puck.touches : [];
  const scorer = run.length > 0 ? (run[run.length - 1] as number) : null;
  const assists = [...new Set(run.slice(0, -1).reverse())].filter((id) => id !== scorer).slice(0, 2);
  if (scorer !== null) world.players[scorer]!.stats.goals += 1;
  for (const id of assists) world.players[id]!.stats.assists += 1;
  const beaten = goalieOf(world, otherTeam(team));
  if (beaten) beaten.stats.goalsAgainst += 1;

  world.phase = 'goal';
  world.phaseTime = t.game.goalPauseSeconds;
  loosePuck(world);
  puck.shotBy = null;
  events.push({ type: 'goal', side, team, scorer, assists });
}

function stepSkaterBody(p: Player, input: InputFrame, t: Tuning, dt: number): void {
  p.checkCooldown = Math.max(0, p.checkCooldown - dt);
  p.pickupLock = Math.max(0, p.pickupLock - dt);
  const fx = currentFx(p, t);
  if (p.stagger > 0) {
    // Knocked off balance: no control, and he slows quickly.
    p.stagger = Math.max(0, p.stagger - dt);
    const kept = Math.max(0, 1 - t.check.staggerDrag * dt);
    p.vel.x *= kept;
    p.vel.y *= kept;
    stepSkater(p, NO_INPUT, t, dt, fx);
    return;
  }
  stepSkater(p, input, t, dt, fx);
}

/** Game rules: the line-change button, automatic changes, and skaters swapping at the bench door. */
function stepLineChanges(world: World, humanInput: InputFrame, t: Tuning, events: SimEvent[]): void {
  for (const team of [0, 1] as const) {
    const state = world.teams[team];
    state.changeCooldown = Math.max(0, state.changeCooldown - STEP_SECONDS);
    if (world.human && world.human.team === team) {
      if (humanInput.lineChange && !state.changeHeld) callChange(world, team, t);
      state.changeHeld = humanInput.lineChange;
    }
    autoChange(world, team, t);
  }
  stepChanges(world, t, events);
}

/** Advances the whole world by one fixed step and reports what happened. */
export function step(world: World, humanInput: InputFrame, t: Tuning): SimEvent[] {
  const dt = STEP_SECONDS;
  const events: SimEvent[] = [];
  const puck = world.puck;
  const game = world.rules === 'game';
  if (world.phase === 'final') return events;
  world.tick += 1;

  if (world.phase === 'faceoff') {
    stepFaceoff(world, humanInput, t, events);
    return events;
  }
  if (world.phase === 'break') {
    stepBreak(world, t, events);
    return events;
  }
  if (world.phase === 'goal') {
    // Celebration pause: everyone coasts, the puck settles in the net, then the restart.
    const active = onIce(world);
    for (const p of active) if (p.role === 'skater') stepSkaterBody(p, NO_INPUT, t, dt);
    separateBodies(active, t);
    stepLoosePuck(puck, t, dt);
    world.phaseTime -= dt;
    if (world.phaseTime <= 0) {
      if (game) afterGoal(world, t, events);
      else lineUp(world, t);
    }
    return events;
  }

  // Powerups, line changes, who is in control, and what everyone wants to do.
  stepPowerups(world, humanInput, events);
  if (game) stepLineChanges(world, humanInput, t, events);
  updateControl(world, humanInput);
  const active = onIce(world);
  const inputs = active.map((p) => {
    if (p.role === 'goalie') return NO_INPUT;
    if (world.human && world.human.controlled === p.id) return humanInput;
    return aiInput(world, p, t, aiLevel(levelFor(world, p.team, t)));
  });

  // Move.
  active.forEach((p, i) => {
    if (p.role === 'skater') stepSkaterBody(p, inputs[i] as InputFrame, t, dt);
    else stepGoalie(p, world, t, dt);
  });
  separateBodies(active, t);

  // Shoot, pass, check.
  active.forEach((p, i) => {
    if (p.role !== 'skater') return;
    const input = p.stagger > 0 ? NO_INPUT : (inputs[i] as InputFrame);
    const hadPuck = puck.carrier === p.id;
    // The skater the human controls gets aim assist; the AI aims for itself.
    const assist = world.human && world.human.controlled === p.id ? (aim: number) => assistedAim(world, p, aim, t) : undefined;
    const speed = stepShooting(p, hadPuck, puck, input, currentFx(p, t), t, world.rng, dt, assist);
    if (speed !== null) {
      loosePuck(world);
      puck.shotBy = p.id;
      p.pickupLock = t.puck.pickupCooldown;
      p.stats.shots += 1;
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
    // A goalie smothers a puck carried within his reach: nobody walks it into the net past him.
    const keeper = active.find(
      (g) => g.role === 'goalie' && g.team === otherTeam(carrier.team) && dist(g.pos, puck.pos) <= t.goalie.smotherReach,
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
    const goalies = active.filter((g) => g.role === 'goalie' && g.goalie!.ignorePuck <= 0);
    const blockers: Blocker[] = goalies.map((g) => ({ pos: g.pos, radius: g.goalie!.fx.coverRadius }));
    const moved = stepLoosePuck(puck, t, dt, blockers);
    if (moved.hitPost) events.push({ type: 'post' });
    if (moved.blocker >= 0) makeSave(goalies[moved.blocker] as Player, world, t, events);
    else if (moved.scored !== 0) goal(world, moved.scored, t, events);
    else resolveLoosePuck(world, t, events);
  }

  for (const p of active) if (p.role === 'goalie') recordPuck(p, world, t);
  stepEnergy(world, t);
  if (game && world.phase === 'play') tickClock(world, t, events);
  return events;
}
