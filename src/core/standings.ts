import offseason from '../data/offseason.json';
import data from '../data/standings.json';
import type { SkaterRatings } from '../sim/ratings';
import { teamStrength } from './bosses';
import { playerOf, teamOf, type League } from './league';
import { dressedSkaters } from './lineup';
import { winChance } from './quickGame';
import { createRng, type Rng } from './rng';

/** One team's line in the table. */
export interface Row {
  wins: number;
  losses: number;
  overtimeLosses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Games won in a row (positive) or lost in a row (negative). */
  streak: number;
}

/** The league table, by team id. */
export type Standings = Record<string, Row>;

/** One finished game between two league teams. */
export interface LeagueResult {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  overtime: boolean;
}

/** Goals and assists by player id, for everyone in the league this season. */
export type Scoring = Record<string, { goals: number; assists: number }>;

export function newStandings(league: League): Standings {
  const table: Standings = {};
  for (const team of league.teams) table[team.id] = { wins: 0, losses: 0, overtimeLosses: 0, goalsFor: 0, goalsAgainst: 0, streak: 0 };
  return table;
}

export function points(row: Row): number {
  return row.wins * data.winPoints + row.overtimeLosses * data.overtimeLossPoints;
}

export function gamesPlayed(row: Row): number {
  return row.wins + row.losses + row.overtimeLosses;
}

/** Team ids from first place to last: points, then wins, then goal difference, then goals scored, then id. */
export function ranked(table: Standings): string[] {
  return Object.keys(table).sort((a, b) => {
    const x = table[a] as Row;
    const y = table[b] as Row;
    return (
      points(y) - points(x) ||
      y.wins - x.wins ||
      y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      a.localeCompare(b)
    );
  });
}

/** A team's place in the table, 1 for first. */
export function placeOf(table: Standings, teamId: string): number {
  return ranked(table).indexOf(teamId) + 1;
}

/** Writes one game into the table. A team not in it (a boss) is ignored. */
export function recordResult(table: Standings, result: LeagueResult): void {
  const write = (id: string, scored: number, conceded: number): void => {
    const row = table[id];
    if (!row) return;
    row.goalsFor += scored;
    row.goalsAgainst += conceded;
    if (scored > conceded) {
      row.wins += 1;
      row.streak = row.streak > 0 ? row.streak + 1 : 1;
    } else {
      if (result.overtime) row.overtimeLosses += 1;
      else row.losses += 1;
      row.streak = row.streak < 0 ? row.streak - 1 : -1;
    }
  };
  write(result.home, result.homeGoals, result.awayGoals);
  write(result.away, result.awayGoals, result.homeGoals);
}

/** Settles one game between two league teams from their strength. */
export function settle(league: League, home: string, away: string, rng: Rng): LeagueResult {
  const q = offseason.quick;
  const homeWins = rng.chance(winChance(teamStrength(league, home) - teamStrength(league, away)));
  const winner = rng.int(q.minGoals + 1, q.maxWinnerGoals);
  const loser = rng.int(0, winner - 1);
  // A one-goal game sometimes went to overtime.
  const overtime = winner - loser === 1 && rng.chance(data.overtimeChance);
  return { home, away, homeGoals: homeWins ? winner : loser, awayGoals: homeWins ? loser : winner, overtime };
}

/** Hands a team's goals out to its dressed skaters, likelier to the better shooters; most goals have an assist. */
export function creditGoals(league: League, teamId: string, goals: number, rng: Rng, scoring: Scoring): void {
  const team = league.teams.find((t) => t.id === teamId);
  if (!team || goals <= 0) return;
  const skaters = dressedSkaters(team.lineup).map((id) => playerOf(league, id));
  if (skaters.length === 0) return;
  const weight = skaters.map((p) => Math.max(1, (p.ratings as SkaterRatings).shooting - 40));
  const total = weight.reduce((sum, w) => sum + w, 0);
  const pick = (): string => {
    let roll = rng.next() * total;
    for (let i = 0; i < skaters.length; i++) {
      roll -= weight[i] as number;
      if (roll < 0) return skaters[i]!.id;
    }
    return skaters[0]!.id;
  };
  const line = (id: string): { goals: number; assists: number } => (scoring[id] ??= { goals: 0, assists: 0 });
  for (let g = 0; g < goals; g++) {
    const scorer = pick();
    line(scorer).goals += 1;
    const helper = pick();
    if (helper !== scorer) line(helper).assists += 1;
  }
}

/**
 * One round of the league: every team not in `busy` (the teams whose game you have just played) plays one
 * game against another. With an odd number, one team sits the round out. The same seed and round number
 * always give the same games.
 */
export function playRound(league: League, table: Standings, scoring: Scoring, seed: string, round: number, busy: string[]): LeagueResult[] {
  const rng = createRng(`${seed}/league/${round}`);
  const free = rng.shuffle(league.teams.map((t) => t.id).filter((id) => !busy.includes(id)).sort());
  const results: LeagueResult[] = [];
  for (let i = 0; i + 1 < free.length; i += 2) {
    const result = settle(league, free[i] as string, free[i + 1] as string, rng);
    recordResult(table, result);
    creditGoals(league, result.home, result.homeGoals, rng, scoring);
    creditGoals(league, result.away, result.awayGoals, rng, scoring);
    results.push(result);
  }
  return results;
}

/** The playoff field: you, and the best AI teams in the table, in seeding order (best first). */
export function playoffField(table: Standings, userTeamId: string): string[] {
  const order = ranked(table);
  const others = order.filter((id) => id !== userTeamId).slice(0, data.playoffTeams - 1);
  return order.filter((id) => id === userTeamId || others.includes(id));
}

/** A best-of series between two league teams, settled from strength. Returns the winner's id. */
export function settleSeries(league: League, a: string, b: string, winsNeeded: number, rng: Rng): string {
  let x = 0;
  let y = 0;
  const chance = winChance(teamStrength(league, a) - teamStrength(league, b));
  while (x < winsNeeded && y < winsNeeded) {
    if (rng.chance(chance)) x += 1;
    else y += 1;
  }
  return x > y ? a : b;
}

/** A team's name, for the news and the table. */
export function teamName(league: League, teamId: string): string {
  return teamOf(league, teamId).name;
}
