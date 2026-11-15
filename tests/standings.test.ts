import { describe, expect, it } from 'vitest';
import { homeGame, isHomeGame } from '../src/core/economy';
import { generateLeague } from '../src/core/generate';
import { availableStops, chooseEvent, currentStop, leaveShop, newFranchise, pickArtifact, playoffSeed, recordGame, startSeason, train, travel, type Franchise, pickRinger } from '../src/core/season';
import { creditGoals, gamesPlayed, newStandings, placeOf, playoffField, playRound, points, ranked, recordResult, settleSeries, type Scoring, type Standings } from '../src/core/standings';
import { createRng } from '../src/core/rng';
import rules from '../src/data/standings.json';
import seasonRules from '../src/data/season.json';
import type { GameResult } from '../src/sim/match';

const league = generateLeague('standings');
const ids = league.teams.map((t) => t.id);
const game = (won: boolean, overtime = false, margin = 1): GameResult => ({ score: won ? [margin + 1, 1] : [1, margin + 1], winner: won ? 0 : 1, finished: true, overtime, periods: 3, players: [], powerupsUsed: [] }) as unknown as GameResult;
const started = (seed = 'standings'): Franchise => {
  const f = newFranchise(generateLeague(seed));
  expect(startSeason(f).ok).toBe(true);
  return f;
};
/** Plays the map through, winning or losing each game as told (bosses are always won). */
const playMap = (f: Franchise, win: (n: number) => boolean): void => {
  let n = 0;
  for (let guard = 0; guard < 200 && f.season.phase === 'map'; guard++) {
    if (f.season.stage === 'ringer') {
      pickRinger(f, null);
      continue;
    }
    if (f.season.stage === 'reward') {
      pickArtifact(f, f.season.offer[0]!);
      continue;
    }
    const stop = currentStop(f);
    if (stop === null) travel(f, (availableStops(f).find((s) => !s.elite) ?? availableStops(f)[0]!).id);
    else if (stop.kind === 'boss') recordGame(f, game(true));
    else if (stop.kind === 'game') recordGame(f, game(win(n++)));
    else if (stop.kind === 'training') train(f, f.season.dressed[0]!);
    else if (stop.kind === 'event') chooseEvent(f, 1);
    else leaveShop(f);
    if (f.season.strikes >= seasonRules.maxStrikes - 1) f.season.strikes = 0;
  }
};

describe('the league table', () => {
  it('starts level, with a line for every team', () => {
    const table = newStandings(league);
    expect(Object.keys(table).sort()).toEqual([...ids].sort());
    for (const row of Object.values(table)) expect(points(row)).toBe(0);
  });

  it('a win is two points, an overtime loss one, a loss none; streaks run both ways', () => {
    const table = newStandings(league);
    const [a, b] = ids as [string, string];
    recordResult(table, { home: a, away: b, homeGoals: 3, awayGoals: 2, overtime: true });
    expect(points(table[a]!)).toBe(rules.winPoints);
    expect(points(table[b]!)).toBe(rules.overtimeLossPoints);
    recordResult(table, { home: a, away: b, homeGoals: 4, awayGoals: 1, overtime: false });
    expect(table[a]).toMatchObject({ wins: 2, goalsFor: 7, goalsAgainst: 3, streak: 2 });
    expect(table[b]).toMatchObject({ losses: 1, overtimeLosses: 1, streak: -2 });
    recordResult(table, { home: b, away: a, homeGoals: 2, awayGoals: 0, overtime: false });
    expect(table[a]!.streak).toBe(-1);
    expect(table[b]!.streak).toBe(1);
    // A team that is not in the league (a boss) is ignored.
    recordResult(table, { home: a, away: '', homeGoals: 5, awayGoals: 0, overtime: false });
    expect(gamesPlayed(table[a]!)).toBe(4);
  });

  it('ranks by points, then wins, then goal difference', () => {
    const table: Standings = newStandings(league);
    const [a, b, c] = ids as [string, string, string];
    table[a] = { wins: 3, losses: 0, overtimeLosses: 0, goalsFor: 9, goalsAgainst: 3, streak: 3 };
    table[b] = { wins: 2, losses: 0, overtimeLosses: 2, goalsFor: 12, goalsAgainst: 3, streak: 1 };
    table[c] = { wins: 3, losses: 1, overtimeLosses: 0, goalsFor: 12, goalsAgainst: 3, streak: 1 };
    expect(ranked(table).slice(0, 3)).toEqual([c, a, b]);
    expect(placeOf(table, b)).toBe(3);
  });
});

