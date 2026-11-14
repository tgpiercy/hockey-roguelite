import { gameResult, type GameResult } from '../../src/sim/match';
import { goalLineX } from '../../src/sim/rink';
import { cloneTuning, type Tuning } from '../../src/sim/tuning';
import { NO_INPUT, type InputFrame, type World } from '../../src/sim/types';
import { createGame, step, STEPS_PER_SECOND, type TeamSetup } from '../../src/sim/world';

/**
 * A stand-in for a simple human player on team 0, for balance checks. It does the obvious thing:
 * chases the puck, carries it straight at the net, winds up a shot at the near corner from the slot,
 * and goes for faceoffs at about a human reaction time. It never passes, checks or changes lines.
 */
export function createNaivePlayer(t: Tuning, reactionSeconds = 0.25): (world: World) => InputFrame {
  let shootSteps = 0;
  return (world: World): InputFrame => {
    const input: InputFrame = { ...NO_INPUT };
    if (world.phase === 'faceoff') {
      const f = world.faceoff;
      input.pass = f !== null && f.dropped && f.sinceDrop >= reactionSeconds && f.sinceDrop < reactionSeconds + 0.1;
      return input;
    }
    const me = world.human ? world.players[world.human.controlled] : undefined;
    if (!me || world.phase !== 'play') return input;

    const mine = world.puck.carrier === me.id;
    const targetX = mine ? goalLineX(t) : world.puck.pos.x;
    const targetY = mine ? (me.pos.y > 0 ? 1 : -1) * (t.net.mouthWidth / 2 - 0.3) : world.puck.pos.y;
    const dx = targetX - me.pos.x;
    const dy = targetY - me.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    input.moveX = dx / d;
    input.moveY = dy / d;

    // In the attacking zone with the puck: hold shoot for a third of a second, then let go.
    if (mine && me.pos.x > goalLineX(t) - 10) {
      shootSteps += 1;
      input.shoot = shootSteps < 20;
      if (shootSteps >= 20) shootSteps = 0;
    } else {
      shootSteps = 0;
    }
    return input;
  };
}

/** Plays one game with the naive player on team 0 against the AI on team 1. */
export function runNaiveGame(seed: string, home: TeamSetup, away: TeamSetup, level = 0.5, tuning?: Tuning): GameResult {
  const t = tuning ?? cloneTuning();
  const world = createGame(t, seed, { teams: [home, away], levels: [null, level], overtimeLimit: 300 });
  const player = createNaivePlayer(t);
  const maxSteps = 30 * 60 * STEPS_PER_SECOND;
  for (let i = 0; i < maxSteps && world.phase !== 'final'; i++) step(world, player(world), t);
  return gameResult(world);
}

export interface NaiveReport {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
}

export function runNaiveSeries(n: number, home: TeamSetup, away: TeamSetup, seed: string, level = 0.5): NaiveReport {
  const report: NaiveReport = { games: n, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
  for (let i = 0; i < n; i++) {
    const result = runNaiveGame(`${seed}-${i}`, home, away, level);
    if (result.winner === 0) report.wins++;
    else if (result.winner === 1) report.losses++;
    else report.ties++;
    report.goalsFor += result.score[0] / n;
    report.goalsAgainst += result.score[1] / n;
  }
  return report;
}
