import data from '../data/standings.json';
import { book } from './ledger';
import { playerOf, teamOf, userTeam, type League } from './league';
import type { PlayerRecord } from './player';
import type { Franchise } from './season';
import { gamesPlayed, placeOf, points, ranked, type Row, type Scoring, type Standings } from './standings';

/** An end-of-season award and who won it. */
export interface Award {
  id: 'scorer' | 'goalie' | 'improved' | 'rookie';
  title: string;
  playerId: string;
  name: string;
  team: string;
  /** Why, in a few words: "31 points", "1.8 goals against a game". */
  detail: string;
  /** True if he plays for you. */
  mine: boolean;
}

/** One finished season of yours, for the trophy room. */
export interface SeasonRecord {
  season: number;
  outcome: 'champion' | 'eliminated' | 'struckOut' | 'abandoned';
  wins: number;
  losses: number;
  /** Your place in the table and your points, if the league kept one. */
  place: number | null;
  points: number | null;
  /** Your best scorer that season. */
  topScorer: { name: string; goals: number } | null;
  /** Titles of the awards your players won. */
  awards: string[];
}

/** What one of your players has done for the club over his seasons with it. */
export interface CareerLine {
  name: string;
  goals: number;
  assists: number;
  seasons: number;
}

const teamOfPlayer = (league: League, playerId: string): string | null => league.teams.find((t) => t.roster.includes(playerId))?.id ?? null;
const pointsOf = (s: { goals: number; assists: number }): number => s.goals + s.assists;
/** "3 goals and 1 assist". */
const tally = (s: { goals: number; assists: number }): string => `${s.goals} goal${s.goals === 1 ? '' : 's'} and ${s.assists} assist${s.assists === 1 ? '' : 's'}`;

/** The league's best by goals and assists, best first. Only players still on a team count. */
export function scoringLeaders(league: League, scoring: Scoring): { player: PlayerRecord; teamId: string; goals: number; assists: number }[] {
  const out: { player: PlayerRecord; teamId: string; goals: number; assists: number }[] = [];
  for (const [id, tally] of Object.entries(scoring)) {
    const player = league.players[id];
    const teamId = teamOfPlayer(league, id);
    if (player && teamId) out.push({ player, teamId, ...tally });
  }
  return out.sort((a, b) => pointsOf(b) - pointsOf(a) || b.goals - a.goals || a.player.id.localeCompare(b.player.id));
}

/**
 * The season's awards across the whole league: top scorer, best goalie (fewest goals against a game),
 * most improved (overall gained since the season began) and rookie of the year (best scorer who began
 * the season at or under the rookie age). An award nobody qualifies for is left out.
 */
export function seasonAwards(league: League, table: Standings, scoring: Scoring, before: Map<string, number>, agedThisSeason = false): Award[] {
  const awards: Award[] = [];
  const make = (id: Award['id'], title: string, player: PlayerRecord, teamId: string, detail: string): void => {
    awards.push({ id, title, playerId: player.id, name: player.name, team: teamOf(league, teamId).name, detail, mine: teamId === league.userTeamId });
  };
  const leaders = scoringLeaders(league, scoring);
  const top = leaders[0];
  if (top && pointsOf(top) > 0) make('scorer', 'Top scorer', top.player, top.teamId, tally(top));

  const stingiest = Object.keys(table)
    .filter((id) => gamesPlayed(table[id] as Row) >= data.improvedMinGames)
    .sort((a, b) => (table[a] as Row).goalsAgainst / gamesPlayed(table[a] as Row) - (table[b] as Row).goalsAgainst / gamesPlayed(table[b] as Row) || a.localeCompare(b))[0];
  if (stingiest) {
    const goalieId = teamOf(league, stingiest).lineup.goalie;
    const goalie = goalieId ? league.players[goalieId] : undefined;
    const row = table[stingiest] as Row;
    if (goalie) make('goalie', 'Best goalie', goalie, stingiest, `${(row.goalsAgainst / gamesPlayed(row)).toFixed(1)} goals against a game`);
  }

  let improved: { player: PlayerRecord; teamId: string; gain: number } | null = null;
  for (const team of league.teams) {
    for (const id of team.roster) {
      const player = playerOf(league, id);
      const gain = player.overall - (before.get(id) ?? player.overall);
      if (gain > 0 && (!improved || gain > improved.gain || (gain === improved.gain && id < improved.player.id))) improved = { player, teamId: team.id, gain };
    }
  }
  if (improved) make('improved', 'Most improved', improved.player, improved.teamId, `a gain of ${improved.gain} overall`);

  const rookie = leaders.find((line) => line.player.age - (agedThisSeason ? 1 : 0) <= data.rookieMaxAge && pointsOf(line) > 0);
  if (rookie) make('rookie', 'Rookie of the year', rookie.player, rookie.teamId, tally(rookie));
  return awards;
}