describe('a round of the league', () => {
  it('every free team plays once, or all but one when the number is odd', () => {
    const table = newStandings(league);
    const scoring: Scoring = {};
    const results = playRound(league, table, scoring, 'seed', 1, [ids[0]!]);
    const free = ids.length - 1;
    expect(results).toHaveLength(Math.floor(free / 2));
    const played = ids.filter((id) => gamesPlayed(table[id]!) === 1);
    expect(played).toHaveLength(Math.floor(free / 2) * 2);
    expect(gamesPlayed(table[ids[0]!]!)).toBe(0);
    // Every goal went to somebody.
    const goals = results.reduce((sum, r) => sum + r.homeGoals + r.awayGoals, 0);
    expect(Object.values(scoring).reduce((sum, s) => sum + s.goals, 0)).toBe(goals);
  });

  it('is the same for the same seed and round, and different for another round', () => {
    const run = (round: number) => playRound(league, newStandings(league), {}, 'seed', round, []);
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('over a season the stronger teams finish higher', () => {
    const table = newStandings(league);
    for (let round = 1; round <= 40; round++) playRound(league, table, {}, 'long', round, []);
    const order = ranked(table).filter((id) => id !== league.userTeamId);
    const top = order.slice(0, 4);
    expect(top.some((id) => ['t-10', 't-11', 't-12'].includes(id))).toBe(true);
    expect(order.indexOf('t-12')).toBeLessThan(order.indexOf('t-01'));
  });

  it('goals go to dressed skaters, mostly the better shooters', () => {
    const scoring: Scoring = {};
    creditGoals(league, 't-12', 200, createRng('goals'), scoring);
    const team = league.teams.find((t) => t.id === 't-12')!;
    for (const id of Object.keys(scoring)) expect(team.roster).toContain(id);
    expect(Object.values(scoring).reduce((sum, s) => sum + s.goals, 0)).toBe(200);
    expect(Object.keys(scoring).length).toBeLessThanOrEqual(6);
  });
});

describe('your games in the table', () => {
  it('each map game of yours counts, and the rest of the league plays that round', () => {
    const f = started();
    travel(f, availableStops(f).find((s) => !s.elite)!.id);
    const opponent = currentStop(f)!.opponentId!;
    recordGame(f, game(true, false, 2));
    const table = f.season.standings!;
    expect(table[f.league.userTeamId]).toMatchObject({ wins: 1, goalsFor: 3, goalsAgainst: 1 });
    expect(table[opponent]).toMatchObject({ losses: 1 });
    expect(f.season.lastRound!.length).toBe(Math.floor((f.league.teams.length - 2) / 2));
    expect(f.season.lastRound!.some((r) => r.home === opponent || r.away === opponent)).toBe(false);
    const total = Object.values(table).reduce((sum, row) => sum + gamesPlayed(row), 0);
    expect(total).toBe(2 + f.season.lastRound!.length * 2);
  });

  it('an overtime loss is worth a point', () => {
    const f = started();
    travel(f, availableStops(f).find((s) => !s.elite)!.id);
    recordGame(f, game(false, true));
    expect(points(f.season.standings![f.league.userTeamId]!)).toBe(rules.overtimeLossPoints);
  });
});

describe('the playoff bracket', () => {
  it('the field is you and the best three AI teams, in table order', () => {
    const table = newStandings(league);
    for (let round = 1; round <= 20; round++) playRound(league, table, {}, 'field', round, [league.userTeamId]);
    const field = playoffField(table, league.userTeamId);
    expect(field).toHaveLength(rules.playoffTeams);
    expect(field).toContain(league.userTeamId);
    // You played nothing, so you are the last seed.
    expect(field[3]).toBe(league.userTeamId);
    expect(field.slice(0, 3)).toEqual(ranked(table).filter((id) => id !== league.userTeamId).slice(0, 3));
  });

  it('winning everything makes you top seed, at home for games one and three', () => {
    const f = started();
    playMap(f, () => true);
    expect(f.season.phase).toBe('playoffs');
    expect(playoffSeed(f)).toBe(1);
    const next = f.season.gamesPlayed + 1;
    expect([homeGame(f, next), homeGame(f, next + 1), homeGame(f, next + 2)]).toEqual([true, false, true]);
    expect(f.season.playoffs!.opponentId).toBe(f.season.bracket!.seeds[3]);
    expect(f.season.bracket!.other).toEqual([f.season.bracket!.seeds[1], f.season.bracket!.seeds[2]]);
  });

  it('losing most of your games makes you a low seed, on the road first', () => {
    const f = started();
    playMap(f, () => false);
    expect(f.season.phase).toBe('playoffs');
    expect(playoffSeed(f)).toBe(4);
    const next = f.season.gamesPlayed + 1;
    expect([homeGame(f, next), homeGame(f, next + 1), homeGame(f, next + 2)]).toEqual([false, true, false]);
    expect(f.season.playoffs!.opponentId).toBe(f.season.bracket!.seeds[0]);
  });

  it('games outside a series alternate as before', () => {
    const f = started();
    for (const n of [1, 2, 3, 4]) expect(homeGame(f, n)).toBe(isHomeGame(n));
  });

  it('playoff games do not change the table', () => {
    const f = started();
    playMap(f, () => true);
    const before = JSON.stringify(f.season.standings);
    recordGame(f, game(true));
    expect(JSON.stringify(f.season.standings)).toBe(before);
  });

  it('a series between two teams goes to one of them, the stronger more often', () => {
    let strong = 0;
    for (let i = 0; i < 200; i++) if (settleSeries(league, 't-12', 't-01', 2, createRng(`series-${i}`)) === 't-12') strong++;
    expect(strong).toBeGreaterThan(140);
    expect(strong).toBeLessThanOrEqual(200);
  });
});
