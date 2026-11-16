import { describe, expect, it } from 'vitest';
import run from '../src/data/run.json';
import { generateLeague } from '../src/core/generate';
import { playerOf, userTeam } from '../src/core/league';
import { isGuest, RINGER_ID, ringerOffer, weakestSkater, withRinger } from '../src/core/ringer';
import {
  artifactInfo,
  artifactModifiers,
  availableStops,
  currentStop,
  dressUser,
  matchup,
  newFranchise,
  pickArtifact,
  pickRinger,
  recipeFor,
  recordGame,
  simulateGame,
  startSeason,
  travel,
  type Franchise,
} from '../src/core/season';
import { generateMap } from '../src/core/seasonMap';
import { afterTournamentGame, newTournament, tournamentOpponent } from '../src/core/tournament';
import { teamStrength } from '../src/core/bosses';
import artifacts from '../src/data/artifacts.json';
import events from '../src/data/events.json';
import type { GameResult, PlayerLine } from '../src/sim/match';

const fresh = (seed = 'run'): Franchise => newFranchise(generateLeague(seed));
const started = (seed = 'run'): Franchise => {
  const f = fresh(seed);
  startSeason(f);
  return f;
};
const line = (i: number, over: Partial<PlayerLine> = {}): PlayerLine => ({ id: i, team: 0, role: i === 6 ? 'goalie' : 'skater', line: i >= 3 && i < 6 ? 1 : 0, slot: i === 6 ? 0 : i % 3, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0, ...over });
const game = (score: [number, number], lines: Partial<PlayerLine>[] = [], more: Partial<GameResult> = {}): GameResult => ({
  score,
  winner: score[0] > score[1] ? 0 : 1,
  finished: true,
  overtime: false,
  periods: 3,
  players: [0, 1, 2, 3, 4, 5, 6].map((i) => line(i, lines[i] ?? {})),
  powerupsUsed: [],
  ...more,
});
const toGame = (f: Franchise): void => {
  const stop = availableStops(f).find((s) => s.kind === 'game' && !s.elite)!;
  delete stop.rink;
  travel(f, stop.id);
};
const toBoss = (f: Franchise): void => {
  const boss = Object.values(f.season.map!.stops).find((s) => s.kind === 'boss' && s.region === 0)!;
  f.season.current = boss.id;
  f.season.stage = 'arrived';
};
const RINGER = run.ringer;
const UNSEEN_WEIGHT = run.unseenWeight;

