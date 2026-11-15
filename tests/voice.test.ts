import { describe, expect, it } from 'vitest';
import { bossInfo } from '../src/core/bosses';
import { generateLeague } from '../src/core/generate';
import { userTeam } from '../src/core/league';
import { ringerOffer } from '../src/core/ringer';
import { availableStops, newFranchise, pickArtifact, recordGame, startSeason, travel, type Franchise } from '../src/core/season';
import { announcerLine, announcerName, blanksOf, CONTEXTS, leadContext, lineFor, paperLines, paperName, pregameLine, seasonContexts, TAGLINE, THRESHOLDS, townOf, type ContextId, type VoiceFacts } from '../src/core/voice';
import bosses from '../src/data/bosses.json';
import voice from '../src/data/voice.json';
import type { GameResult } from '../src/sim/match';

const started = (seed = 'voice'): Franchise => {
  const f = newFranchise(generateLeague(seed));
  startSeason(f);
  return f;
};
const result = (won: boolean): GameResult => ({
  score: won ? [3, 1] : [1, 3],
  winner: won ? 0 : 1,
  finished: true,
  overtime: false,
  periods: 3,
  players: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: i, team: 0 as const, role: i === 6 ? ('goalie' as const) : ('skater' as const), line: (i >= 3 && i < 6 ? 1 : 0) as 0 | 1, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 })),
  powerupsUsed: [],
});
const atGame = (f: Franchise): void => {
  const stops = Object.values(f.season.map!.stops).filter((s) => s.kind === 'game' && !s.elite);
  f.season.current = stops[f.season.gamesPlayed % stops.length]!.id;
  f.season.stage = 'arrived';
};
const ids = (f: Franchise): ContextId[] => seasonContexts(f).map((c) => c.id);
/** Everything a line could ask for. */
const FULL: VoiceFacts = { team: 'Redcliff Miners', town: 'Redcliff', n: 4, rival: 'Ashdown Owls', boss: 'Greyport Wall', person: 'Anders Holm', role: 'captain', player: 'Wes Breniss', age: 36, goals: 7, nick: 'Pops', league: 'the Border League' };

describe('the paper and the announcer', () => {
  it('a town is the name of the team without its last word', () => {
    expect(townOf('Redcliff Miners')).toBe('Redcliff');
    expect(townOf('Marlow Bay Badgers')).toBe('Marlow Bay');
    expect(townOf('Owls')).toBe('Owls');
  });

  it('every club has its own paper and announcer, the same every time', () => {
    expect(paperName('Redcliff Miners')).toBe(paperName('Redcliff Miners'));
    expect(paperName('Redcliff Miners')).toMatch(/^The Redcliff \w+$/);
    expect(announcerName('Redcliff Miners')).toMatch(/^\w+ \w+$/);
    const papers = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => paperName(`${x}town Bears`).split(' ').pop()));
    expect(papers.size).toBeGreaterThan(2);
    expect(TAGLINE.length).toBeGreaterThan(10);
  });

  it('every context has at least five lines, and no line leaves a blank unfilled', () => {
    for (const id of CONTEXTS) {
      const lines = (voice.contexts as Record<string, string[]>)[id]!;
      expect(lines.length, id).toBeGreaterThanOrEqual(5);
      expect(new Set(lines).size, id).toBe(lines.length);
      for (let i = 0; i < 40; i++) {
        const line = lineFor({ id, facts: FULL }, `fill/${i}`);
        expect(line, id).not.toMatch(/[{}]/);
        // Nothing is left empty either: no doubled space, no empty quotes, no space before a full stop.
        expect(line, id).not.toMatch(/ {2}|""| [.,]/);
        expect(line.length).toBeGreaterThan(12);
        const said = announcerLine({ id, facts: FULL }, `fill/${i}`);
        expect(said).not.toMatch(/[{}]/);
        // A turn of phrase never lowers a name or a number.
        expect(said).not.toMatch(/, (wes|redcliff|ashdown|greyport)/);
      }
    }
  });

  it('the same game always gets the same line; another game may get another', () => {
    const context = { id: 'plain' as const, facts: FULL };
    expect(lineFor(context, 'a/1')).toBe(lineFor(context, 'a/1'));
    expect(new Set(Array.from({ length: 30 }, (_, i) => lineFor(context, `a/${i}`))).size).toBeGreaterThan(2);
  });
});

