import type { PlayerRecord } from './player';

/** Who is dressed: two lines of three skaters and a goalie. A slot is null until someone is put in it. */
export interface Lineup {
  line1: (string | null)[];
  line2: (string | null)[];
  goalie: string | null;
}

export interface Team {
  /** "t-user" for the player's team, "t-01" and so on for the AI teams. */
  id: string;
  name: string;
  /** Player ids: up to 7 skaters and 1 goalie. */
  roster: string[];
  lineup: Lineup;
  /** Dollars still counted against the cap this season for players released under contract. */
  deadCap?: number;
}

export interface League {
  /** The whole league can be rebuilt from this. */
  seed: string;
  season: number;
  players: Record<string, PlayerRecord>;
  teams: Team[];
  /** Player ids of everyone not on a team. */
  freeAgents: string[];
  userTeamId: string;
}

export const USER_TEAM_ID = 't-user';

export function teamOf(league: League, teamId: string): Team {
  const team = league.teams.find((t) => t.id === teamId);
  if (!team) throw new Error(`no team ${teamId}`);
  return team;
}

export function userTeam(league: League): Team {
  return teamOf(league, league.userTeamId);
}

export function playerOf(league: League, playerId: string): PlayerRecord {
  const player = league.players[playerId];
  if (!player) throw new Error(`no player ${playerId}`);
  return player;
}

/** A team's players, best first. */
export function rosterOf(league: League, team: Team): PlayerRecord[] {
  return team.roster.map((id) => playerOf(league, id)).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
}

export function skatersOn(league: League, team: Team): PlayerRecord[] {
  return rosterOf(league, team).filter((p) => p.position !== 'G');
}

export function goaliesOn(league: League, team: Team): PlayerRecord[] {
  return rosterOf(league, team).filter((p) => p.position === 'G');
}
