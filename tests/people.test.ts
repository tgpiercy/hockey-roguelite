import { describe, expect, it } from 'vitest';
import { closeChronicle } from '../src/core/chronicle';
import { generateLeague } from '../src/core/generate';
import { playerOf, rosterOf, userTeam } from '../src/core/league';
import { finishSeason } from '../src/core/offseason';
import { dressUser, newFranchise, recordGame, renamePlayer, startSeason, type Franchise } from '../src/core/season';
import { cleanName, nicknameFor, NICKNAME_RULES, NICKNAMES, temperamentModifiers, temperamentOf, TEMPERAMENTS } from '../src/core/temperament';
import data from '../src/data/temperaments.json';
import { ON, stepConditions, WHEN } from '../src/sim/conditions';
import type { GameResult, PlayerLine } from '../src/sim/match';
import type { Modifier } from '../src/sim/modifiers';
import { defaultSkaterRatings, skaterEffects } from '../src/sim/ratings';
import { cloneTuning } from '../src/sim/tuning';
import type { SimEvent, World } from '../src/sim/types';
import { createGame, type TeamSetup } from '../src/sim/world';
import { uniformTeam } from './harness/harness';

const t = cloneTuning();
const PERIODS = t.period.count;
const started = (seed = 'people'): Franchise => {
  const f = newFranchise(generateLeague(seed));
  startSeason(f);
  return f;
};
const line = (i: number, over: Partial<PlayerLine> = {}): PlayerLine => ({ id: i, team: 0, role: i === 6 ? 'goalie' : 'skater', line: i >= 3 && i < 6 ? 1 : 0, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0, ...over });
const game = (goalsBy: number[]): GameResult => ({ score: [Math.max(1, goalsBy.length), 0], winner: 0, finished: true, overtime: false, periods: 3, players: [0, 1, 2, 3, 4, 5, 6].map((i) => line(i, { goals: goalsBy.filter((x) => x === i).length })), powerupsUsed: [] });
const atGame = (f: Franchise): void => {
  const stops = Object.values(f.season.map!.stops).filter((s) => s.kind === 'game' && !s.elite);
  f.season.current = stops[f.season.gamesPlayed % stops.length]!.id;
  f.season.stage = 'arrived';
};

describe('temperament', () => {
  const simStats = new Set(Object.keys(skaterEffects(defaultSkaterRatings)));

  it('there are several, each with a word, a sentence, and modifiers the ice reads', () => {
    expect(TEMPERAMENTS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(TEMPERAMENTS.map((x) => x.id)).size).toBe(TEMPERAMENTS.length);
    for (const temper of TEMPERAMENTS) {
      expect(temper.name.length).toBeGreaterThan(3);
      expect(temper.describe.length).toBeGreaterThan(15);
      expect((data.weights as Record<string, number>)[temper.id], temper.id).toBeGreaterThan(0);
      for (const m of temper.modifiers) {
        expect(simStats.has(m.stat), `${temper.id}: ${m.stat}`).toBe(true);
        // Every one is conditional: a temperament never simply makes a player better.
        expect(m.when !== undefined || m.on !== undefined, temper.id).toBe(true);
        if (m.when !== undefined) expect(WHEN as readonly string[]).toContain(m.when);
        if (m.on !== undefined) {
          expect(ON as readonly string[]).toContain(m.on);
          expect(m.seconds).toBeGreaterThan(0);
        }
        // Small: within about an eighth either way.
        if (m.op === "mul") expect(Math.abs(m.value - 1)).toBeLessThanOrEqual(0.151);
      }
    }
  });

  it('a player always has the same one; goalies are steady; the league has a spread', () => {
    const f = started();
    const counts = new Map<string, number>();
    for (const p of Object.values(f.league.players)) {
      const temper = temperamentOf(p);
      expect(temperamentOf(p)).toBe(temper);
      if (p.position === 'G') expect(temper.id).toBe('steady');
      else counts.set(temper.id, (counts.get(temper.id) ?? 0) + 1);
    }
    expect(counts.size).toBe(TEMPERAMENTS.length);
    const p = Object.values(f.league.players).find((x) => x.position !== 'G' && temperamentOf(x).id !== 'steady')!;
    expect(temperamentModifiers(p).every((m) => m.label === temperamentOf(p).name)).toBe(true);
    // Age and ratings do not move it.
    expect(temperamentOf({ ...p, age: p.age + 9 } as typeof p).id).toBe(temperamentOf(p).id);
  });

  it('every dressed skater carries his own into a game', () => {
    const f = started();
    const dressed = dressUser(f)!;
    dressed.players.slice(0, 6).forEach((p, i) => {
      const own = (dressed.setup.skaterModifiers?.[i] ?? []).filter((m) => m.when !== undefined || m.on !== undefined);
      expect(own).toEqual(temperamentModifiers(p));
    });
  });
});