/**
 * Who your rivals are next season, most bitter first: the team that knocked you out, teams that beat
 * you often enough on the map, then teams you knocked out. Capped at a couple.
 */
export function nextRivals(f: Franchise): string[] {
  const { season, league } = f;
  const out: string[] = [];
  const add = (id: string | null | undefined): void => {
    if (id && id !== league.userTeamId && league.teams.some((t) => t.id === id) && !out.includes(id)) out.push(id);
  };
  if (season.outcome === 'eliminated') add(season.playoffs?.opponentId);
  for (const [id, losses] of Object.entries(season.lossesTo ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (losses >= data.rivalLossesToMake) add(id);
  }
  if (season.bracket && season.playoffs) {
    const seeds = season.bracket.seeds;
    const semi = seeds[seeds.length - 1 - seeds.indexOf(league.userTeamId)];
    // You beat your semi-final opponent if you reached the final, and the finalist too if you won it.
    if (season.playoffs.round >= 1 || season.outcome === 'champion') add(semi);
    if (season.outcome === 'champion') add(season.bracket.otherWinner);
  }
  return out.slice(0, data.maxRivals);
}

/**
 * Closes the book on the season that has just ended, before its state is cleared: hands out the awards
 * (a cash bonus and a skill point for each your players win), writes the season into the club's history,
 * adds to your players' career lines, and names next season's rivals. Returns lines for the report.
 */
export function closeChronicle(f: Franchise, before: Map<string, number>): string[] {
  const { season, league } = f;
  const news: string[] = [];
  const table = season.standings;
  const scoring = season.scoring ?? {};
  const mine = userTeam(league);

  const awards = table ? seasonAwards(league, table, scoring, before, true) : [];
  for (const award of awards) {
    news.push(`Award: ${award.title} goes to ${award.name} (${award.team}), with ${award.detail}.`);
    if (!award.mine) continue;
    book(f, 'milestones', data.awardCash);
    const player = league.players[award.playerId];
    if (player) player.points = (player.points ?? 0) + data.awardPoints;
    news.push(`He is yours: the club earns $${(data.awardCash / 1_000_000).toFixed(2)}M and he gets ${data.awardPoints} skill point${data.awardPoints === 1 ? '' : 's'}.`);
  }

  const career = (f.career ??= {});
  let best: { name: string; goals: number } | null = null;
  for (const id of mine.roster) {
    const tally = scoring[id];
    const player = playerOf(league, id);
    const line = (career[id] ??= { name: player.name, goals: 0, assists: 0, seasons: 0 });
    line.seasons += 1;
    if (!tally) continue;
    line.goals += tally.goals;
    line.assists += tally.assists;
    if (tally.goals > 0 && (!best || tally.goals > best.goals)) best = { name: player.name, goals: tally.goals };
  }

  if (season.outcome) {
    (f.history ??= []).push({
      season: league.season,
      outcome: season.outcome,
      wins: season.gamesWon,
      losses: season.gamesPlayed - season.gamesWon,
      place: table ? placeOf(table, league.userTeamId) : null,
      points: table ? points(table[league.userTeamId] as Row) : null,
      topScorer: best,
      awards: awards.filter((a) => a.mine).map((a) => a.title),
    });
  }

  f.rivals = nextRivals(f);
  if (f.rivals.length > 0) news.push(`Rivals next season: ${f.rivals.map((id) => teamOf(league, id).name).join(' and ')}. Beating a rival pays ${data.rivalCurrency} more Pucks.`);
  return news;
}

/** One of your players has retired: if he gave the club a few seasons, his name goes on the wall. */
export function rememberRetired(f: Franchise, playerId: string): void {
  const line = f.career?.[playerId];
  if (!line || line.seasons < 2) return;
  (f.greats ??= []).push(`${line.name}: ${line.seasons} seasons, ${line.goals} goals, ${line.assists} assists`);
}

/** The club's records, worked out from its history and its players' career lines. */
export function clubRecords(f: Franchise): { label: string; value: string }[] {
  const history = f.history ?? [];
  const career = Object.values(f.career ?? {});
  const out: { label: string; value: string }[] = [];
  const titles = history.filter((s) => s.outcome === 'champion').length;
  out.push({ label: 'Championships', value: String(titles) });
  if (history.length > 0) {
    const mostWins = history.reduce((a, b) => (b.wins > a.wins ? b : a));
    out.push({ label: 'Most wins in a season', value: `${mostWins.wins} (season ${mostWins.season})` });
    const placed = history.filter((s) => s.place !== null);
    if (placed.length > 0) {
      const top = placed.reduce((a, b) => ((b.place as number) < (a.place as number) ? b : a));
      out.push({ label: 'Best finish in the table', value: `${top.place} (season ${top.season})` });
    }
    const scorers = history.filter((s) => s.topScorer !== null);
    if (scorers.length > 0) {
      const top = scorers.reduce((a, b) => ((b.topScorer as { goals: number }).goals > (a.topScorer as { goals: number }).goals ? b : a));
      out.push({ label: 'Most goals in a season', value: `${top.topScorer?.name}, ${top.topScorer?.goals} (season ${top.season})` });
    }
    out.push({ label: 'Awards won', value: String(history.reduce((sum, s) => sum + s.awards.length, 0)) });
  }
  if (career.length > 0) {
    const goals = career.reduce((a, b) => (b.goals > a.goals ? b : a));
    if (goals.goals > 0) out.push({ label: 'Most career goals', value: `${goals.name}, ${goals.goals}` });
    const assists = career.reduce((a, b) => (b.assists > a.assists ? b : a));
    if (assists.assists > 0) out.push({ label: 'Most career assists', value: `${assists.name}, ${assists.assists}` });
    const loyal = career.reduce((a, b) => (b.seasons > a.seasons ? b : a));
    out.push({ label: 'Longest service', value: `${loyal.name}, ${loyal.seasons} season${loyal.seasons === 1 ? '' : 's'}` });
  }
  return out;
}

/** What is going on around the league right now, newest first, in a few lines. */
export function leagueNews(f: Franchise): string[] {
  const { season, league } = f;
  const table = season.standings;
  if (!table) return [];
  const name = (id: string): string => teamOf(league, id).name;
  const news: string[] = [];
  const order = ranked(table);
  const played = order.some((id) => gamesPlayed(table[id] as Row) > 0);
  if (!played) return ['The season is about to begin: every team is level.'];

  for (const id of f.rivals ?? []) {
    if (table[id]) news.push(`Your rivals ${name(id)} are ${placeOf(table, id)}${suffix(placeOf(table, id))} with ${points(table[id] as Row)} points.`);
  }
  const leader = order[0] as string;
  news.push(leader === league.userTeamId ? `You lead the league with ${points(table[leader] as Row)} points.` : `${name(leader)} lead the league with ${points(table[leader] as Row)} points.`);
  const hot = order.filter((id) => (table[id] as Row).streak >= 3).sort((a, b) => (table[b] as Row).streak - (table[a] as Row).streak)[0];
  if (hot) news.push(`${name(hot)} have won ${(table[hot] as Row).streak} in a row.`);
  const cold = order.filter((id) => (table[id] as Row).streak <= -3).sort((a, b) => (table[a] as Row).streak - (table[b] as Row).streak)[0];
  if (cold) news.push(`${name(cold)} have lost ${-(table[cold] as Row).streak} in a row.`);
  const scorer = scoringLeaders(league, season.scoring ?? {})[0];
  if (scorer && pointsOf(scorer) > 0) news.push(`${scorer.player.name} (${name(scorer.teamId)}) leads the league with ${tally(scorer)}.`);
  for (const r of (season.lastRound ?? []).slice(0, 4)) {
    const homeWon = r.homeGoals > r.awayGoals;
    news.push(`${name(homeWon ? r.home : r.away)} ${Math.max(r.homeGoals, r.awayGoals)}, ${name(homeWon ? r.away : r.home)} ${Math.min(r.homeGoals, r.awayGoals)}${r.overtime ? ' (overtime)' : ''}.`);
  }
  return news;
}

const suffix = (n: number): string => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