describe('what the season has to say', () => {
  it('there is always something, and the facts each context needs are given', () => {
    const f = started();
    const all = seasonContexts(f);
    expect(all.length).toBeGreaterThan(0);
    expect(all[all.length - 1]!.id).toBe('plain');
    for (const context of all) {
      for (const blank of blanksOf(context.id)) expect((context.facts as unknown as Record<string, unknown>)[blank], `${context.id}: ${blank}`).toBeDefined();
    }
    expect(pregameLine(f)).not.toMatch(/[{}]/);
    expect(paperLines(f).length).toBeGreaterThan(0);
  });

  it('the opener, then the streaks as results come in', () => {
    const f = started();
    expect(ids(f)).toContain('opener');
    for (let i = 0; i < THRESHOLDS.winStreak; i++) {
      atGame(f);
      recordGame(f, result(true), false);
    }
    expect(f.season.streak).toBe(THRESHOLDS.winStreak);
    expect(ids(f)).toContain('winStreak');
    expect(ids(f)).not.toContain('opener');
    expect(seasonContexts(f).find((c) => c.id === 'winStreak')!.facts.n).toBe(THRESHOLDS.winStreak);
    atGame(f);
    recordGame(f, result(false), false);
    expect(f.season.streak).toBe(-1);
    expect(ids(f)).not.toContain('winStreak');
    atGame(f);
    recordGame(f, result(false), false);
    expect(ids(f)).toContain('loseStreak');
  });

  it('the last strike, the books, a boss and a rival are each noticed, and a pressing thing leads', () => {
    const f = started();
    f.season.gamesPlayed = 4;
    f.season.strikes = 2;
    expect(ids(f)).toContain('lastStrike');
    expect(leadContext(f, 'x').id).toBe('lastStrike');
    f.season.strikes = 0;
    f.cash = THRESHOLDS.lowCash - 1;
    expect(leadContext(f, 'x').id).toBe('broke');
    f.cash = 50_000_000;

    const boss = Object.values(f.season.map!.stops).find((s) => s.kind === 'boss')!;
    f.season.current = boss.id;
    f.season.stage = 'arrived';
    const context = seasonContexts(f)[0]!;
    expect(context.id).toBe('boss');
    expect(context.facts.person).toBe(bossInfo(boss.bossId!).person.name);

    const game = Object.values(f.season.map!.stops).find((s) => s.kind === 'game' && s.opponentId)!;
    f.rivals = [game.opponentId!];
    f.season.current = game.id;
    expect(seasonContexts(f)[0]!.id).toBe('rival');
  });

  it('on a quiet night the quiet things take turns', () => {
    const f = started();
    f.season.gamesPlayed = 5;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(leadContext(f, `quiet/${i}`).id);
    for (const id of seen) expect(['hot', 'rookie', 'veteran', 'plain']).toContain(id);
    expect(seen.has('plain')).toBe(true);
  });

  it('a veteran in the lineup is named with his age', () => {
    const f = started();
    f.season.gamesPlayed = 5;
    const id = f.season.dressed[0]!;
    f.league.players[id]!.age = THRESHOLDS.veteranAge + 3;
    const context = seasonContexts(f).find((c) => c.id === 'veteran');
    expect(context?.facts.player).toBe(f.league.players[id]!.name);
    expect(context?.facts.age).toBe(THRESHOLDS.veteranAge + 3);
    expect(userTeam(f.league).roster).toContain(id);
  });
});

