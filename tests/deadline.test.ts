import { describe, expect, it } from 'vitest';
import { acceptDeadline, deadlineOffers, deadlineOpen, deadlineWords } from '../src/core/deadline';
import { generateLeague } from '../src/core/generate';
import { playerOf, teamOf, userTeam } from '../src/core/league';
import { dressedSkaters } from '../src/core/lineup';
import { availableStops, chooseEvent, currentStop, leaveShop, newFranchise, pickArtifact, pickRinger, recordGame, seasonRegions, startSeason, train, travel, type Franchise } from '../src/core/season';
import { evaluateTrade, judgeTrade } from '../src/core/trades';
import { newWeekly, weekKey } from '../src/core/weekly';
import rules from '../src/data/offseason.json';
import type { GameResult, PlayerLine } from '../src/sim/match';

const line = (i: number): PlayerLine => ({ id: i, team: 0, role: i === 6 ? 'goalie' : 'skater', line: i >= 3 && i < 6 ? 1 : 0, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 });
const won: GameResult = { score: [2, 1], winner: 0, finished: true, overtime: false, periods: 3, players: [0, 1, 2, 3, 4, 5, 6].map(line), powerupsUsed: [] };

/** Deals with the stop the season is on, winning any game. */
function resolve(f: Franchise): void {
  const stop = currentStop(f);
  if (!stop) return;
  if (stop.kind === 'game' || stop.kind === 'boss') {
    if (f.season.stage === 'arrived') recordGame(f, won);
    while ((f.season.stage as string) === 'reward') {
      f.season.offerStickers = {};
      pickArtifact(f, f.season.offer[0]!);
    }
    if ((f.season.stage as string) === 'ringer') pickRinger(f, null);
  } else if (stop.kind === 'training') train(f, f.season.dressed[0]!);
  else if (stop.kind === 'event') chooseEvent(f, 0);
  else leaveShop(f);
}

/** Wins the way through the map until the deadline opens (or the map ends). */
function toDeadline(seed: string): Franchise {
  const f = newFranchise(generateLeague(seed));
  expect(startSeason(f).ok).toBe(true);
  for (let guard = 0; guard < 200 && f.season.phase === 'map' && !f.season.deadline; guard++) {
    if (f.season.current === null) travel(f, availableStops(f)[0]!.id);
    resolve(f);
  }
  return f;
}