describe('a player with conditional modifiers of his own', () => {
  const team = (own: Modifier[]): TeamSetup => ({ ...uniformTeam(70), skaterModifiers: [own] });
  const world = (own: Modifier[]): World => createGame(t, 'own', { human: false, levels: [0.5, 0.5], teams: [team(own), uniformTeam(70)] });
  const tick = (w: World, events: SimEvent[] = []): void => stepConditions(w, events, PERIODS);

  it('a "when" of his changes him and nobody else, and only while it holds', () => {
    const w = world([{ stat: 'checkStrength', op: 'mul', value: 1.5, when: 'trailing' }]);
    const base = w.players[0]!.baseFx.checkStrength;
    tick(w);
    expect(w.players[0]!.fx.checkStrength).toBeCloseTo(base);
    w.score = [0, 1];
    tick(w);
    expect(w.players[0]!.fx.checkStrength).toBeCloseTo(base * 1.5);
    expect(w.players[1]!.fx.checkStrength).toBeCloseTo(w.players[1]!.baseFx.checkStrength);
    expect(w.players[7]!.fx.checkStrength).toBeCloseTo(w.players[7]!.baseFx.checkStrength);
    w.score = [1, 1];
    tick(w);
    expect(w.players[0]!.fx.checkStrength).toBeCloseTo(base);
  });

  it('an "on" of his starts a timed boost for him alone, which runs out', () => {
    const w = world([{ stat: 'accuracy', op: 'mul', value: 2, on: 'goalFor', seconds: 0.05 }]);
    const base = w.players[0]!.baseFx.accuracy;
    tick(w, [{ type: 'goal', side: -1, team: 1, scorer: null, assists: [] }]);
    expect(w.players[0]!.fx.accuracy).toBeCloseTo(base);
    tick(w, [{ type: 'goal', side: 1, team: 0, scorer: null, assists: [] }]);
    expect(w.players[0]!.fx.accuracy).toBeCloseTo(base * 2);
    expect(w.players[1]!.fx.accuracy).toBeCloseTo(w.players[1]!.baseFx.accuracy);
    expect(w.teams[0].boosts).toHaveLength(0);
    for (let i = 0; i < 6; i++) tick(w);
    expect(w.players[0]!.fx.accuracy).toBeCloseTo(base);
    expect(w.players[0]!.timed).toHaveLength(0);
  });

  it('a player with none plays exactly as before', () => {
    const w = world([]);
    w.score = [0, 3];
    tick(w);
    expect(w.players[0]!.fx).toEqual(w.players[0]!.baseFx);
  });
});

describe('nicknames and names', () => {
  it('a hat-trick earns a name, once, and it stays', () => {
    const f = started();
    atGame(f);
    const dressed = dressUser(f)!;
    const scorer = dressed.players[1]!;
    const outcome = recordGame(f, game([1, 1, 1, 2]), false);
    const earned = playerOf(f.league, scorer.id).nickname;
    expect(earned).toBeDefined();
    expect(NICKNAMES.hatTrick).toContain(earned);
    expect(earned).toBe(nicknameFor(scorer.id, 'hatTrick'));
    expect(outcome.ok && outcome.message).toContain(earned!);
    expect(playerOf(f.league, dressed.players[2]!.id).nickname).toBeUndefined();
    // Another hat-trick does not change it.
    atGame(f);
    recordGame(f, game([1, 1, 1]), false);
    expect(playerOf(f.league, scorer.id).nickname).toBe(earned);
  });

  it('two goals against a rival earn one too; two against anyone else do not', () => {
    const plain = started();
    atGame(plain);
    recordGame(plain, game([0, 0]), false);
    expect(playerOf(plain.league, dressUser(plain)!.players[0]!.id).nickname).toBeUndefined();

    const f = started();
    atGame(f);
    f.rivals = [f.season.map!.stops[f.season.current!]!.opponentId!];
    const id = dressUser(f)!.players[0]!.id;
    recordGame(f, game(Array.from({ length: NICKNAME_RULES.rivalGoals }, () => 0)), false);
    expect(NICKNAMES.rival).toContain(playerOf(f.league, id).nickname);
  });

  it('long service earns one at the end of a season', () => {
    const f = started();
    const id = userTeam(f.league).roster[0]!;
    f.career = { [id]: { name: playerOf(f.league, id).name, goals: 0, assists: 0, seasons: NICKNAME_RULES.veteranSeasons } };
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    const news = closeChronicle(f, new Map());
    expect(NICKNAMES.veteran).toContain(playerOf(f.league, id).nickname);
    expect(news.some((x) => x.includes(playerOf(f.league, id).nickname!))).toBe(true);
  });

  it('you can rename your own players, with a name that looks like one', () => {
    const f = started();
    const id = userTeam(f.league).roster[0]!;
    expect(renamePlayer(f, id, '  Gordie   Lafleur ').ok).toBe(true);
    expect(playerOf(f.league, id).name).toBe('Gordie Lafleur');
    for (const bad of ['', 'X', '12345', 'A name that is far too long to be a name at all', '<b>bold</b>']) {
      expect(renamePlayer(f, id, bad).ok, bad).toBe(false);
    }
    expect(playerOf(f.league, id).name).toBe('Gordie Lafleur');
    const other = f.league.teams.find((team) => team.id !== f.league.userTeamId)!.roster[0]!;
    expect(renamePlayer(f, other, 'Not Yours').ok).toBe(false);
    expect(cleanName("Jean-Luc O'Brien Jr.")).toBe("Jean-Luc O'Brien Jr.");
  });
});