describe('the ringer', () => {
  it('three are offered, each a skater with a talent, better than your team; the last is the best and the one that costs', () => {
    const offer = ringerOffer('label', 70);
    expect(offer).toHaveLength(RINGER.offers);
    expect(ringerOffer('label', 70)).toEqual(offer);
    for (const r of offer) {
      expect(r.player.id).toBe(RINGER_ID);
      expect(r.player.position).not.toBe('G');
      expect(r.player.talent).toBeDefined();
      expect(r.player.capHit).toBe(0);
      expect(r.player.overall).toBeGreaterThan(70);
    }
    const last = offer[offer.length - 1]!;
    expect(last.fee).toBe(RINGER.fee);
    expect(offer.slice(0, -1).every((r) => r.fee === 0 && r.player.overall < last.player.overall)).toBe(true);
    expect(isGuest(RINGER_ID)).toBe(true);
    expect(isGuest('p12')).toBe(false);
  });

  const beaten = (): Franchise => {
    const f = started();
    toBoss(f);
    recordGame(f, game([3, 1]));
    pickArtifact(f, f.season.offer[0]!);
    return f;
  };

  it('is offered after a boss and his artifact; declining changes nothing', () => {
    const f = beaten();
    expect(f.season.stage).toBe('ringer');
    expect(f.season.ringerOffer).toHaveLength(RINGER.offers);
    expect(matchup(f)).toBeNull();
    expect(pickRinger(f, 9).ok).toBe(false);
    const dressed = dressUser(f)!.players.map((p) => p.id);
    expect(pickRinger(f, null).ok).toBe(true);
    expect(f.season.ringer).toBeUndefined();
    expect(f.season.stage).toBe('none');
    expect(dressUser(f)!.players.map((p) => p.id)).toEqual(dressed);
    expect(pickRinger(f, 0).ok).toBe(false);
  });

  it('once hired he plays in your lowest-rated dressed skater\'s place, and is on nobody\'s roster', () => {
    const f = beaten();
    const before = dressUser(f)!;
    const slot = weakestSkater(before);
    const hired = f.season.ringerOffer![0]!;
    expect(pickRinger(f, 0).ok).toBe(true);
    const after = dressUser(f)!;
    expect(after.players[slot]!.id).toBe(RINGER_ID);
    expect(after.players.filter((p) => p.id === RINGER_ID)).toHaveLength(1);
    expect(after.setup.skaters[slot]).toEqual(hired.player.ratings);
    expect(after.setup.skaterTalents?.[slot]).toEqual([hired.player.talent]);
    expect(after.players[6]).toBe(before.players[6]);
    expect(userTeam(f.league).roster).not.toContain(RINGER_ID);
    expect(f.league.players[RINGER_ID]).toBeUndefined();
    expect(withRinger(before, hired).players[slot]!.name).toBe(hired.player.name);
  });

  it('he earns no XP, counts toward no milestone or scoring table, and the pricey one costs Pucks a game', () => {
    const f = beaten();
    const pricey = f.season.ringerOffer!.length - 1;
    pickRinger(f, pricey);
    toGame(f);
    const slot = dressUser(f)!.players.findIndex((p) => p.id === RINGER_ID);
    f.season.currency = 100;
    recordGame(f, game([3, 0], Array.from({ length: 7 }, (_, i) => (i === slot ? { goals: 3 } : {}))), false);
    expect(f.season.xp[RINGER_ID]).toBeUndefined();
    expect(f.season.playerGoals[RINGER_ID]).toBeUndefined();
    expect(f.season.scoring?.[RINGER_ID]).toBeUndefined();
    expect(f.season.hatTrick).toBe(false);
    // 100, plus what the win paid, less his fee.
    const free = beaten();
    pickRinger(free, 0);
    toGame(free);
    free.season.currency = 100;
    recordGame(free, game([3, 0]), false);
    expect(free.season.currency - f.season.currency).toBe(RINGER.fee);
  });

  it('is gone when the next season starts', () => {
    const f = beaten();
    pickRinger(f, 0);
    f.season.phase = 'offseason';
    f.offseason.leagueMoved = true;
    expect(startSeason(f).ok).toBe(true);
    expect(f.season.ringer).toBeUndefined();
    expect(dressUser(f)!.players.some((p) => p.id === RINGER_ID)).toBe(false);
    for (const id of userTeam(f.league).roster) expect(playerOf(f.league, id)).toBeDefined();
  });
});

describe('recipes', () => {
  const list = artifacts as unknown as { id: string; recipe?: [string, string]; modifiers: unknown[] }[];
  const made = list.filter((a) => a.recipe);

  it('there are five, each made from two artifacts that exist and can be offered', () => {
    expect(made.length).toBeGreaterThanOrEqual(5);
    for (const a of made) {
      for (const part of a.recipe!) {
        const piece = list.find((x) => x.id === part);
        expect(piece, `${a.id}: ${part}`).toBeDefined();
        expect(piece!.recipe).toBeUndefined();
      }
      expect(recipeFor(a.recipe![0])).toEqual({ partner: a.recipe![1], makes: a.id });
    }
    expect(recipeFor('glass-cannon')).toBeNull();
  });

  it('holding both halves makes the third and takes the two away; a result is never offered', () => {
    const f = started();
    toBoss(f);
    recordGame(f, game([3, 1]));
    const recipe = made[0]!;
    f.artifacts = [recipe.recipe![0]];
    f.season.offer = [recipe.recipe![1], 'glass-cannon'];
    pickArtifact(f, recipe.recipe![1]);
    expect(f.artifacts).toEqual([recipe.id]);
    expect(artifactModifiers(f)).toEqual(artifactInfo(recipe.id).modifiers);
    for (let i = 0; i < 60; i++) {
      const g = started(`offer-${i}`);
      toBoss(g);
      recordGame(g, game([3, 1]));
      for (const id of g.season.offer) expect(made.map((a) => a.id)).not.toContain(id);
    }
  });
});

