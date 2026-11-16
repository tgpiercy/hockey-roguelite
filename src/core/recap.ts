import { bossInfo } from './bosses';
import { setupLine } from './charter';
import { leagueName } from './prestige';
import { artifactInfo, cupHeld, difficultyInfo, setupOf, type Franchise } from './season';
import { seasonSummary } from './seasonSummary';
import { placeOf } from './standings';
import { userTeam } from './league';

/** A season on one card: everything the recap picture says, as plain words and numbers. */
export interface SeasonRecap {
  club: string;
  season: number;
  league: string;
  difficulty: string;
  /** How it ended: "Champions", "Lost in the final", "Out in region 2". */
  finish: string;
  champion: boolean;
  wins: number;
  losses: number;
  /** Where you stood in the table and out of how many; null for a season with no table. */
  place: number | null;
  teams: number;
  topScorer: { name: string; goals: number } | null;
  /** The boss clubs beaten this season, in the order they fell. */
  bosses: string[];
  /** The artifacts held at the end. */
  artifacts: string[];
  cup: boolean;
  /** The charter and handicaps it was played under; empty for the standard rules. */
  setup: string;
  /** The road walked: the kind of each stop, in order. */
  road: string[];
}

/** Sums the season up for its picture. Call it while the season is still the franchise's season (before the off-season runs). */
export function seasonRecap(f: Franchise): SeasonRecap {
  const { season, league } = f;
  const summary = seasonSummary(f);
  const stops = season.visited.map((id) => season.map?.stops[id]).filter((s) => s !== undefined);
  // A boss you were knocked out by is on the road walked, but he was not beaten.
  const lostAt = season.outcome === 'struckOut' ? season.last : null;
  const bosses = stops.filter((s) => s.kind === 'boss' && s.bossId && s.id !== lostAt).map((s) => bossInfo(s.bossId as string).name);
  return {
    club: userTeam(league).name,
    season: league.season,
    league: leagueName(f.prestige.level),
    difficulty: difficultyInfo(f.difficulty).name,
    finish: summary.finish,
    champion: summary.champion,
    wins: summary.wins,
    losses: summary.losses,
    place: season.standings ? placeOf(season.standings, league.userTeamId) : null,
    teams: league.teams.length,
    topScorer: summary.topScorer ? { name: summary.topScorer.player.name, goals: summary.topScorer.goals } : null,
    bosses,
    artifacts: f.artifacts.map((id) => artifactInfo(id).name),
    cup: cupHeld(f),
    setup: setupLine(setupOf(f)),
    road: stops.map((s) => s.kind),
  };
}

/** Shortens words to fit a line of the picture, with an ellipsis when cut. */
export function fitWords(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** A list as one line that fits: as many names as there is room for, then "+N more". */
export function fitList(names: string[], max: number): string {
  if (names.length === 0) return '';
  let line = '';
  for (let i = 0; i < names.length; i++) {
    const next = line === '' ? (names[i] as string) : `${line}, ${names[i]}`;
    const rest = names.length - i - 1;
    const tail = rest > 0 ? ` +${rest} more` : '';
    if (next.length + tail.length > max) return line === '' ? fitWords(names[i] as string, max) : `${line} +${names.length - i} more`;
    line = next;
  }
  return line;
}
