import { gameResult, type GameResult } from '../../src/sim/match';
import type { GoalieRatings, SkaterRatings } from '../../src/sim/ratings';
import { cloneTuning, type Tuning } from '../../src/sim/tuning';
import { NO_INPUT } from '../../src/sim/types';
import { createGame, step, STEPS_PER_SECOND, type TeamSetup } from '../../src/sim/world';

export interface HarnessOptions {
  /** AI level for both teams, 0 to 1. Default 0.5. */
  level?: number;
  /** Overtime ends in a tie after this many seconds. Default 300. */
  overtimeLimit?: number;
  tuning?: Tuning;
}

/** A team where every skater rating and every goalie rating is the same number. */
export function uniformTeam(rating: number): TeamSetup {
  const skater: SkaterRatings = {
    shooting: rating,
    passing: rating,
    speed: rating,
    checking: rating,
    puckControl: rating,
    stamina: rating,
  };
  const goalie: GoalieRatings = { reflexes: rating, positioning: rating, reboundControl: rating, stamina: rating };
  return { skaters: Array.from({ length: 6 }, () => ({ ...skater })), goalie };
}

/** Plays one all-AI game at full speed, with no drawing, and returns its result. Team 0 is `home`. */
export function runGame(seed: number | string, home: TeamSetup, away: TeamSetup, options: HarnessOptions = {}): GameResult {
  const t = options.tuning ?? cloneTuning();
  const level = options.level ?? 0.5;
  const world = createGame(t, seed, {
    human: false,
    teams: [home, away],
    levels: [level, level],
    overtimeLimit: options.overtimeLimit ?? 300,
  });
  // Regulation plus overtime plus stoppages can never take this long; it only guards against a stuck game.
  const maxSteps = 30 * 60 * STEPS_PER_SECOND;
  for (let i = 0; i < maxSteps && world.phase !== 'final'; i++) step(world, NO_INPUT, t);
  return gameResult(world);
}

export interface SeriesReport {
  games: number;
  /** Wins for team A, team B, and ties (overtime ran out). */
  winsA: number;
  winsB: number;
  ties: number;
  /** Team A's share of wins, counting a tie as half. */
  winRateA: number;
  goalsPerGameA: number;
  goalsPerGameB: number;
  shotsPerGameA: number;
  shotsPerGameB: number;
  /** Saves divided by shots faced, for the goalie of each team and for both together. */
  savePctA: number;
  savePctB: number;
  savePct: number;
  overtimeRate: number;
}

/**
 * Plays n games between team A and team B from one seed. The teams swap ends every game,
 * so neither gains from which net it defends.
 */
export function runSeries(n: number, teamA: TeamSetup, teamB: TeamSetup, seed: string, options: HarnessOptions = {}): SeriesReport {
  const total = { winsA: 0, winsB: 0, ties: 0, goalsA: 0, goalsB: 0, shotsA: 0, shotsB: 0, savesA: 0, savesB: 0, overtime: 0 };
  for (let i = 0; i < n; i++) {
    const aIsHome = i % 2 === 0;
    const result = aIsHome ? runGame(`${seed}-${i}`, teamA, teamB, options) : runGame(`${seed}-${i}`, teamB, teamA, options);
    const a = aIsHome ? 0 : 1;
    const b = aIsHome ? 1 : 0;
    const sum = (team: number, key: 'shots' | 'saves'): number =>
      result.players.filter((p) => p.team === team).reduce((s, p) => s + p[key], 0);
    if (result.winner === a) total.winsA++;
    else if (result.winner === b) total.winsB++;
    else total.ties++;
    total.goalsA += result.score[a] as number;
    total.goalsB += result.score[b] as number;
    total.shotsA += sum(a, 'shots');
    total.shotsB += sum(b, 'shots');
    total.savesA += sum(a, 'saves');
    total.savesB += sum(b, 'saves');
    if (result.overtime) total.overtime++;
  }
  const pct = (saves: number, goalsAgainst: number): number => (saves + goalsAgainst === 0 ? 0 : saves / (saves + goalsAgainst));
  return {
    games: n,
    winsA: total.winsA,
    winsB: total.winsB,
    ties: total.ties,
    winRateA: (total.winsA + total.ties / 2) / n,
    goalsPerGameA: total.goalsA / n,
    goalsPerGameB: total.goalsB / n,
    shotsPerGameA: total.shotsA / n,
    shotsPerGameB: total.shotsB / n,
    savePctA: pct(total.savesA, total.goalsB),
    savePctB: pct(total.savesB, total.goalsA),
    savePct: pct(total.savesA + total.savesB, total.goalsA + total.goalsB),
    overtimeRate: total.overtime / n,
  };
}

/** The report as a few lines of text. */
export function formatReport(label: string, r: SeriesReport): string {
  const f = (v: number, digits = 2): string => v.toFixed(digits);
  return [
    `${label}: ${r.games} games`,
    `  wins A ${r.winsA}, B ${r.winsB}, ties ${r.ties}  ->  A wins ${f(r.winRateA * 100, 1)}%`,
    `  goals per game   A ${f(r.goalsPerGameA)}  B ${f(r.goalsPerGameB)}`,
    `  shots per game   A ${f(r.shotsPerGameA, 1)}  B ${f(r.shotsPerGameB, 1)}`,
    `  save percentage  A ${f(r.savePctA, 3)}  B ${f(r.savePctB, 3)}  both ${f(r.savePct, 3)}`,
    `  overtime in ${f(r.overtimeRate * 100, 1)}% of games`,
  ].join('\n');
}
