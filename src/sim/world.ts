import { newShootout, nextAttempt, readyGoalies, startAttempt, stepShootout } from './shootout';
import { isPlain, plainOf, stepConditions } from './conditions';
import { newVisit, rollMascots, type MascotSetup, type MascotVisit } from './mascot';
import type { Tactics } from './tactics';
import { chargeFraction } from './shot';
import { stepMomentum } from './momentum';
import { stepPulls } from './lines';
import { stepTips } from './tips';
import { createRng } from '../core/rng';
import { aiInput, aiLevel, createAiMemory } from './ai';
import { assistedAim } from './aim';
import { braced, stepChecking } from './check';
import { dekeAngle, wrongFoot } from './deke';
import { stepFake } from './fake';
import { STEP_SECONDS } from './clock';
import { resolveLoosePuck, separateBodies } from './contact';
import { updateControl } from './control';
import { afterGoal, levelFor, startFaceoff, stepBreak, stepFaceoff, tickClock } from './match';
import { makeSave, recordPuck, stepGoalie, stepGoalieHold } from './goalie';
import { autoChange, benchDoor, callChange, currentFx, putOnIce, stepChanges, stepEnergy } from './lines';
import { stepPassing } from './pass';
import { applyModifiers, type Modifier, type PowerupSpec } from './modifiers';
import { stepPowerups } from './powerups';
import { stepTalents } from './talents';
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
import { attackDir, carrierOf, clearAhead, dist, givePuck, goalieOf, loosePuck, onIce, otherTeam, ownNet, skatersOf, humanOf, placeHumans, teamInput } from './team';
import type { Tuning } from './tuning';
import { NO_INPUT, type InputFrame, type MatchRules, type Player, type SimEvent, type World } from './types';

export { STEP_SECONDS, STEPS_PER_SECOND } from './clock';

/** A dressed team: 6 skaters (the first three are line 1, the next three line 2) and a goalie. */
export interface TeamSetup {
  skaters: SkaterRatings[];
  goalie: GoalieRatings;
  /** Forward or defenceman for each skater, in the same order. Left out, everyone is a forward. */
  positions?: ('F' | 'D')[];
  /** Lasting modifiers for the whole team: artifacts, boss traits, event effects. */
  modifiers?: Modifier[];
  /** Lasting modifiers for one skater each, in the same order as `skaters`: gear perks and set bonuses. */
  skaterModifiers?: Modifier[][];
  /** Lasting modifiers for the goalie alone. */
  goalieModifiers?: Modifier[];
  /** Talent ids for one skater each, in the same order as `skaters`. A mascot carries some. */
  skaterTalents?: string[][];
  /** How its AI skaters like to attack: an id from the styles in ai.json. Left out, no leaning. */
  style?: string;
  /** The line (0 or 1) that takes longer shifts: it stays on until it is more tired, and the other comes off sooner. Left out, even shifts. */
  heavyLine?: 0 | 1;
  /** How its AI skaters are told to play. Left out, no leaning. */
  tactics?: Tactics;
  /** Its mascot, who may visit for a period. Left out, it has none. */
  mascot?: MascotSetup;
}

export interface WorldOptions {
  /** True (the default): team 0's controlled skater is driven by the input given to step(). False: all AI. */
  human?: boolean;
  /** A second human, driven by step()'s second input: on team 0 for co-op, on team 1 for versus. Left out, there is none. */
  second?: 0 | 1;
  /** Player one keeps his skater until he presses switch, in place of control following the puck. Left out, it follows. */
  holdSwitch?: boolean;
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
  /** Rules a rink or a mode changes. Left out, the usual game. */
  rules?: MatchRules;
}

/** Dressed per team: two lines of three skaters, then the goalie. A team's ids run from team * 7. */
export const SKATERS_PER_LINE = 3;
export const SKATERS_PER_TEAM = 6;
export const PLAYERS_PER_TEAM = 7;

