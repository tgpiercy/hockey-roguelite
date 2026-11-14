import leagueRules from '../data/league.json';
import rules from '../data/offseason.json';
import { playerOf, teamOf, userTeam } from './league';
import { autoLineup, repairLineup } from './lineup';
import type { PlayerRecord } from './player';
import { payroll, type MoveResult } from './roster';
import { rosterLocked, type Franchise } from './season';

/**
 * What a player is worth in a trade: his overall, plus credit for room still to grow,
 * minus a penalty for each year past 30.
 */
export function tradeValue(p: PlayerRecord): number {
  const t = rules.trade;
  return p.overall + Math.max(0, p.potential - p.overall) * t.youthCredit - Math.max(0, p.age - t.agePenaltyFrom) * t.agePenaltyPerYear;
}

const money = (n: number): string => `$${(n / 1_000_000).toFixed(2)}M`;

/**
 * Would the other team make this one-for-one trade? It must be skater for skater or goalie for goalie,
 * both teams must stay under the cap, and the other team must get at least as much value as it gives.
 */
export function evaluateTrade(f: Franchise, minePlayerId: string, theirTeamId: string, theirPlayerId: string): MoveResult {
  if (rosterLocked(f)) return { ok: false, reason: 'Trades happen in the off-season.' };
  if (f.offseason.pending.length > 0) return { ok: false, reason: 'Decide your expiring contracts first.' };
  const { league } = f;
  const mineTeam = userTeam(league);
  if (theirTeamId === league.userTeamId) return { ok: false, reason: 'You cannot trade with yourself.' };
  const theirTeam = teamOf(league, theirTeamId);
  if (!mineTeam.roster.includes(minePlayerId)) return { ok: false, reason: 'He is not on your team.' };
  if (!theirTeam.roster.includes(theirPlayerId)) return { ok: false, reason: 'He is not on that team.' };
  const mine = playerOf(league, minePlayerId);
  const theirs = playerOf(league, theirPlayerId);

  if ((mine.position === 'G') !== (theirs.position === 'G')) return { ok: false, reason: 'Trade a skater for a skater, or a goalie for a goalie.' };

  const myPayroll = payroll(league, mineTeam) - mine.capHit + theirs.capHit;
  if (myPayroll > leagueRules.cap) return { ok: false, reason: `Over the cap: you would be at ${money(myPayroll)}.` };
  const theirPayroll = payroll(league, theirTeam) - theirs.capHit + mine.capHit;
  if (theirPayroll > leagueRules.cap) return { ok: false, reason: `${theirTeam.name} cannot fit him under their cap.` };

  if (tradeValue(mine) < tradeValue(theirs) + rules.trade.acceptMargin) {
    return { ok: false, reason: `${theirTeam.name} say no: they value ${theirs.name} more than ${mine.name}.` };
  }
  return { ok: true };
}

/** Makes the trade, if the other team accepts. Your player's gear comes back to the inventory. */
export function trade(f: Franchise, minePlayerId: string, theirTeamId: string, theirPlayerId: string): MoveResult {
  const verdict = evaluateTrade(f, minePlayerId, theirTeamId, theirPlayerId);
  if (!verdict.ok) return verdict;
  const { league } = f;
  const mineTeam = userTeam(league);
  const theirTeam = teamOf(league, theirTeamId);
  for (const item of f.gear) if (item.wornBy === minePlayerId) item.wornBy = null;
  mineTeam.roster = mineTeam.roster.map((id) => (id === minePlayerId ? theirPlayerId : id));
  theirTeam.roster = theirTeam.roster.map((id) => (id === theirPlayerId ? minePlayerId : id));
  repairLineup(league, mineTeam);
  theirTeam.lineup = autoLineup(league, theirTeam);
  f.offseason.signed.push(theirPlayerId);
  return { ok: true };
}
