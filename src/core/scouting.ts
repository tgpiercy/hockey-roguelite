import leagueRules from '../data/league.json';
import { overLimit } from './economy';
import aging from '../data/aging.json';
import offseasonRules from '../data/offseason.json';
import data from '../data/scouting.json';
import { clubStat } from './club';
import { playerOf, userTeam } from './league';
import type { PlayerRecord } from './player';
import { createRng } from './rng';
import { sign, type MoveResult } from './roster';
import type { Franchise } from './season';

/** Scouting points: from the scout you employ and the scouting office. */
export function scoutingPoints(f: Franchise): number {
  return clubStat(f, 'scouting', 0);
}

/**
 * What your scouts can say about a player's hidden potential: a range that always contains it.
 * The range narrows with scouting points, and for your own players with each season you have had them.
 */
export function potentialRange(f: Franchise, player: PlayerRecord): { low: number; high: number } {
  // Once a player is at the age where ratings start to fall there is nothing left to find out.
  if (player.age >= aging.declineFrom) return { low: player.potential, high: player.potential };
  const seasonsHere = f.tenure[player.id] ?? 0;
  const width = Math.max(0, Math.round(data.rangeWidth - data.widthPerPoint * scoutingPoints(f) - data.widthPerSeasonHere * seasonsHere));
  // Where the true value sits inside the range is fixed per player, so the range does not jump about.
  const share = createRng(`scouting/${player.id}`).next();
  const low = Math.max(player.overall, Math.round(player.potential - share * width));
  const high = Math.max(player.potential, Math.min(99, low + width));
  return { low: Math.min(low, player.potential), high };
}

/** The range in words: "78 to 90", or one number once it is known exactly. */
export function potentialText(f: Franchise, player: PlayerRecord): string {
  if (player.age >= aging.declineFrom) return 'past his peak, no more growth';
  const { low, high } = potentialRange(f, player);
  return low === high ? `${low} overall` : `${low} to ${high} overall`;
}

/** The share of the free-agent pool your scouts can see. */
export function visibleShare(f: Franchise): number {
  return Math.min(1, data.baseVisibleShare + data.sharePerPoint * scoutingPoints(f));
}

/**
 * The free agents your scouts have not found. They are the ones with the most room to grow;
 * cheap players are never hidden, so a roster can always be filled.
 */
export function hiddenFreeAgents(f: Franchise): Set<string> {
  const { league } = f;
  const count = Math.floor(league.freeAgents.length * (1 - visibleShare(f)));
  const candidates = league.freeAgents
    .map((id) => playerOf(league, id))
    .filter((p) => p.capHit > offseasonRules.cheapCapHit)
    .sort((a, b) => b.potential - b.overall - (a.potential - a.overall) || b.overall - a.overall || a.id.localeCompare(b.id));
  return new Set(candidates.slice(0, count).map((p) => p.id));
}

/** The free agents you can see and sign. */
export function visibleFreeAgents(f: Franchise): string[] {
  const hidden = hiddenFreeAgents(f);
  return f.league.freeAgents.filter((id) => !hidden.has(id));
}

/** Signs a free agent your scouts can see. He is noted as signed this off-season. */
export function signPlayer(f: Franchise, playerId: string): MoveResult {
  if (hiddenFreeAgents(f).has(playerId)) return { ok: false, reason: 'Your scouts have not found him.' };
  const wanted = f.league.players[playerId];
  if (wanted && f.league.freeAgents.includes(playerId)) {
    // The owner's limit never stops you icing a team: it only applies once you have enough players to play.
    const team = userTeam(f.league);
    const have = team.roster.map((id) => playerOf(f.league, id)).filter((p) => (p.position === 'G') === (wanted.position === 'G')).length;
    const needed = wanted.position === 'G' ? leagueRules.rosterGoalies : leagueRules.dressedSkaters;
    if (have >= needed) {
      const limit = overLimit(f, wanted.capHit, offseasonRules.cheapCapHit);
      if (!limit.ok) return limit;
    }
  }
  const result = sign(f.league, userTeam(f.league), playerId);
  if (result.ok) f.offseason.signed.push(playerId);
  return result;
}

/** The end of a season: everyone on your team has been with you a season longer; anyone gone is forgotten. */
export function tickTenure(f: Franchise): void {
  const next: Record<string, number> = {};
  for (const id of userTeam(f.league).roster) next[id] = (f.tenure[id] ?? 0) + 1;
  f.tenure = next;
}