describe('boss clubs', () => {
  it('each has a line saying what kind of club it is, and one named player', () => {
    const names = new Set<string>();
    for (const b of bosses as unknown as { id: string; club: string; person: { role: string; name: string }; trick: string }[]) {
      expect(b.club.length, b.id).toBeGreaterThan(30);
      expect(b.person.name).toMatch(/^\S+ \S+$/);
      expect(b.person.role.length).toBeGreaterThan(3);
      // The trick already says what answers it.
      expect(b.trick.split('. ').length, b.id).toBeGreaterThanOrEqual(2);
      names.add(b.person.name);
    }
    expect(names.size).toBe(bosses.length);
  });

  it('the player of the beaten boss is the third ringer, the one that costs, with the talent of his club', () => {
    const plain = ringerOffer('label', 70);
    const withStar = ringerOffer('label', 70, { name: 'Mika Sorrel', talent: 'spinMove' });
    expect(withStar[2]!.player.name).toBe('Mika Sorrel');
    expect(withStar[2]!.player.talent).toBe('spinMove');
    expect(withStar[2]!.fee).toBeGreaterThan(0);
    expect(withStar.slice(0, 2)).toEqual(plain.slice(0, 2));
    expect(withStar[2]!.player.ratings).toEqual(plain[2]!.player.ratings);

    const f = started();
    const boss = Object.values(f.season.map!.stops).find((s) => s.kind === 'boss' && s.region === 0)!;
    f.season.current = boss.id;
    f.season.stage = 'arrived';
    recordGame(f, result(true));
    f.season.offerStickers = {};
    pickArtifact(f, f.season.offer[0]!);
    expect(f.season.ringerOffer![2]!.player.name).toBe(bossInfo(boss.bossId!).person.name);
    expect(availableStops(f)).toEqual([]);
    expect(travel(f, 'nowhere').ok).toBe(false);
  });
});

describe('the cup, the sponsor, names and leagues in the voice', () => {
  it('a cup tie waiting is noticed, and a cup run or its end is a quiet fact', () => {
    const f = started('voice-cup');
    const tie = Object.values(f.season.map!.stops).find((s) => s.cup && s.region === 0)!;
    f.season.current = tie.id;
    f.season.stage = 'arrived';
    expect(ids(f)).toContain('cupTie');
    expect(ids(f)).not.toContain('cupAlive');
    f.season.cup = { won: 2, alive: true };
    expect(seasonContexts(f).find((c) => c.id === 'cupAlive')!.facts.n).toBe(2);
    f.season.cup = { won: 1, alive: false };
    expect(ids(f)).toContain('cupOut');
    expect(ids(f)).not.toContain('cupTie');
    expect(ids(f)).not.toContain('cupAlive');
  });

  it('the sponsor is noticed one win short, and again once satisfied', () => {
    const f = started('voice-target');
    const wins = f.season.expectation!.wins;
    f.season.gamesWon = wins - 1;
    expect(ids(f)).toContain('targetNear');
    expect(ids(f)).not.toContain('targetMet');
    f.season.gamesWon = wins;
    expect(ids(f)).not.toContain('targetNear');
    expect(ids(f)).toContain('targetMet');
  });

  it('a nickname in the lineup, an old player on the staff and a shared season are each said', () => {
    const f = started('voice-people');
    expect(ids(f)).not.toContain('nickname');
    const skater = f.league.players[f.season.dressed.find((id) => f.league.players[id]!.position !== 'G')!]!;
    skater.nickname = 'Pops';
    const said = seasonContexts(f).find((c) => c.id === 'nickname')!;
    expect(said.facts).toMatchObject({ player: skater.name, nick: 'Pops' });
    f.staff.push({ id: 'legacy/old', name: 'Ben Oldhand', role: 'shooting', grade: 'C', salary: 1, contractYears: 1 });
    expect(seasonContexts(f).find((c) => c.id === 'legacy')!.facts.player).toBe('Ben Oldhand');
    f.season.coop = true;
    expect(ids(f)).toContain('twoPlayers');
  });

  it('the first nights in a new league are noticed, and not after', () => {
    const f = started('voice-league');
    f.history = [{ season: 3, outcome: 'champion', wins: 9, losses: 1, place: 1, points: 20, topScorer: null, awards: [] }];
    f.promotions = [{ season: 3, league: 'the Border League' }];
    const all = ids(f);
    expect(all).toContain('newLeague');
    expect(all.indexOf('newLeague')).toBeLessThan(all.indexOf('champions'));
    f.season.gamesPlayed = THRESHOLDS.openingGames;
    expect(ids(f)).not.toContain('newLeague');
    // A step up taken seasons ago is not news.
    f.season.gamesPlayed = 0;
    f.promotions = [{ season: 1, league: 'the Border League' }];
    expect(ids(f)).not.toContain('newLeague');
  });

  it('there are well over a hundred lines', () => {
    const total = CONTEXTS.reduce((sum, id) => sum + (voice.contexts as Record<string, string[]>)[id]!.length, 0);
    expect(total).toBeGreaterThanOrEqual(180);
  });
});
