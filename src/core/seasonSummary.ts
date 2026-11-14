import rules from '../data/season.json';
import { MILESTONES } from './milestones';
import type { PlayerRecord } from './player';
import type { Franchise } from './season';

/** The facts of a season that has just ended, for its summary screen. */
export interface SeasonSummary {
  /** How it ended, in a few words: "Champions", "Lost in the final", "Out in region 2". */
  finish: string;
  champion: boolean;
  wins: number;
  losses: number;
  strikes: number;
  /** Your top scorer and his goals, or null if nobody scored. */
  topScorer: { player: PlayerRecord; goals: number } | null;
  shutouts: number;
  /** The names of the milestones reached. */
  milestones: string[];
  /** How many packs are waiting to be opened. */
  packs: number;
}

/** How far the season got, in words. */
function finishOf(f: Franchise): string {
  const { season } = f;
  if (season.outcome === 'champion') return 'Champions';
  if (season.outcome === 'eliminated') {
    const round = season.playoffs?.round ?? 0;
    return round >= rules.playoffRounds - 1 ? 'Lost in the final' : 'Lost in the semi-final';
  }
  // Struck out on the map: say which region it happened in.
  const last = season.last && season.map ? season.map.stops[season.last] : undefined;
  const region = last ? last.region + 1 : 1;
  return `Out in region ${region}`;
}

/** Sums up the season in the franchise's season state. Call it before the season is wrapped up. */
export function seasonSummary(f: Franchise): SeasonSummary {
  const { season, league } = f;
  let top: { player: PlayerRecord; goals: number } | null = null;
  // Ties go to the player whose id sorts first, so the answer never changes between looks.
  for (const id of Object.keys(season.playerGoals).sort()) {
    const goals = season.playerGoals[id] ?? 0;
    const player = league.players[id];
    if (player && goals > 0 && (!top || goals > top.goals)) top = { player, goals };
  }
  return {
    finish: finishOf(f),
    champion: season.outcome === 'champion',
    wins: season.gamesWon,
    losses: season.gamesPlayed - season.gamesWon,
    strikes: season.strikes,
    topScorer: top,
    shutouts: season.shutouts,
    milestones: MILESTONES.filter((m) => season.milestones.includes(m.id)).map((m) => m.name),
    packs: f.packs.length,
  };
}
