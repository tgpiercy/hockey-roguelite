import data from '../data/ai.json';
import { aiLevel } from './ai';
import { STEP_SECONDS } from './clock';
import { freshLineOn, putOnIce } from './lines';
import { createPuck } from './puck';
import { attackDir, goalieOf, ownNet, skatersOf, humansOn, placeHumans, teamInput } from './team';
import type { Tuning } from './tuning';
import type { InputFrame, Player, PlayerStats, SimEvent, World } from './types';
import { NO_INPUT } from './types';

/** The AI level a team plays at: set on the world, or taken from the tuning. */
export function levelFor(world: World, team: 0 | 1, t: Tuning): number {
  return world.levels[team] ?? (team === 1 ? t.game.opponentDifficulty : data.teammateLevel);
}

/** Lines both teams up at centre and holds the puck for the draw. The fresher line of each team starts. */
export function startFaceoff(world: World, t: Tuning): void {
  const f = t.faceoff;
  world.puck = createPuck(0, 0);

  for (const team of [0, 1] as const) {
    const dir = attackDir(team);
    const facing = team === 0 ? 0 : Math.PI;
    const line = freshLineOn(world, team, t);
    const spots: [number, number][] = [
      [-dir * f.centreX, 0],
      [-dir * f.wingX, dir * f.wingY],
      [-dir * f.wingX, -dir * f.wingY],
    ];
    line.forEach((p, i) => {
      const spot = spots[i] ?? spots[0]!;
      putOnIce(p, spot[0], spot[1], facing);
    });
    const goalie = goalieOf(world, team);
    if (goalie) {
      const net = ownNet(team, t);
      goalie.pos = { x: net.x + dir * goalie.goalie!.fx.depth, y: 0 };
      goalie.vel = { x: 0, y: 0 };
      goalie.goalie!.seen = [];
      goalie.goalie!.hold = 0;
    }
    world.teams[team].changeCooldown = 0;
  }
  placeHumans(world);

  const jitter = (): number => world.rng.range(0, data.faceoffJitterSeconds);
  world.phase = 'faceoff';
  world.faceoff = {
    dropIn: world.rng.range(f.minWaitSeconds, f.maxWaitSeconds),
    dropped: false,
    sinceDrop: 0,
    lock: [0, 0],
    aiDelay: [
      aiLevel(levelFor(world, 0, t)).faceoffSeconds + jitter(),
      aiLevel(levelFor(world, 1, t)).faceoffSeconds + jitter(),
    ],
    held: [false, false],
  };
}

/**
 * One step of a faceoff. Nobody moves. After the drop, the first centre to press the draw button wins
 * and the puck goes back to one of his wingers. Pressing before the drop locks that centre out for a moment.
 * If nobody goes for it in time, the puck lies loose.
 */
export function stepFaceoff(world: World, humanInput: InputFrame, t: Tuning, events: SimEvent[], input2: InputFrame = NO_INPUT): void {
  const f = world.faceoff;
  if (!f) return;
  const dt = STEP_SECONDS;

  // Is each centre pressing right now? A human presses the pass button; the AI goes at its reaction time.
  const pressing = ([0, 1] as const).map((team) => {
    const asked = teamInput(world, team, humanInput, input2);
    return asked ? asked.pass : f.dropped && f.sinceDrop >= f.aiDelay[team];
  });
  const fresh = ([0, 1] as const).map((team) => (pressing[team] as boolean) && !f.held[team]);
  f.held = [pressing[0] as boolean, pressing[1] as boolean];

  if (!f.dropped) {
    for (const team of [0, 1] as const) if (fresh[team]) f.lock[team] = t.faceoff.falseStartLockSeconds;
    f.dropIn -= dt;
    if (f.dropIn <= 0) f.dropped = true;
    return;
  }

  f.sinceDrop += dt;
  const winners = ([0, 1] as const).filter((team) => fresh[team] && f.lock[team] <= 0);
  for (const team of [0, 1] as const) f.lock[team] = Math.max(0, f.lock[team] - dt);

  if (winners.length > 0) {
    const winner = winners.length === 2 ? (world.rng.chance(0.5) ? 0 : 1) : (winners[0] as 0 | 1);
    const wingers = skatersOf(world, winner).filter((p) => p.slot !== 0);
    const target = wingers.length > 0 ? world.rng.pick(wingers) : null;
    const puck = world.puck;
    if (target) {
      const angle = Math.atan2(target.pos.y - puck.pos.y, target.pos.x - puck.pos.x);
      puck.vel = { x: Math.cos(angle) * t.faceoff.drawSpeed, y: Math.sin(angle) * t.faceoff.drawSpeed };
      puck.passTarget = target.id;
    }
    const centre = skatersOf(world, winner).find((p) => p.slot === 0);
    puck.lastTeam = winner;
    puck.touches = centre ? [centre.id] : [];
    // Control goes with the draw, as with any pass.
    const drawn = humansOn(world, winner);
    if (target && drawn.length === 1) (drawn[0] as { controlled: number }).controlled = target.id;
    world.phase = 'play';
    world.faceoff = null;
    events.push({ type: 'faceoff', winner });
  } else if (f.sinceDrop >= t.faceoff.windowSeconds) {
    world.phase = 'play';
    world.faceoff = null;
    events.push({ type: 'faceoff', winner: null });
  }
}

