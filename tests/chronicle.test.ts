import { describe, expect, it } from 'vitest';
import { closeChronicle, clubRecords, leagueNews, nextRivals, rememberRetired, scoringLeaders, seasonAwards } from '../src/core/chronicle';
import { generateLeague } from '../src/core/generate';
import { playerOf, teamOf, userTeam } from '../src/core/league';
import { finishSeason } from '../src/core/offseason';
import { availableStops, currentStop, isRival, newFranchise, recordGame, startSeason, travel, type Franchise } from '../src/core/season';
import { newStandings, type Scoring } from '../src/core/standings';
import rules from '../src/data/standings.json';
import seasonRules from '../src/data/season.json';
import type { GameResult } from '../src/sim/match';

const game = (won: boolean, margin = 1): GameResult => ({ score: won ? [margin + 1, 1] : [1, margin + 1], winner: won ? 0 : 1, finished: true, overtime: false, periods: 3, players: [], powerupsUsed: [] }) as unknown as GameResult;
const started = (seed = 'chronicle'): Franchise => {
  const f = newFranchise(generateLeague(seed));
  expect(startSeason(f).ok).toBe(true);
  return f;
};
const ended = (f: Franchise, outcome: 'champion' | 'eliminated' | 'struckOut'): Franchise => {
  f.season.phase = 'ended';
  f.season.outcome = outcome;
  return f;
};

describe('awards', () => {
  const league = generateLeague('awards');
  const mine = userTeam(league);
  const table = newStandings(league);
  for (const id of Object.keys(table)) table[id] = { wins: 2, losses: 2, overtimeLosses: 0, goalsFor: 12, goalsAgainst: 12, streak: 0 };
  table['t-07'] = { wins: 4, losses: 0, overtimeLosses: 0, goalsFor: 12, goalsAgainst: 3, streak: 4 };
  const star = teamOf(league, 't-09').roster[0]!;
  const kid = mine.roster.find((id) => playerOf(league, id).position !== 'G')!;
  playerOf(league, kid).age = rules.rookieMaxAge;
  const scoring: Scoring = { [star]: { goals: 12, assists: 9 }, [kid]: { goals: 5, assists: 2 } };
  const before = new Map(Object.values(league.players).map((p) => [p.id, p.overall]));
  const riser = teamOf(league, 't-02').roster[1]!;
  before.set(riser, playerOf(league, riser).overall - 6);

  const awards = seasonAwards(league, table, scoring, before);
  const by = (id: string) => awards.find((a) => a.id === id)!;

  it('top scorer is the league\'s best by goals and assists', () => {
    expect(by('scorer')).toMatchObject({ playerId: star, mine: false });
    expect(by('scorer').detail).toBe('12 goals and 9 assists');
    expect(scoringLeaders(league, scoring).map((l) => l.player.id)).toEqual([star, kid]);
  });

  it('best goalie is the goalie of the team that lets in fewest a game', () => {
    expect(by('goalie').playerId).toBe(teamOf(league, 't-07').lineup.goalie);
  });

  it('most improved is whoever gained most overall', () => {
    expect(by('improved')).toMatchObject({ playerId: riser, detail: 'a gain of 6 overall' });
  });

  it('rookie of the year is the best scorer young enough, and can be yours', () => {
    expect(by('rookie')).toMatchObject({ playerId: kid, mine: true });
  });

  it('an award nobody qualifies for is left out', () => {
    const none = seasonAwards(league, newStandings(league), {}, new Map(Object.values(league.players).map((p) => [p.id, p.overall])));
    expect(none).toEqual([]);
  });
});

describe('the end of a season in the club\'s book', () => {
  it('an award for one of yours pays the club and gives him a skill point, once', () => {
    const f = ended(started(), 'struckOut');
    const mine = userTeam(f.league);
    const id = mine.roster.find((x) => playerOf(f.league, x).position !== 'G')!;
    f.season.scoring = { [id]: { goals: 30, assists: 20 } };
    const cash = f.cash;
    const news = closeChronicle(f, new Map(Object.values(f.league.players).map((p) => [p.id, p.overall])));
    expect(news.join(' ')).toMatch(/Award: Top scorer goes to/);
    expect(f.cash).toBe(cash + rules.awardCash);
    expect(playerOf(f.league, id).points).toBe(rules.awardPoints);
    expect(f.history).toHaveLength(1);
    expect(f.history![0]).toMatchObject({ season: 1, outcome: 'struckOut', topScorer: { goals: 30 }, awards: ['Top scorer'] });
    expect(f.career![id]).toMatchObject({ goals: 30, assists: 20, seasons: 1 });
  });

  it('finishing a season writes it into the history and the report', () => {
    const f = started();
    travel(f, availableStops(f).find((s) => !s.elite)!.id);
    recordGame(f, game(true, 2));
    ended(f, 'struckOut');
    expect(finishSeason(f).ok).toBe(true);
    expect(f.history).toHaveLength(1);
    expect(f.history![0]!.wins).toBe(1);
    expect(f.history![0]!.place).toBeGreaterThanOrEqual(1);
    expect(f.offseason.report!.news.some((line) => line.startsWith('Award:'))).toBe(true);
    // The next season starts a fresh table.
    expect(f.season.standings).toBeUndefined();
  });

  it('records come from the history and the career lines', () => {
    const f = started();
    f.history = [
      { season: 1, outcome: 'struckOut', wins: 3, losses: 3, place: 6, points: 6, topScorer: { name: 'A', goals: 4 }, awards: [] },
      { season: 2, outcome: 'champion', wins: 12, losses: 1, place: 1, points: 24, topScorer: { name: 'B', goals: 11 }, awards: ['Top scorer'] },
    ];
    f.career = { x: { name: 'A', goals: 9, assists: 2, seasons: 3 }, y: { name: 'B', goals: 11, assists: 14, seasons: 1 } };
    const records = Object.fromEntries(clubRecords(f).map((line) => [line.label, line.value]));
    expect(records.Championships).toBe('1');
    expect(records['Most wins in a season']).toBe('12 (season 2)');
    expect(records['Best finish in the table']).toBe('1 (season 2)');
    expect(records['Most goals in a season']).toBe('B, 11 (season 2)');
    expect(records['Most career goals']).toBe('B, 11');
    expect(records['Most career assists']).toBe('B, 14');
    expect(records['Longest service']).toBe('A, 3 seasons');
    expect(clubRecords(newFranchise(generateLeague('empty')))).toEqual([{ label: 'Championships', value: '0' }]);
  });

  it('a player who retires after a few seasons with you is remembered; a newcomer is not', () => {
    const f = started();
    f.career = { old: { name: 'Old Hand', goals: 40, assists: 30, seasons: 5 }, fresh: { name: 'New Boy', goals: 1, assists: 0, seasons: 1 } };
    rememberRetired(f, 'old');
    rememberRetired(f, 'fresh');
    rememberRetired(f, 'nobody');
    expect(f.greats).toEqual(['Old Hand: 5 seasons, 40 goals, 30 assists']);
  });
});

