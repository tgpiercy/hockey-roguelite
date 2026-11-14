import data from '../data/stars.json';
import type { GameResult, PlayerLine } from '../sim/match';

/** One of the three stars of a game: who he was, and the line of stats that earned it. */
export interface Star {
  team: 0 | 1;
  /** His place in his team's dressed list: line 1, line 2, then the goalie (6). */
  index: number;
  score: number;
  /** His night in a few words: "2 goals, 1 assist" or "24 saves, shutout". */
  line: string;
}

const dressedIndex = (p: PlayerLine): number => (p.role === 'goalie' ? 6 : p.line * 3 + p.slot);
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** How good a night a player had, as one number. */
function starScore(p: PlayerLine, result: GameResult): number {
  const won = result.winner === p.team;
  const bonus = won ? data.winningTeam : 0;
  if (p.role === 'goalie') {
    // A goalie who never faced a shot did nothing to earn a star.
    if (p.saves === 0) return 0;
    const shutout = p.goalsAgainst === 0 && p.saves > 0;
    return p.saves * data.save - p.goalsAgainst * data.goalAgainst + (shutout ? data.shutout : 0) + (won ? data.goalieWin : 0) + bonus;
  }
  const did = p.goals * data.goal + p.assists * data.assist + p.shots * data.shot + p.hits * data.hit + p.blocks * data.block;
  // A skater who did nothing at all is not a star just because his team won.
  return did === 0 ? 0 : did + bonus;
}

function starLine(p: PlayerLine): string {
  if (p.role === 'goalie') return p.goalsAgainst === 0 ? `${count(p.saves, 'save')}, shutout` : `${count(p.saves, 'save')}, ${p.goalsAgainst} against`;
  const parts: string[] = [];
  if (p.goals > 0) parts.push(count(p.goals, 'goal'));
  if (p.assists > 0) parts.push(count(p.assists, 'assist'));
  if (parts.length === 0 && p.shots > 0) parts.push(count(p.shots, 'shot'));
  if (p.hits > 0 && parts.length < 2) parts.push(count(p.hits, 'hit'));
  if (p.blocks > 0 && parts.length < 2) parts.push(count(p.blocks, 'block'));
  return parts.join(', ');
}

/**
 * The three stars of a finished game, best first: the players with the best nights by their stats,
 * with a little extra for being on the winning side. Fewer than three if fewer earned one.
 */
export function threeStars(result: GameResult): Star[] {
  if (!result.finished) return [];
  return result.players
    .map((p) => ({ team: p.team, index: dressedIndex(p), score: starScore(p, result), line: starLine(p) }))
    .filter((star) => star.score > 0)
    .sort((a, b) => b.score - a.score || a.team - b.team || a.index - b.index)
    .slice(0, data.count);
}
