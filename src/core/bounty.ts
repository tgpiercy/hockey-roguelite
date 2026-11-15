import data from '../data/bounties.json';
import type { GameResult } from '../sim/match';
import type { DressedTeam } from './matchup';
import { createRng } from './rng';

/**
 * A bounty: one optional goal for a game you play, shown before it starts. Meeting it pays extra Pucks;
 * missing it costs nothing. Each is a data entry, judged from the result of the game alone.
 */
export interface BountyInfo {
  id: string;
  text: string;
  pucks: number;
  kind: string;
  n: number;
  /** True if it can only be judged in a game with periods (not "first to three"). */
  needsPeriods?: boolean;
}

export const BOUNTIES = data.bounties as BountyInfo[];
export const BOUNTY_KINDS = ['winBy', 'shutout', 'defenceGoals', 'hits', 'shots', 'blocks', 'assists', 'scorers', 'lastPeriodGoals', 'comeback'] as const;

export function bountyInfo(id: string): BountyInfo | null {
  return BOUNTIES.find((b) => b.id === id) ?? null;
}

/** The bounty for a game, fixed by its label (the season's seed and the game's number). */
export function bountyFor(label: string, hasPeriods: boolean): BountyInfo {
  const pool = BOUNTIES.filter((b) => hasPeriods || !b.needsPeriods);
  return createRng(`${label}/bounty`).pick(pool);
}

/** True if team 0 (yours) met the bounty in this game. A game given up meets nothing. */
export function bountyMet(bounty: BountyInfo, result: GameResult, home: DressedTeam): boolean {
  if (!result.finished || result.forfeit) return false;
  const mine = result.players.filter((p) => p.team === 0);
  const skaters = mine.filter((p) => p.role === 'skater');
  const total = (pick: (p: (typeof mine)[number]) => number): number => skaters.reduce((sum, p) => sum + pick(p), 0);
  const [us, them] = result.score;
  const won = result.winner === 0;
  // The score at the end of each period, and then the final score.
  const periods = result.periodScores ?? [];
  switch (bounty.kind) {
    case 'winBy':
      return won && us - them >= bounty.n;
    case 'shutout':
      return won && them === 0;
    case 'defenceGoals':
      return skaters.filter((p) => home.players[p.line * 3 + p.slot]?.position === 'D').reduce((sum, p) => sum + p.goals, 0) >= bounty.n;
    case 'hits':
      return total((p) => p.hits) >= bounty.n;
    case 'shots':
      return total((p) => p.shots) >= bounty.n;
    case 'blocks':
      return total((p) => p.blocks) >= bounty.n;
    case 'assists':
      return total((p) => p.assists) >= bounty.n;
    case 'scorers':
      return skaters.filter((p) => p.goals > 0).length >= bounty.n;
    case 'lastPeriodGoals': {
      if (periods.length < 3) return false;
      return (periods[2] as [number, number])[0] - (periods[1] as [number, number])[0] >= bounty.n;
    }
    case 'comeback':
      return won && periods.slice(0, -1).some(([mineThen, theirsThen]) => mineThen < theirsThen);
    default:
      return false;
  }
}

export const UNSEEN_WEIGHT = data.unseenWeight;
export const STICKERS = data.stickers;
export const RINGER = data.ringer;