/** Runs the period clock during play. Returns true if the period (or the game) just ended. */
export function tickClock(world: World, t: Tuning, events: SimEvent[]): boolean {
  const dt = STEP_SECONDS;
  if (world.overtime) {
    world.clock += dt;
    if (world.overtimeLimit > 0 && world.clock >= world.overtimeLimit) {
      world.phase = 'final';
      events.push({ type: 'final' });
      return true;
    }
    return false;
  }
  world.clock -= dt;
  if (world.clock > 1e-9) return false;
  world.clock = 0;

  if (world.period < t.period.count) {
    world.phase = 'break';
    world.phaseTime = t.period.breakSeconds;
    return true;
  }
  if (world.score[0] === world.score[1]) {
    world.overtime = true;
    world.phase = 'break';
    world.phaseTime = t.period.breakSeconds;
    return true;
  }
  world.phase = 'final';
  events.push({ type: 'final' });
  return true;
}

/** Between periods: a short pause, then the next period starts with a faceoff. */
export function stepBreak(world: World, t: Tuning, events: SimEvent[]): void {
  world.phaseTime -= STEP_SECONDS;
  if (world.phaseTime > 0) return;
  world.period += 1;
  world.clock = world.overtime ? 0 : t.period.seconds;
  events.push({ type: 'period', period: world.period });
  startFaceoff(world, t);
}

/** After the goal celebration: overtime goals end the game, otherwise back to centre for a faceoff. */
export function afterGoal(world: World, t: Tuning, events: SimEvent[]): void {
  if (world.overtime) {
    world.phase = 'final';
    events.push({ type: 'final' });
    return;
  }
  startFaceoff(world, t);
}

export interface PlayerLine extends PlayerStats {
  id: number;
  team: 0 | 1;
  role: 'skater' | 'goalie';
  line: 0 | 1;
  slot: number;
}

/** Everything later phases need to know about a finished (or running) game. */
export interface GameResult {
  score: [number, number];
  /** The winning team, or null for a tie (only possible when overtime has a time limit) or an unfinished game. */
  winner: 0 | 1 | null;
  finished: boolean;
  overtime: boolean;
  periods: number;
  players: PlayerLine[];
  /** Ids of the powerups team 0 used, in order. */
  powerupsUsed: string[];
  /** True when the game was given up before the end: the winner is the other team, whatever the score. */
  forfeit?: boolean;
}

/** The result of a game `team` gave up: everything that happened stands, and the other team wins. */
export function forfeitResult(result: GameResult, team: 0 | 1): GameResult {
  return { ...result, finished: true, winner: team === 0 ? 1 : 0, forfeit: true };
}

export function gameResult(world: World): GameResult {
  const finished = world.phase === 'final';
  const [home, away] = world.score;
  return {
    score: [home, away],
    winner: !finished || home === away ? null : home > away ? 0 : 1,
    finished,
    overtime: world.overtime,
    periods: world.period,
    players: world.players.map((p: Player) => ({ id: p.id, team: p.team, role: p.role, line: p.line, slot: p.slot, ...p.stats })),
    powerupsUsed: [...world.teams[0].powerupsUsed],
  };
}