describe('what a retiring veteran leaves', () => {
  /** A season just ended, with one of your skaters certain to retire after long service. */
  const ending = (talent: string | undefined): { f: Franchise; id: string } => {
    const f = started('legacy');
    const old = rosterOf(f.league, userTeam(f.league)).find((p) => p.position !== 'G')!;
    old.age = 60;
    if (talent) old.talent = talent;
    else delete old.talent;
    f.career = { [old.id]: { name: old.name, goals: 10, assists: 10, seasons: data.legacy.minSeasons } };
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    return { f, id: old.id };
  };

  it('with a talent: the youngest of your skaters without one learns it', () => {
    const { f, id } = ending('spinMove');
    for (const p of rosterOf(f.league, userTeam(f.league))) if (p.id !== id) delete p.talent;
    const youngest = rosterOf(f.league, userTeam(f.league))
      .filter((p) => p.id !== id && p.position !== 'G')
      .sort((a, b) => a.age - b.age || a.id.localeCompare(b.id))[0]!;
    expect(finishSeason(f).ok).toBe(true);
    expect(f.league.players[id]).toBeUndefined();
    expect(playerOf(f.league, youngest.id).talent).toBe('spinMove');
    expect(f.offseason.report!.news.some((x) => x.includes('learned his trick'))).toBe(true);
    expect(f.staffPool.some((s) => s.id === `legacy/${id}`)).toBe(false);
  });

  it('without one: he is on offer as a coach under his own name', () => {
    const { f, id } = ending(undefined);
    const name = playerOf(f.league, id).name;
    expect(finishSeason(f).ok).toBe(true);
    const coach = f.staffPool.find((s) => s.id === `legacy/${id}`);
    expect(coach?.name).toBe(name);
    expect(coach!.salary).toBeGreaterThan(0);
    expect(f.offseason.report!.news.some((x) => x.includes('would stay on'))).toBe(true);
  });

  it('a man of short service leaves a record and nothing more', () => {
    const { f, id } = ending('spinMove');
    f.career = { [id]: { name: 'x', goals: 0, assists: 0, seasons: 1 } };
    const talents = (): number => rosterOf(f.league, userTeam(f.league)).filter((p) => p.talent === 'spinMove' && p.id !== id).length;
    const before = talents();
    finishSeason(f);
    expect(talents()).toBe(before);
    expect(f.staffPool.some((s) => s.id.startsWith('legacy/'))).toBe(false);
  });
});

describe('what a title was won with', () => {
  it('a title marks the artifacts held with the handicap points of that season, keeping the most', () => {
    const f = started();
    f.artifacts = ['heavy-sticks', 'lucky-puck'];
    f.season.vows = { tougher: 2 };
    f.season.phase = 'ended';
    f.season.outcome = 'champion';
    closeChronicle(f, new Map());
    expect(f.wonWith).toEqual({ 'heavy-sticks': 2, 'lucky-puck': 2 });
    f.season.vows = {};
    f.artifacts = ['heavy-sticks', 'big-pads'];
    closeChronicle(f, new Map());
    expect(f.wonWith).toEqual({ 'heavy-sticks': 2, 'lucky-puck': 2, 'big-pads': 0 });
  });

  it('a season that fell short marks nothing', () => {
    const f = started();
    f.artifacts = ['heavy-sticks'];
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    closeChronicle(f, new Map());
    expect(f.wonWith ?? {}).toEqual({});
  });
});

describe('nicknames on one club', () => {
  it('a name somebody already answers to is passed over while another is left', () => {
    const all = NICKNAMES.veteran;
    const first = nicknameFor('p1', 'veteran');
    const second = nicknameFor('p1', 'veteran', [first]);
    expect(second).not.toBe(first);
    expect(all).toContain(second);
    // Every name taken: one is repeated, and the game does not stop.
    expect(all).toContain(nicknameFor('p1', 'veteran', all));
    // Nobody else has one: the same player, the same name.
    expect(nicknameFor('p1', 'veteran', [])).toBe(first);
  });

  it('there are enough for a roster of veterans', () => {
    expect(new Set(NICKNAMES.veteran).size).toBeGreaterThanOrEqual(9);
    for (const list of Object.values(NICKNAMES)) expect(new Set(list).size).toBe(list.length);
  });
});