describe('rivals', () => {
  it('the team that knocks you out of the playoffs', () => {
    const f = ended(started(), 'eliminated');
    f.season.playoffs = { round: 0, wins: 0, losses: 2, opponentId: 't-11' };
    expect(nextRivals(f)).toEqual(['t-11']);
  });

  it('a team that beats you on the map often enough', () => {
    const f = started();
    for (let n = 0; n < rules.rivalLossesToMake; n++) {
      f.season.current = null;
      f.season.strikes = 0;
      const stop = availableStops(f).find((s) => !s.elite)!;
      stop.opponentId = 't-04';
      travel(f, stop.id);
      recordGame(f, game(false));
      // Walk back so the same step can be played again.
      f.season.last = null;
      f.season.visited = [];
    }
    expect(f.season.lossesTo).toEqual({ 't-04': rules.rivalLossesToMake });
    expect(nextRivals(ended(f, 'struckOut'))).toEqual(['t-04']);
    const once = started();
    once.season.lossesTo = { 't-04': rules.rivalLossesToMake - 1 };
    expect(nextRivals(ended(once, 'struckOut'))).toEqual([]);
  });

  it('teams you knock out, and never more than the cap', () => {
    const f = ended(started(), 'champion');
    f.season.bracket = { seeds: [f.league.userTeamId, 't-12', 't-11', 't-10'], other: ['t-12', 't-11'], otherWinner: 't-12' };
    f.season.playoffs = { round: 1, wins: 2, losses: 0, opponentId: 't-12' };
    f.season.lossesTo = { 't-03': 5 };
    const rivals = nextRivals(f);
    expect(rivals).toHaveLength(rules.maxRivals);
    expect(rivals[0]).toBe('t-03');
    expect(['t-10', 't-12']).toContain(rivals[1]);
  });

  it('beating a rival on the map pays more', () => {
    const pay = (rival: boolean): number => {
      const f = started();
      const stop = availableStops(f).find((s) => !s.elite)!;
      if (rival) f.rivals = [stop.opponentId!];
      expect(isRival(f, stop.opponentId)).toBe(rival);
      travel(f, stop.id);
      recordGame(f, game(true));
      return f.season.currency;
    };
    expect(pay(true)).toBe(pay(false) + rules.rivalCurrency);
    expect(seasonRules.winCurrency).toBeGreaterThan(0);
  });
});

describe('league news', () => {
  it('before the first game it says so', () => {
    expect(leagueNews(started())).toEqual(['The season is about to begin: every team is level.']);
    const off = newFranchise(generateLeague('news'));
    expect(leagueNews(off)).toEqual([]);
  });

  it('after a round it has the leader, the scoring race and the results', () => {
    const f = started();
    travel(f, availableStops(f).find((s) => s.kind === 'game' && !s.elite)!.id);
    const opponent = currentStop(f)!.opponentId!;
    recordGame(f, game(true, 3));
    const news = leagueNews(f);
    expect(news.some((line) => /lead the league with \d+ points/.test(line))).toBe(true);
    expect(news.some((line) => /leads the league with \d+ goals?/.test(line))).toBe(true);
    expect(news.filter((line) => /\d, .* \d/.test(line)).length).toBeGreaterThanOrEqual(3);
    expect(news.join(' ')).not.toContain(teamOf(f.league, opponent).name + ' 0,');
  });

  it('names streaks and your rivals', () => {
    const f = started();
    f.rivals = ['t-06'];
    const table = f.season.standings!;
    table['t-06'] = { wins: 4, losses: 0, overtimeLosses: 0, goalsFor: 14, goalsAgainst: 4, streak: 4 };
    table['t-02'] = { wins: 0, losses: 4, overtimeLosses: 0, goalsFor: 4, goalsAgainst: 14, streak: -4 };
    const news = leagueNews(f).join(' ');
    expect(news).toMatch(/Your rivals .* are 1st with 8 points/);
    expect(news).toMatch(/have won 4 in a row/);
    expect(news).toMatch(/have lost 4 in a row/);
  });
});
