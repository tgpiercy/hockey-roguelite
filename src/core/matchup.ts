import type { GameResult } from '../sim/match';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';
import type { TeamSetup } from '../sim/world';
import { playerOf, type League, type Team } from './league';
import { dressedSkaters } from './lineup';
import type { PlayerRecord } from './player';
import { canPlay } from './roster';
import type { TeamRecord } from './save';

/** A team ready for the ice: what the simulation needs, plus who is who for the summary screen. */
export interface DressedTeam {
  name: string;
  setup: TeamSetup;
  /** The dressed players in simulation order: line 1, line 2, then the goalie. */
  players: PlayerRecord[];
}

/**
 * Turns a team's dressed lineup into the roster the simulation takes: six skaters
 * (line 1 then line 2, each with its centre first) and a goalie. Returns null if the lineup is not legal.
 */
export function dress(league: League, team: Team): DressedTeam | null {
  if (!canPlay(league, team).ok) return null;
  const skaters = dressedSkaters(team.lineup).map((id) => playerOf(league, id));
  const goalie = playerOf(league, team.lineup.goalie as string);
  return {
    name: team.name,
    players: [...skaters, goalie],
    setup: {
      skaters: skaters.map((p) => p.ratings as SkaterRatings),
      goalie: goalie.ratings as GoalieRatings,
      positions: skaters.map((p) => (p.position === 'D' ? 'D' : 'F')),
    },
  };
}

/** Adds a finished game to the record of the team that played as team 0. */
export function applyResult(record: TeamRecord, result: GameResult): TeamRecord {
  if (!result.finished || result.winner === null) return record;
  if (result.winner === 0) return { ...record, wins: record.wins + 1 };
  if (result.overtime) return { ...record, overtimeLosses: record.overtimeLosses + 1 };
  return { ...record, losses: record.losses + 1 };
}
