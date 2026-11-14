import rules from '../data/offseason.json';
import type { GameResult, PlayerLine } from '../sim/match';
import type { SkaterRatings } from '../sim/ratings';
import type { DressedTeam } from './matchup';
import type { Rng } from './rng';

const q = rules.quick;

/** How many rating points a sharper opponent AI is worth in a quick game: so many per 0.1 of level above the middle. */
export function levelEdge(level: number): number {
  return (level - 0.5) * 10 * q.ratingPointsPerTenthOfLevel;
}

/** Average of every rating of every dressed player, as the simulation would receive them. */
export function dressedStrength(team: DressedTeam): number {
  const all = [...team.setup.skaters, team.setup.goalie].flatMap((r) => Object.values(r));
  return all.reduce((sum, v) => sum + v, 0) / all.length;
}

/** The chance the stronger side wins, calibrated to the balance harness: a 20-point edge wins about 75%. */
export function winChance(edge: number): number {
  return 1 / (1 + 3 ** (-edge / q.ratingPointsFor75Percent));
}

/**
 * Settles a game from team strength, without simulating it, and makes up plausible player stats so that
 * XP, milestones and packs still flow. For multi-season health checks, where simulating every game would
 * take far too long. `levelEdge` is rating points taken off the home side for a sharper opponent AI.
 */
export function quickResult(rng: Rng, home: DressedTeam, away: DressedTeam, levelEdge = 0): GameResult {
  const won = rng.chance(winChance(dressedStrength(home) - dressedStrength(away) - levelEdge));
  const winnerGoals = rng.int(q.minGoals + 1, q.maxWinnerGoals);
  const loserGoals = rng.int(0, winnerGoals - 1);
  const mine = won ? winnerGoals : loserGoals;
  const theirs = won ? loserGoals : winnerGoals;

  const lines: PlayerLine[] = home.players.map((_, i) => ({
    id: i,
    team: 0,
    role: i === 6 ? 'goalie' : 'skater',
    line: i >= 3 && i < 6 ? 1 : 0,
    slot: i === 6 ? 0 : i % 3,
    goals: 0,
    assists: 0,
    shots: 0,
    hits: 0,
    blocks: 0,
    timeOnIce: i === 6 ? q.secondsOnIcePerGame * 2 : q.secondsOnIcePerGame,
    saves: 0,
    goalsAgainst: 0,
  }));
  // Goals go to skaters in proportion to shooting; each goal usually has an assist.
  const shooting = home.setup.skaters.map((r: SkaterRatings) => r.shooting);
  const total = shooting.reduce((s, v) => s + v, 0);
  const pickSkater = (): number => {
    let roll = rng.next() * total;
    for (let i = 0; i < shooting.length; i++) {
      roll -= shooting[i] as number;
      if (roll < 0) return i;
    }
    return 0;
  };
  for (let g = 0; g < mine; g++) {
    const scorer = pickSkater();
    lines[scorer]!.goals += 1;
    const helper = pickSkater();
    if (helper !== scorer) lines[helper]!.assists += 1;
  }
  for (let i = 0; i < 6; i++) {
    lines[i]!.shots = lines[i]!.goals + rng.int(1, Math.max(1, Math.round((q.shotsPerGoal * Math.max(1, mine)) / 6)));
    lines[i]!.hits = rng.int(0, Math.round(q.hitsPerGame / 3));
    lines[i]!.blocks = rng.int(0, Math.round(q.blocksPerGame / 3));
  }
  lines[6]!.saves = theirs * (q.shotsPerGoal - 1) + rng.int(0, 6);
  lines[6]!.goalsAgainst = theirs;

  return { score: [mine, theirs], winner: won ? 0 : 1, finished: true, overtime: false, periods: 3, players: lines, powerupsUsed: [] };
}