describe('the trade deadline', () => {
  it('opens when the boss before the last region is beaten, and not before', () => {
    const f = newFranchise(generateLeague('deadline-a'));
    startSeason(f);
    expect(deadlineOpen(f)).toBe(false);
    expect(deadlineOffers(f)).toEqual([]);
    const g = toDeadline('deadline-a');
    expect(deadlineOpen(g)).toBe(true);
    // The road ahead is the last region's.
    expect(availableStops(g)[0]!.region).toBe(seasonRegions(g) - 1);
  });

  it('makes offers the other clubs would really make, each from a different club for a different player, never for your best', () => {
    let seen = 0;
    for (const seed of ['deadline-a', 'deadline-b', 'deadline-c', 'deadline-d', 'deadline-e', 'deadline-f']) {
      const f = toDeadline(seed);
      const offers = deadlineOffers(f);
      seen += offers.length;
      expect(offers.length).toBeLessThanOrEqual(rules.deadline.offers);
      expect(new Set(offers.map((o) => o.teamId)).size).toBe(offers.length);
      expect(new Set(offers.map((o) => o.mineId)).size).toBe(offers.length);
      const best = userTeam(f.league)
        .roster.map((id) => playerOf(f.league, id))
        .filter((p) => p.position !== 'G')
        .sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1))
        .slice(0, rules.deadline.keepBest)
        .map((p) => p.id);
      for (const o of offers) {
        expect(judgeTrade(f, o.mineId, o.teamId, o.theirId).ok).toBe(true);
        expect(best).not.toContain(o.mineId);
        const mine = playerOf(f.league, o.mineId);
        const theirs = playerOf(f.league, o.theirId);
        expect(mine.position).not.toBe('G');
        expect(theirs.position).not.toBe('G');
        if (o.kind === 'veteran') {
          expect(theirs.overall - mine.overall).toBeGreaterThanOrEqual(rules.deadline.veteranGain);
          expect(theirs.age).toBeGreaterThanOrEqual(rules.deadline.veteranMinAge);
        } else if (o.kind === 'prospect') {
          expect(theirs.age).toBeLessThanOrEqual(rules.deadline.prospectMaxAge);
          expect(theirs.potential).toBeGreaterThan(mine.overall);
        } else {
          expect(theirs.position).not.toBe(mine.position);
          expect(Math.abs(theirs.overall - mine.overall)).toBeLessThanOrEqual(rules.deadline.swapMaxGap);
        }
        expect(deadlineWords(o.kind).name.length).toBeGreaterThan(0);
      }
      // Asked again, the same offers: they are drawn once and kept.
      expect(deadlineOffers(f)).toBe(offers);
    }
    // Across six leagues there is something on the table.
    expect(seen).toBeGreaterThan(0);
  });

  it('the same season makes the same offers', () => {
    expect(deadlineOffers(toDeadline('deadline-b'))).toEqual(deadlineOffers(toDeadline('deadline-b')));
  });

  it('taking one swaps the two players, puts the newcomer in the other man\'s spot, sends his gear back and withdraws the rest', () => {
    for (const seed of ['deadline-a', 'deadline-b', 'deadline-c', 'deadline-d', 'deadline-e', 'deadline-f']) {
      const f = toDeadline(seed);
      const offers = deadlineOffers(f);
      if (offers.length === 0) continue;
      // Take one for a player who is dressed, if there is one, to see the spot kept.
      const team = userTeam(f.league);
      const index = Math.max(0, offers.findIndex((o) => dressedSkaters(team.lineup).includes(o.mineId)));
      const offer = offers[index]!;
      const spot = [...team.lineup.line1, ...team.lineup.line2].indexOf(offer.mineId);
      f.gear.push({ id: 'g-test', slot: 'stick', rarity: 'common', level: 1, boosts: [], perk: null, set: null, wornBy: offer.mineId } as never);
      const size = team.roster.length;
      const result = acceptDeadline(f, index);
      expect(result.ok).toBe(true);
      expect(team.roster).toContain(offer.theirId);
      expect(team.roster).not.toContain(offer.mineId);
      expect(team.roster).toHaveLength(size);
      expect(teamOf(f.league, offer.teamId).roster).toContain(offer.mineId);
      if (spot >= 0) {
        expect([...team.lineup.line1, ...team.lineup.line2][spot]).toBe(offer.theirId);
        expect(f.season.dressed).toContain(offer.theirId);
      }
      expect(f.season.dressed).not.toContain(offer.mineId);
      expect(f.gear.find((g) => g.id === 'g-test')!.wornBy).toBeNull();
      expect(deadlineOpen(f)).toBe(false);
      expect(acceptDeadline(f, 0).ok).toBe(false);
      return;
    }
    throw new Error('no league made an offer');
  });

  it('passes when the next game is played', () => {
    const f = toDeadline('deadline-a');
    for (let guard = 0; guard < 50 && f.season.deadline; guard++) {
      if (f.season.current === null) travel(f, availableStops(f).find((s) => s.kind === 'game' || s.kind === 'boss')?.id ?? availableStops(f)[0]!.id);
      resolve(f);
    }
    expect(f.season.gamesPlayed).toBeGreaterThan(0);
    expect(deadlineOpen(f)).toBe(false);
    expect(deadlineOffers(f)).toEqual([]);
  });

  it('leaves the roster locked for everything else, and a weekly run has no deadline', () => {
    const f = toDeadline('deadline-a');
    const other = f.league.teams.find((t) => t.id !== f.league.userTeamId)!;
    expect(evaluateTrade(f, userTeam(f.league).roster[0]!, other.id, other.roster[0]!).ok).toBe(false);
    const w = newWeekly(weekKey(2026, 11, 16));
    for (let guard = 0; guard < 200 && w.season.phase === 'map'; guard++) {
      if (w.season.current === null) travel(w, availableStops(w)[0]!.id);
      resolve(w);
      expect(w.season.deadline).toBeUndefined();
    }
  });
});
