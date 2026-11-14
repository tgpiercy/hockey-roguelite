import weights from '../data/overallWeights.json';
import data from '../data/xp.json';
import type { GameResult } from '../sim/match';
import type { DressedTeam } from './matchup';
import { gradeOf, overallOf, type PlayerRecord } from './player';

/** XP needed to go from this level to the next. */
export function xpForLevel(level: number): number {
  return data.levelBase + data.levelGrowth * (level - 1);
}

/** Where a simulation player sits in his team's dressed list: line 1, line 2, then the goalie. */
const dressedIndex = (p: { role: string; line: number; slot: number }): number => (p.role === 'goalie' ? 6 : p.line * 3 + p.slot);

/**
 * XP each dressed player of team 0 earned in a game, by league player id.
 * Skaters: ice time, goals, assists, shots, hits and blocked shots. Goalies: saves, and a bonus for a win.
 */
export function gameXp(result: GameResult, home: DressedTeam): Record<string, number> {
  const out: Record<string, number> = {};
  if (!result.finished) return out;
  for (const line of result.players) {
    if (line.team !== 0) continue;
    const player = home.players[dressedIndex(line)];
    if (!player) continue;
    const xp =
      line.role === 'goalie'
        ? line.saves * data.save + (result.winner === 0 ? data.goalieWin : 0)
        : line.timeOnIce * data.perSecondOnIce +
          line.goals * data.goal +
          line.assists * data.assist +
          line.shots * data.shot +
          line.hits * data.hit +
          line.blocks * data.block;
    out[player.id] = (out[player.id] ?? 0) + xp;
  }
  return out;
}

/** What a player who did not dress earns: a share of the average dressed skater's XP. */
export function homeShare(earned: Record<string, number>, home: DressedTeam): number {
  const skaters = home.players.filter((p) => p.position !== 'G');
  if (skaters.length === 0) return 0;
  const total = skaters.reduce((sum, p) => sum + (earned[p.id] ?? 0), 0);
  return (total / skaters.length) * data.homeShare;
}

/** Works out overall and grade again after a player's ratings change. His cap hit is left alone: it is set by his contract. */
export function regrade(player: PlayerRecord): void {
  player.overall = overallOf(player.position, player.ratings);
  player.grade = gradeOf(player.overall);
}

/**
 * Spends rating points on a player, one at a time, each on the rating his position values most
 * relative to where it stands now. Stops when his overall reaches his hidden potential.
 * Returns how many points were actually spent.
 */
export function placePoints(player: PlayerRecord, points: number): number {
  const w = weights[player.position] as Record<string, number>;
  const ratings = player.ratings as unknown as Record<string, number>;
  let spent = 0;
  for (let i = 0; i < points; i++) {
    if (overallOf(player.position, player.ratings) >= player.potential) break;
    let best: string | null = null;
    let bestScore = -1;
    for (const key of Object.keys(w)) {
      const value = ratings[key] ?? 0;
      if (value >= data.maxRating) continue;
      const score = (w[key] as number) / (value + 1);
      if (score > bestScore) {
        best = key;
        bestScore = score;
      }
    }
    if (best === null) break;
    ratings[best] = (ratings[best] ?? 0) + 1;
    spent += 1;
  }
  regrade(player);
  return spent;
}

/** A player's XP gain after the bonus for being in his growth years. */
export function withAgeBonus(player: PlayerRecord, xp: number): number {
  return player.age <= data.youngMaxAge ? xp * data.youngBonus : xp;
}

/**
 * Adds XP to a player. Every level reached gives rating points, placed automatically.
 * Returns how many levels he gained.
 */
export function addXp(player: PlayerRecord, xp: number): number {
  player.xp += xp;
  let gained = 0;
  while (player.xp >= xpForLevel(player.level)) {
    player.xp -= xpForLevel(player.level);
    player.level += 1;
    gained += 1;
    placePoints(player, data.pointsPerLevel);
  }
  return gained;
}