describe('unseen first', () => {
  it('an artifact you have held and an event you have met are remembered', () => {
    const f = started();
    toBoss(f);
    recordGame(f, game([3, 1]));
    const id = f.season.offer[0]!;
    pickArtifact(f, id);
    expect(f.seen?.artifacts).toContain(id);
  });

  it('artifacts you have never held are offered about three times as often as ones you have', () => {
    const offerable = (artifacts as unknown as { id: string; recipe?: string[] }[]).filter((a) => !a.recipe).map((a) => a.id);
    const seen = offerable.slice(0, Math.floor(offerable.length / 2));
    let seenShown = 0;
    let unseenShown = 0;
    for (let i = 0; i < 400; i++) {
      const f = started(`unseen-${i}`);
      f.seen = { artifacts: [...seen], events: [] };
      toBoss(f);
      recordGame(f, game([3, 1]));
      for (const id of f.season.offer) {
        if (seen.includes(id)) seenShown++;
        else unseenShown++;
      }
    }
    const perSeen = seenShown / seen.length;
    const perUnseen = unseenShown / (offerable.length - seen.length);
    expect(perUnseen / perSeen).toBeGreaterThan(UNSEEN_WEIGHT * 0.6);
    expect(perUnseen / perSeen).toBeLessThan(UNSEEN_WEIGHT * 1.5);
  });

  it('with nothing seen, or everything, the offer is the one it always was', () => {
    const offerable = (artifacts as unknown as { id: string; recipe?: string[] }[]).filter((a) => !a.recipe).map((a) => a.id);
    const offerOf = (seen: string[] | null): string[] => {
      const f = started('same');
      if (seen) f.seen = { artifacts: seen, events: [] };
      toBoss(f);
      recordGame(f, game([3, 1]));
      return f.season.offer;
    };
    expect(offerOf([])).toEqual(offerOf(null));
    expect(offerOf(offerable)).toEqual(offerOf(null));
  });

  it('events you have not met come before ones you have on a new map', () => {
    const teams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const all = (events as unknown as { id: string }[]).map((e) => e.id);
    const plain = generateMap('events', teams);
    expect(generateMap('events', teams, undefined, [])).toEqual(plain);
    const onMap = Object.values(plain.stops).filter((s) => s.eventId).map((s) => s.eventId!);
    // Having met every event on that map, a new map from the same seed uses others first.
    if (onMap.length < all.length) {
      const next = generateMap('events', teams, undefined, onMap);
      const first = Object.values(next.stops).find((s) => s.eventId)!;
      expect(onMap).not.toContain(first.eventId);
    }
    expect(currentStop(started())).toBeNull();
  });
});

describe('the exhibition tournament', () => {
  it('is you and the three teams nearest your strength; you meet the weakest first, and the other game is settled', () => {
    const f = fresh('cup');
    const before = JSON.stringify(f);
    const t = newTournament(f.league, 'seed')!;
    expect(newTournament(f.league, 'seed')).toEqual(t);
    const field = [t.semi, ...t.others];
    expect(new Set(field).size).toBe(3);
    expect(field).not.toContain(f.league.userTeamId);
    expect(t.others).toContain(t.finalist);
    expect(teamStrength(f.league, t.semi)).toBeLessThanOrEqual(Math.min(...t.others.map((id) => teamStrength(f.league, id))));
    // The three nearest: nobody left out is closer to you than the furthest of them.
    const mine = teamStrength(f.league, f.league.userTeamId);
    const gap = (id: string): number => Math.abs(teamStrength(f.league, id) - mine);
    const furthest = Math.max(...field.map(gap));
    for (const team of f.league.teams) if (team.id !== f.league.userTeamId && !field.includes(team.id)) expect(gap(team.id)).toBeGreaterThanOrEqual(furthest);
    expect(JSON.stringify(f)).toBe(before);
  });

  it('a win moves you on, then wins it; a loss at either stage puts you out', () => {
    const t = newTournament(fresh('cup').league, 'seed')!;
    expect(tournamentOpponent(t)).toBe(t.semi);
    const final = afterTournamentGame(t, true);
    expect(final.stage).toBe('final');
    expect(tournamentOpponent(final)).toBe(t.finalist);
    expect(afterTournamentGame(final, true).stage).toBe('won');
    expect(afterTournamentGame(final, false).stage).toBe('out');
    expect(afterTournamentGame(t, false).stage).toBe('out');
    expect(tournamentOpponent(afterTournamentGame(final, true))).toBeNull();
    expect(afterTournamentGame(afterTournamentGame(t, false), true).stage).toBe('out');
  });
});
