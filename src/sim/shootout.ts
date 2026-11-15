import { STEP_SECONDS } from './clock';
import { applyModifiers, type Modifier } from './modifiers';
import { putOnIce } from './lines';
import { shotInFlight } from './match';
import { createPuck } from './puck';
import { attackDir, givePuck, ownNet } from './team';
import type { Tuning } from './tuning';
import type { Player, SimEvent, World } from './types';

/**
 * A shootout: the teams take turns, one skater against the other team's goalie, starting from centre
 * with a time limit. After the set number of rounds each the higher score wins; level, it goes on a
 * pair at a time until one team scores and the other does not.
 */

export interface ShootoutRules {
  rounds: number;
  attemptSeconds: number;
  pauseSeconds: number;
  /** What a goalie gains for a shootout: alone against a breakaway he needs it. */
  goalie?: Modifier[];
}

export interface ShootoutState {
  /** Whose turn it is. */
  shooting: 0 | 1;
  /** Attempts each team has finished. */
  taken: [number, number];
  /** Seconds left in this attempt. */
  left: number;
  /** True once the shooter has let a shot go. */
  shot: boolean;
  /** How the attempt just finished ended, for the screen. */
  last: 'goal' | 'miss' | null;
}

export function newShootout(): ShootoutState {
  return { shooting: 0, taken: [0, 0], left: 0, shot: false, last: null };
}

/** Once, before the first attempt: the goalies get their shootout edge. */
export function readyGoalies(world: World): void {
  const edge = world.match.shootout?.goalie ?? [];
  for (const p of world.players) {
    if (!p.goalie) continue;
    p.goalie.baseFx = applyModifiers(p.goalie.baseFx, edge);
    p.goalie.fx = applyModifiers(p.goalie.fx, edge);
  }
}

/** The skater who takes a team's next attempt: its six skaters take turns in order. */
export function shooterOf(world: World, team: 0 | 1): Player {
  const skaters = world.players.filter((p) => p.team === team && p.role === 'skater');
  return skaters[(world.shootout?.taken[team] ?? 0) % skaters.length] as Player;
}

/** Sets the ice for the next attempt: the shooter at centre with the puck, the other goalie in his net, nobody else. */
export function startAttempt(world: World, t: Tuning): void {
  const state = world.shootout;
  const rules = world.match.shootout;
  if (!state || !rules) return;
  const team = state.shooting;
  const other = team === 0 ? 1 : 0;
  for (const p of world.players) {
    p.onIce = false;
    p.leaving = false;
    p.stagger = 0;
    p.knockedDown = false;
    p.charge = 0;
  }
  const shooter = shooterOf(world, team);
  const dir = attackDir(team);
  putOnIce(shooter, 0, 0, dir > 0 ? 0 : Math.PI);
  shooter.energy = 1;
  shooter.stamina = 1;
  // (Looked up directly: everyone has just been taken off the ice.)
  const goalie = world.players.find((p) => p.team === other && p.role === 'goalie');
  if (goalie && goalie.goalie) {
    goalie.onIce = true;
    goalie.pos = { x: ownNet(other, t).x + attackDir(other) * goalie.goalie.fx.depth, y: 0 };
    goalie.vel = { x: 0, y: 0 };
    goalie.goalie.seen = [];
    goalie.goalie.hold = 0;
    goalie.goalie.bitten = 0;
  }
  world.puck = createPuck(0, 0);
  givePuck(world, shooter);
  // Whoever plays for the shooting team has the shooter; the other side watches.
  // With two on the team they take the turns in order; the one whose turn it is not controls nobody.
  const shooters = [world.human, world.human2].filter((h) => h !== null && h.team === team);
  shooters.forEach((human, i) => {
    if (human) human.controlled = i === state.taken[team] % shooters.length ? shooter.id : -1;
  });
  for (const side of world.teams) {
    side.heat = 0;
    side.boosts = [];
  }
  state.left = rules.attemptSeconds;
  state.shot = false;
  world.clock = state.left;
  world.phase = 'play';
  world.phaseTime = 0;
}

/** After each step of play: runs the attempt's clock and ends it when the shot is over or the time is up. */
export function stepShootout(world: World, t: Tuning, events: SimEvent[]): void {
  const state = world.shootout;
  const rules = world.match.shootout;
  if (!state || !rules) return;
  if (world.phase === 'goal') {
    // The simulation has just counted a goal: the usual pause follows, then the next attempt.
    if (events.some((e) => e.type === 'goal')) {
      state.last = 'goal';
      world.phaseTime = rules.pauseSeconds;
    }
    return;
  }
  if (world.phase !== 'play') return;
  state.left = Math.max(0, state.left - STEP_SECONDS);
  world.clock = state.left;
  const puck = world.puck;
  if (puck.shotBy !== null) state.shot = true;
  const flying = shotInFlight(world, t);
  const shooter = shooterOf(world, state.shooting);
  const saved = events.some((e) => e.type === 'save') || (puck.carrier !== null && puck.carrier !== shooter.id);
  // One shot only: once it has been saved, has missed or has died, the attempt is over. So is one that runs out of time.
  const spent = state.shot && !flying && puck.carrier !== shooter.id;
  const timeUp = state.left <= 0 && !flying;
  if (saved || spent || timeUp) {
    state.last = 'miss';
    world.phase = 'goal';
    world.phaseTime = rules.pauseSeconds;
    events.push({ type: 'shootout', team: state.shooting, scored: false });
  }
}

/** After the pause: count the attempt, see whether it is settled, and set up the next one. */
export function nextAttempt(world: World, t: Tuning, events: SimEvent[]): void {
  const state = world.shootout;
  const rules = world.match.shootout;
  if (!state || !rules) return;
  state.taken[state.shooting] += 1;
  const [a, b] = state.taken;
  const [home, away] = world.score;
  // Settled once both have had the same number of turns, at least the set rounds, and the scores differ.
  if (a === b && a >= rules.rounds && home !== away) {
    world.phase = 'final';
    events.push({ type: 'final' });
    return;
  }
  state.shooting = state.shooting === 0 ? 1 : 0;
  startAttempt(world, t);
}
