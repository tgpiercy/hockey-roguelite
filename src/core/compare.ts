import { goaliesOn, skatersOn, type League, type Team } from './league';
import type { PlayerRecord } from './player';

export type PlayerSort = 'overall' | 'cost' | 'age';
export type PositionFilter = 'all' | 'F' | 'D' | 'G';

/** Players of one position (or all), in the order asked for. The list given is left alone. */
export function sortPlayers(players: readonly PlayerRecord[], sort: PlayerSort, position: PositionFilter = 'all'): PlayerRecord[] {
  const kept = position === 'all' ? [...players] : players.filter((p) => p.position === position);
  return kept.sort((a, b) => {
    if (sort === 'cost') return a.capHit - b.capHit || b.overall - a.overall || a.id.localeCompare(b.id);
    if (sort === 'age') return a.age - b.age || b.overall - a.overall || a.id.localeCompare(b.id);
    return b.overall - a.overall || a.capHit - b.capHit || a.id.localeCompare(b.id);
  });
}

/**
 * The player on a team that a newcomer would most likely replace: the weakest of his own kind.
 * A skater is compared with skaters (the weakest who shares his position if there is one), a goalie with
 * the goalie. Null if the team has nobody of that kind.
 */
export function wouldReplace(league: League, team: Team, newcomer: PlayerRecord): PlayerRecord | null {
  if (newcomer.position === 'G') return goaliesOn(league, team).slice(-1)[0] ?? null;
  const skaters = skatersOn(league, team);
  const same = skaters.filter((p) => p.position === newcomer.position);
  const pool = same.length > 0 ? same : skaters;
  return [...pool].sort((a, b) => a.overall - b.overall || a.id.localeCompare(b.id))[0] ?? null;
}
