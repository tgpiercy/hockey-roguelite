import rules from '../data/league.json';
import { goaliesOn, playerOf, rosterOf, skatersOn, type League, type Team } from './league';
import { lineupProblems, repairLineup } from './lineup';

/** The result of a roster move: done, or refused with a reason to show the player. */
export type MoveResult = { ok: true } | { ok: false; reason: string };

const money = (dollars: number): string => `$${(dollars / 1_000_000).toFixed(2)}M`;

/** Total cap hit of everyone on the team. */
export function payroll(league: League, team: Team): number {
  return rosterOf(league, team).reduce((sum, p) => sum + p.capHit, 0);
}

export function capSpace(league: League, team: Team): number {
  return rules.cap - payroll(league, team);
}

/** Would signing this free agent be allowed? The cap is hard, and a roster holds 7 skaters and 1 goalie. */
export function canSign(league: League, team: Team, playerId: string): MoveResult {
  if (!league.freeAgents.includes(playerId)) return { ok: false, reason: 'He is not a free agent.' };
  const player = playerOf(league, playerId);
  if (player.position === 'G') {
    if (goaliesOn(league, team).length >= rules.rosterGoalies) {
      return { ok: false, reason: 'You already have a goalie. Release him first.' };
    }
  } else if (skatersOn(league, team).length >= rules.rosterSkaters) {
    return { ok: false, reason: `Your roster is full at ${rules.rosterSkaters} skaters. Release one first.` };
  }
  const space = capSpace(league, team);
  if (player.capHit > space) {
    return { ok: false, reason: `Over the cap: he costs ${money(player.capHit)} and you have ${money(space)} of space.` };
  }
  return { ok: true };
}

/** Signs a free agent to the team, if the cap and the roster limit allow it. */
export function sign(league: League, team: Team, playerId: string): MoveResult {
  const allowed = canSign(league, team, playerId);
  if (!allowed.ok) return allowed;
  league.freeAgents = league.freeAgents.filter((id) => id !== playerId);
  team.roster.push(playerId);
  repairLineup(league, team);
  return { ok: true };
}

/** Releases a player to the free-agent pool. His cap hit comes off at once. */
export function release(league: League, team: Team, playerId: string): MoveResult {
  if (!team.roster.includes(playerId)) return { ok: false, reason: 'He is not on your team.' };
  team.roster = team.roster.filter((id) => id !== playerId);
  league.freeAgents.push(playerId);
  repairLineup(league, team);
  return { ok: true };
}

/** Can this team play a game? It needs a full, legal lineup: 6 skaters and a goalie. */
export function canPlay(league: League, team: Team): MoveResult {
  const problems = lineupProblems(league, team);
  if (problems.length > 0) return { ok: false, reason: problems[0] as string };
  if (payroll(league, team) > rules.cap) return { ok: false, reason: 'The team is over the cap.' };
  return { ok: true };
}