function createPlayer(id: number, team: 0 | 1, role: 'skater' | 'goalie', index: number, options: WorldOptions): Player {
  const skater = options.teams?.[team].skaters[index] ?? options.skaterRatings?.[team] ?? defaultSkaterRatings;
  const goalie = options.teams?.[team].goalie ?? options.goalieRatings?.[team] ?? defaultGoalieRatings;
  const setup = options.teams?.[team];
  const own = role === 'skater' ? (setup?.skaterModifiers?.[index] ?? []) : (setup?.goalieModifiers ?? []);
  // Only what is always on goes into his abilities; the rest comes and goes during the game (conditions.ts).
  const modifiers = plainOf([...(setup?.modifiers ?? []), ...own]);
  // His own conditional modifiers (a temperament) stay his: the team's are kept on the team.
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
    goalie: role === 'goalie' ? { fx: goalieFx, baseFx: goalieFx, seen: [], hold: 0, ignorePuck: 0, autoSavesLeft: 0, autoSavePeriod: 0, bitten: 0 } : null,
    ai: createAiMemory(),
    passCharge: 0,
    passHeld: false,
    checkHeld: false,
    checkCharge: 0,
    checkClosing: 0,
    checkCooldown: 0,
    stagger: 0,
    pickupLock: 0,
    onIce: true,
    line: role === 'skater' && index >= SKATERS_PER_LINE ? 1 : 0,
    slot: role === 'skater' ? index % SKATERS_PER_LINE : 0,
    energy: 1,
    leaving: false,
    oneTimer: 0,
    oneTimerArmed: false,
    deke: 0,
    dekeCooldown: 0,
    dekeHeld: false,
    knockedDown: false,
    burst: 0,
    fake: 0,
    fakeCooldown: 0,
    fakePass: false,
    conditional: own.filter((m) => !isPlain(m)),
    active: [],
    timed: [],
    talents: role === 'skater' ? [...(setup?.skaterTalents?.[index] ?? [])] : [],
    talentCooldown: {},
    rallyPeriod: 0,
    stats: { goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 0, saves: 0, goalsAgainst: 0 },
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

function visitOf(options: WorldOptions, team: 0 | 1): MascotVisit | null {
  const setup = options.teams?.[team];
  return setup?.mascot ? newVisit(setup.mascot, plainOf(setup.modifiers ?? [])) : null;
}

function newTeamState(powerups: (PowerupSpec | null)[], style: string | null, heavyLine: 0 | 1 | null = null, tactics: Tactics | null = null, mascot: MascotVisit | null = null, modifiers: readonly Modifier[] = []): World['teams'][number] {
  return {
    mascot,
    conditional: modifiers.filter((m) => !isPlain(m)),
    active: [],
    heavyLine,
    tactics,
    line: 0,
    changeCooldown: 0,
    changeHeld: false,
    powerups: [powerups[0] ?? null, powerups[1] ?? null],
    powerupsUsed: [],
    powerupHeld: [false, false],
    powerupWait: [0, 0],
    boosts: [],
    style,
    heat: 0,
    heatedPeriod: 0,
    pulled: false,
    extra: null,
    pullHeld: false,
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
  placeHumans(world);
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
    human: options.human === false ? null : { team: 0, controlled: 0, switchHeld: false, passHeld: false, giveGoOffer: null, giveGo: null, ...(options.holdSwitch ? { hold: true } : {}) },
    human2: options.human === false || options.second === undefined ? null : { team: options.second, controlled: options.second === 0 ? 1 : PLAYERS_PER_TEAM, switchHeld: false, passHeld: false, giveGoOffer: null, giveGo: null },
    levels: options.levels ?? [null, null],
    lineup: options.lineup ?? 'full',
    rules: 'scrimmage',
    match: options.rules ?? {},
    shootout: null,
    period: 1,
    clock: t.period.seconds,
    overtime: false,
    overtimeLimit: options.overtimeLimit ?? 0,
    hornWait: 0,
    periodScores: [],
    lastShot: null,
    goalNotes: [],
    faceoff: null,
    teams: [newTeamState(options.human === false ? [] : (options.powerups ?? []), options.teams?.[0].style ?? null, options.teams?.[0].heavyLine ?? null, options.teams?.[0].tactics ?? null, visitOf(options, 0), options.teams?.[0].modifiers), newTeamState([], options.teams?.[1].style ?? null, options.teams?.[1].heavyLine ?? null, options.teams?.[1].tactics ?? null, visitOf(options, 1), options.teams?.[1].modifiers)],
  };
  lineUp(world, t);
  stepConditions(world, [], t.period.count);
  return world;
}

/** A full game: three periods, faceoffs, line changes, fatigue and overtime. Starts lined up for the opening faceoff. */
export function createGame(t: Tuning, seed: number | string, options: WorldOptions = {}): World {
  const world = createWorld(t, seed, { ...options, lineup: 'full' });
  // A practice is the scrimmage as it stands: it never ends and settles nothing.
  if (world.match.practice) return world;
  if (world.match.shootout) {
    world.rules = 'shootout';
    world.shootout = newShootout();
    readyGoalies(world);
    startAttempt(world, t);
    return world;
  }
  world.rules = 'game';
  // A mascot may be there from the opening faceoff. (The scene reads who is on from the world.)
  rollMascots(world, true, []);
  startFaceoff(world, t);
  return world;
}

/** If the beaten goalie has an automatic save left this period, he makes it: the shot is frozen, not a goal. */
function autoSave(world: World, beaten: Player | null, t: Tuning, events: SimEvent[]): boolean {
  if (!beaten || !beaten.goalie || world.puck.shotBy === null || world.puck.unstoppable) return false;
  const state = beaten.goalie;
  if (state.autoSavePeriod !== world.period) {
    state.autoSavePeriod = world.period;
    state.autoSavesLeft = Math.round(state.fx.periodAutoSaves);
  }
  if (state.autoSavesLeft <= 0) return false;
  state.autoSavesLeft -= 1;
  beaten.stats.saves += 1;
  givePuck(world, beaten);
  state.hold = t.goalie.holdSeconds;
  world.puck.vel = { x: 0, y: 0 };
  events.push({ type: 'save', goalie: beaten.id, frozen: true });
  return true;
}

function goal(world: World, side: -1 | 1, t: Tuning, events: SimEvent[]): void {
  // The net on side -1 is defended by team 0, so team 1 scores there.
  const team: 0 | 1 = side === -1 ? 1 : 0;
  const puck = world.puck;
  if (autoSave(world, goalieOf(world, otherTeam(team)), t, events)) return;
  world.score[team] += 1;

  // The last of the scoring team to touch it gets the goal; the one or two before him get assists.
  const run = puck.lastTeam === team ? puck.touches : [];
  const scorer = run.length > 0 ? (run[run.length - 1] as number) : null;
  const assists = [...new Set(run.slice(0, -1).reverse())].filter((id) => id !== scorer).slice(0, 2);
  if (scorer !== null) world.players[scorer]!.stats.goals += 1;
  for (const id of assists) world.players[id]!.stats.assists += 1;
  const beaten = goalieOf(world, otherTeam(team));
  if (beaten) beaten.stats.goalsAgainst += 1;

  // A give and go in progress is over: the play it was part of has ended.
  for (const human of [world.human, world.human2]) {
    if (!human) continue;
    human.giveGo = null;
    human.giveGoOffer = null;
  }
  world.phase = 'goal';
  world.phaseTime = t.game.goalPauseSeconds;
  loosePuck(world);
  puck.shotBy = null;
  // How it was scored: from the last shot, if it was the scoring team's; otherwise it went in off something.
  const shot = world.lastShot && world.lastShot.team === team ? world.lastShot : null;
  world.goalNotes.push({ team, clear: shot?.clear ?? false, oneTimer: shot?.oneTimer ?? false, metres: shot?.metres ?? null });
  world.lastShot = null;
  events.push({ type: 'goal', side, team, scorer, assists });
}

function stepSkaterBody(p: Player, input: InputFrame, t: Tuning, dt: number, hasPuck = false, breakaway = false): void {
  p.checkCooldown = Math.max(0, p.checkCooldown - dt);
  p.pickupLock = Math.max(0, p.pickupLock - dt);
  p.oneTimer = Math.max(0, p.oneTimer - dt);
  p.deke = Math.max(0, p.deke - dt);
  p.dekeCooldown = Math.max(0, p.dekeCooldown - dt);
  p.burst = Math.max(0, p.burst - dt);
  let fx = currentFx(p, t);
  if (p.burst > 0) fx = { ...fx, topSpeedScale: fx.topSpeedScale * t.boss.burstSpeedScale, accelerationScale: fx.accelerationScale * t.boss.burstSpeedScale };
  // Some gear makes a skater faster with the puck on his stick, or faster still on a breakaway.
  if (hasPuck && fx.carrySpeedScale !== 1) fx = { ...fx, topSpeedScale: fx.topSpeedScale * fx.carrySpeedScale };
  if (hasPuck && breakaway && fx.breakawaySpeedScale !== 1) fx = { ...fx, topSpeedScale: fx.topSpeedScale * fx.breakawaySpeedScale };
  if (p.stagger > 0) {
    // Knocked off balance: no control, and he slows quickly.
    p.stagger = Math.max(0, p.stagger - dt);
    if (p.stagger === 0) p.knockedDown = false;
    const kept = Math.max(0, 1 - t.check.staggerDrag * dt);
    p.vel.x *= kept;
    p.vel.y *= kept;
    stepSkater(p, NO_INPUT, t, dt, fx);
    return;
  }
  stepSkater(p, input, t, dt, fx);
}

/**
 * The deke: with the puck, the switch button is a quick sidestep round the nearest defender (see
 * `dekeAngle`), who is left wrong-footed. For a moment a check thrown at him misses. It costs stamina
 * and has a cooldown.
 */
function stepDeke(world: World, p: Player, hasPuck: boolean, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  const pressed = input.switchPlayer && !p.dekeHeld;
  p.dekeHeld = input.switchPlayer;
  // It still costs stamina, but a tired skater can always deke: a button that sometimes does nothing reads as broken.
  if (!pressed || !hasPuck || p.dekeCooldown > 0) return;
  // Round the nearest defender, to the side asked for or the open one.
  const angle = dekeAngle(world, p, input, t);
  wrongFoot(world, p, t);
  p.vel.x += Math.cos(angle) * t.deke.impulse;
  p.vel.y += Math.sin(angle) * t.deke.impulse;
  p.deke = t.deke.windowSeconds;
  p.dekeCooldown = t.deke.cooldownSeconds;
  p.stamina = Math.max(0, p.stamina - t.deke.staminaCost);
  events.push({ type: 'deke', player: p.id });
}

/** Game rules: the line-change button, automatic changes, and skaters swapping at the bench door. */
function stepLineChanges(world: World, humanInput: InputFrame, t: Tuning, events: SimEvent[], input2: InputFrame): void {
  for (const team of [0, 1] as const) {
    const state = world.teams[team];
    state.changeCooldown = Math.max(0, state.changeCooldown - STEP_SECONDS);
    const asked = teamInput(world, team, humanInput, input2);
    if (asked) {
      if (asked.lineChange && !state.changeHeld && !world.match.oneLine) callChange(world, team, t);
      state.changeHeld = asked.lineChange;
    }
    // On a one-line rink nobody changes: the same three play the whole game.
    if (!world.match.oneLine) autoChange(world, team, t);
  }
  stepChanges(world, t, events);
}

/** Advances the whole world by one fixed step and reports what happened. */
export function step(world: World, humanInput: InputFrame, t: Tuning, input2: InputFrame = NO_INPUT): SimEvent[] {
  const dt = STEP_SECONDS;
  const events: SimEvent[] = [];
  const puck = world.puck;
  const game = world.rules === 'game';
  if (world.phase === 'final') return events;
  world.tick += 1;

  if (world.phase === 'faceoff') {
    stepFaceoff(world, humanInput, t, events, input2);
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
      else if (world.rules === 'shootout') nextAttempt(world, t, events);
      else lineUp(world, t);
    }
    return events;
  }

  // Powerups, line changes, who is in control, and what everyone wants to do.
  stepPowerups(world, humanInput, events, input2);
  if (game) {
    stepLineChanges(world, humanInput, t, events, input2);
    stepPulls(world, humanInput, t, events, input2);
  }
  // In a shootout whoever shoots is set for each attempt; nothing switches.
  if (world.rules !== 'shootout') {
    updateControl(world, humanInput);
    if (world.human2) updateControl(world, input2, world.human2);
  }
  const active = onIce(world);
  const inputs = active.map((p) => {
    if (p.role === 'goalie') return NO_INPUT;
    const human = humanOf(world, p.id);
    if (human) return human === world.human2 ? input2 : humanInput;
    return aiInput(world, p, t, aiLevel(levelFor(world, p.team, t)));
  });

  // Move.
  active.forEach((p, i) => {
    if (p.role === 'skater') {
      const carrying = puck.carrier === p.id;
      stepSkaterBody(p, inputs[i] as InputFrame, t, dt, carrying, carrying && p.fx.breakawaySpeedScale !== 1 && clearAhead(world, p));
      // Down on one knee to block a shot, he can only shuffle.
      if (p.checkCharge >= t.block.braceAfterSeconds && braced(world, p, t)) {
        const speed = Math.hypot(p.vel.x, p.vel.y);
        if (speed > t.block.maxSpeed) {
          p.vel.x *= t.block.maxSpeed / speed;
          p.vel.y *= t.block.maxSpeed / speed;
        }
      }
    }
    else stepGoalie(p, world, t, dt);
  });
  separateBodies(active, t);

  // Shoot, pass, check.
  active.forEach((p, i) => {
    if (p.role !== 'skater') return;
    let input = p.stagger > 0 ? NO_INPUT : (inputs[i] as InputFrame);
    const hadPuck = puck.carrier === p.id;
    stepDeke(world, p, hadPuck, input, t, events);
    input = stepFake(world, p, hadPuck, input, t, events, dt);
    // A person who lets go of shoot a moment before a pass reaches his team is not punished for being early:
    // it counts when the puck arrives, on whichever skater he then controls.
    const person = humanOf(world, p.id);
    if (person) {
      const incoming = puck.carrier === null && puck.passTarget !== null && world.players[puck.passTarget]?.team === person.team;
      if (person.shootDown && !input.shoot && !hadPuck && incoming) person.earlyShoot = t.grace.seconds;
      person.shootDown = input.shoot;
      if ((person.earlyShoot ?? 0) > 0) {
        if (hadPuck && !input.shoot) {
          p.shootHeld = true;
          person.earlyShoot = 0;
        } else person.earlyShoot = Math.max(0, (person.earlyShoot ?? 0) - dt);
      }
    }
    // A pass that arrived with shoot already held goes first-touch: treated as the button being let go now.
    const firstTouch = hadPuck && p.oneTimerArmed && input.shoot;
    p.oneTimerArmed = false;
    if (firstTouch) {
      p.shootHeld = true;
      input = { ...input, shoot: false };
    }
    // The skater the human controls gets aim assist; the AI aims for itself.
    const assist = humanOf(world, p.id) ? (aim: number) => assistedAim(world, p, aim, t) : undefined;
    const fx = currentFx(p, t);
    // A shot let go just after receiving a pass is a one-timer: fully wound up, and harder still with the right gear.
    const oneTimer = p.oneTimer > 0;
    const woundUp = chargeFraction(p.charge, t) >= 1;
    // The human's shots also stray less: part of the aim assist.
    const steady = assist && t.aimAssist.strength > 0 ? { spreadScale: 1 - Math.min(1, t.aimAssist.strength) * (1 - t.aimAssist.spreadScale) } : {};
    const params = oneTimer ? { ...fx, ...steady, oneTimer: fx.oneTimerScale * t.shot.oneTimerPower } : { ...fx, ...steady };
    const speed = stepShooting(p, hadPuck, puck, input, params, t, world.rng, dt, assist);
    if (speed !== null) {
      loosePuck(world);
      puck.shotBy = p.id;
      // The passing chain goes into the shot: the goalie has less time. It is spent either way.
      puck.shotChain = puck.chain;
      puck.chain = 0;
      // A boss trick: the marksman's full wind-up cannot be saved.
      puck.unstoppable = woundUp && fx.unstoppableCharged > 0;
      p.pickupLock = t.puck.pickupCooldown;
      p.stats.shots += 1;
      p.oneTimer = 0;
      const net = ownNet(otherTeam(p.team), t);
      world.lastShot = { team: p.team, clear: clearAhead(world, p), oneTimer: Boolean(oneTimer), metres: Math.hypot(net.x - p.pos.x, net.y - p.pos.y) };
      events.push({ type: 'shot', speed, player: p.id, ...(oneTimer ? { oneTimer } : {}) });
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
    const goalies = puck.unstoppable ? [] : active.filter((g) => g.role === 'goalie' && g.goalie!.ignorePuck <= 0);
    const blockers: Blocker[] = goalies.map((g) => ({ pos: g.pos, radius: g.goalie!.fx.coverRadius }));
    stepTips(world, t, events);
    const moved = stepLoosePuck(puck, t, dt, blockers);
    if (moved.hitPost) events.push({ type: 'post' });
    if (moved.blocker >= 0) makeSave(goalies[moved.blocker] as Player, world, t, events);
    else if (moved.scored !== 0) goal(world, moved.scored, t, events);
    else resolveLoosePuck(world, t, events);
  }

  for (const p of active) if (p.role === 'goalie') recordPuck(p, world, t);
  // A passing chain lapses if the next pass does not come soon enough.
  puck.chainAge += dt;
  if (puck.chain > 0 && puck.chainAge > t.chain.windowSeconds) puck.chain = 0;
  stepEnergy(world, t);
  if (game && world.phase === 'play') tickClock(world, t, events);
  stepTalents(world, t, events, dt);
  stepMomentum(world, t, events, dt);
  stepConditions(world, events, t.period.count);
  if (world.rules === 'shootout') stepShootout(world, t, events);
  return events;
}
