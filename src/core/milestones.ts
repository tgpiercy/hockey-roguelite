import data from '../data/milestones.json';
import type { GameResult } from '../sim/match';
import { MASCOT_ID } from './mascot';
import type { DressedTeam } from './matchup';
import type { Franchise } from './season';

export interface MilestoneInfo {
  id: string;
  name: string;
  type: 'wins' | 'playoffs' | 'champion' | 'playerGoals' | 'shutouts' | 'hatTrick';
  target: number;
}

export const MILESTONES = data as MilestoneInfo[];

/** Where a simulation player sits in his team's dressed list: line 1, line 2, then the goalie. */
const dressedIndex = (p: { role: string; line: number; slot: number }): number => (p.role === 'goalie' ? 6 : p.line * 3 + p.slot);

/**
 * Adds a finished season game to the season's tallies: goals per player, shutouts, and whether anyone
 * scored a hat trick. `home` is the player's dressed team, which says who each simulation player was.
 */
export function tally(f: Franchise, result: GameResult, home: DressedTeam): void {
  const { season } = f;
  const hatTrick = MILESTONES.find((m) => m.type === 'hatTrick')?.target ?? 3;
  for (const line of result.players) {
    if (line.team !== 0 || line.goals === 0) continue;
    const player = home.players[dressedIndex(line)];
    // A mascot's goals count on the scoreboard but not toward anyone's milestones.
    if (!player || player.id === MASCOT_ID) continue;
    season.playerGoals[player.id] = (season.playerGoals[player.id] ?? 0) + line.goals;
    if (line.goals >= hatTrick) season.hatTrick = true;
  }
  if (result.winner === 0 && result.score[1] === 0) season.shutouts += 1;
}

function reached(f: Franchise, m: MilestoneInfo): boolean {
  const { season } = f;
  switch (m.type) {
    case 'wins':
      return season.gamesWon >= m.target;
    case 'playoffs':
      return season.phase === 'playoffs' || season.playoffs !== null;
    case 'champion':
      return season.outcome === 'champion';
    case 'playerGoals':
      return Object.values(season.playerGoals).some((goals) => goals >= m.target);
    case 'shutouts':
      return season.shutouts >= m.target;
    case 'hatTrick':
      return season.hatTrick;
  }
}

/** The milestones reached now that were not reached before. Each is marked done, so it fires once a season. */
export function newMilestones(f: Franchise): MilestoneInfo[] {
  const fresh = MILESTONES.filter((m) => !f.season.milestones.includes(m.id) && reached(f, m));
  for (const m of fresh) f.season.milestones.push(m.id);
  return fresh;
}
