import { describe, expect, it } from 'vitest';
import { BOUNTIES, BOUNTY_KINDS, bountyFor, bountyMet, RINGER, STICKERS, UNSEEN_WEIGHT, type BountyInfo } from '../src/core/bounty';
import { generateLeague } from '../src/core/generate';
import { playerOf, userTeam } from '../src/core/league';
import { isGuest, RINGER_ID, ringerOffer, weakestSkater, withRinger } from '../src/core/ringer';
import {
  artifactInfo,
  artifactModifiers,
  availableStops,
  currentStop,
  dressUser,
  gameBounty,
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
const bounty = (id: string): BountyInfo => BOUNTIES.find((b) => b.id === id)!;

describe('bounties', () => {
  it('there are about ten, each of a kind the game can judge', () => {
    expect(BOUNTIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(BOUNTIES.map((b) => b.id)).size).toBe(BOUNTIES.length);
    for (const b of BOUNTIES) {
      expect(BOUNTY_KINDS as readonly string[], b.id).toContain(b.kind);
      expect(b.pucks).toBeGreaterThan(0);
      expect(b.text.length).toBeGreaterThan(8);
    }
  });

  it('each is met by a game that does it and missed by one that does not', () => {
    const f = started();
    toGame(f);
    const home = matchup(f)!.home;
    const defence = home.players.findIndex((p, i) => i < 6 && p.position === 'D');
    const forward = home.players.findIndex((p, i) => i < 6 && p.position === 'F');
    const withGoal = (index: number): Partial<PlayerLine>[] => Array.from({ length: 7 }, (_, i) => (i === index ? { goals: 1 } : {}));
    const cases: [string, GameResult, GameResult][] = [
      ['winBy3', game([4, 1]), game([3, 1])],
      ['shutout', game([1, 0]), game([3, 1])],
      ['defenceGoal', game([1, 0], withGoal(defence)), game([1, 0], withGoal(forward))],
      ['hits', game([1, 0], [{ hits: 5 }, { hits: 3 }]), game([1, 0], [{ hits: 7 }])],
      ['shots', game([1, 0], [{ shots: 20 }, { shots: 15 }]), game([1, 0], [{ shots: 34 }])],
      ['blocks', game([1, 0], [{ blocks: 3 }]), game([1, 0], [{ blocks: 2 }])],
      ['assists', game([3, 0], [{ assists: 3 }, { assists: 2 }]), game([3, 0], [{ assists: 4 }])],
      ['scorers', game([3, 0], [{ goals: 1 }, { goals: 1 }, { goals: 1 }]), game([3, 0], [{ goals: 2 }, { goals: 1 }])],
      ['lastPeriod', game([2, 1], [], { periodScores: [[1, 0], [1, 1], [2, 1]] }), game([2, 1], [], { periodScores: [[1, 0], [2, 1], [2, 1]] })],
      ['comeback', game([2, 1], [], { periodScores: [[0, 1], [1, 1], [2, 1]] }), game([2, 1], [], { periodScores: [[1, 0], [1, 1], [2, 1]] })],
    ];
    expect(cases.map((c) => c[0]).sort()).toEqual(BOUNTIES.map((b) => b.id).sort());
    for (const [id, met, missed] of cases) {
      expect(bountyMet(bounty(id), met, home), `${id}: met`).toBe(true);
      expect(bountyMet(bounty(id), missed, home), `${id}: missed`).toBe(false);
      expect(bountyMet(bounty(id), { ...met, forfeit: true }, home), `${id}: forfeit`).toBe(false);
    }
  });

  it('a game has one, fixed by the season and the game; first-to-three games get none that need periods', () => {
    expect(bountyFor('a/1', true)).toEqual(bountyFor('a/1', true));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(bountyFor(`s/${i}`, true).id);
      expect(bountyFor(`s/${i}`, false).needsPeriods ?? false).toBe(false);
    }
    expect(seen.size).toBe(BOUNTIES.length);
    const f = started();
    expect(gameBounty(f)).toBeNull();
    toGame(f);
    expect(gameBounty(f)).not.toBeNull();
  });

  it('meeting it in a game you play pays its Pucks, once; missing it costs nothing; a simulated game has none', () => {
    const met = started();
    toGame(met);
    const b = gameBounty(met)!;
    // A result that meets every bounty at once, and one that meets none, with the same score.
    const all = game([5, 0], [{ goals: 2, assists: 2, shots: 20, hits: 4, blocks: 2 }, { goals: 1, assists: 2, shots: 10, hits: 4, blocks: 1 }, { goals: 1, assists: 1, shots: 5 }, { goals: 1 }, {}, {}], { periodScores: [[0, 0], [0, 0], [5, 0]] });
    const home = matchup(met)!.home;
    // Make sure a defenceman scored whatever the lineup is.
    const defence = home.players.findIndex((p, i) => i < 6 && p.position === 'D');
    all.players[defence]!.goals = Math.max(1, all.players[defence]!.goals);
    const outcome = recordGame(met, all);
    const none = started();
    toGame(none);
    recordGame(none, { ...game([5, 0]), periodScores: [[5, 0], [5, 0], [5, 0]] });
    if (bountyMet(b, { ...game([5, 0]), periodScores: [[5, 0], [5, 0], [5, 0]] }, home)) return; // this seed's bounty is met by any 5-0 win
    expect(outcome.rewards?.bounty).toEqual({ text: b.text, pucks: b.pucks, met: true });
    expect(met.season.currency - none.season.currency).toBe(b.pucks);

    const sim = started();
    toGame(sim);
    const simmed = simulateGame(sim);
    expect(simmed.rewards?.bounty).toBeUndefined();
  });
});

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
    f.season.offerStickers = {};
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

describe('stickers', () => {
  const offered = (sticker: 'loan' | 'pricey'): { f: Franchise; id: string } => {
    const f = started();
    toBoss(f);
    recordGame(f, game([3, 1]));
    const id = f.season.offer[0]!;
    f.season.offerStickers = { [id]: sticker };
    return { f, id };
  };

  it('about one offer in five carries one', () => {
    let stuck = 0;
    let total = 0;
    for (let i = 0; i < 150; i++) {
      const f = started(`stick-${i}`);
      toBoss(f);
      recordGame(f, game([3, 1]));
      total += f.season.offer.length;
      stuck += Object.keys(f.season.offerStickers ?? {}).length;
      for (const id of Object.keys(f.season.offerStickers ?? {})) expect(f.season.offer).toContain(id);
    }
    expect(stuck / total).toBeGreaterThan(STICKERS.chance - 0.07);
    expect(stuck / total).toBeLessThan(STICKERS.chance + 0.07);
  });

  it('a loan comes with Pucks and goes back after its games', () => {
    const { f, id } = offered('loan');
    const before = f.season.currency;
    pickArtifact(f, id);
    expect(f.season.currency - before).toBe(STICKERS.loanPucks);
    expect(f.season.loans).toEqual({ [id]: STICKERS.loanGames });
    pickRinger(f, null);
    const games = Object.values(f.season.map!.stops).filter((x) => x.kind === 'game' && !x.elite);
    for (let i = 0; i < STICKERS.loanGames; i++) {
      expect(f.artifacts).toContain(id);
      // Stand at an ordinary game, wherever it is on the map, and win it.
      f.season.current = games[i]!.id;
      f.season.stage = 'arrived';
      recordGame(f, game([3, 1]), false);
    }
    expect(f.artifacts).not.toContain(id);
    expect(f.season.loans).toEqual({});
  });

  it('a pricey one gives a second pick from the same offer, and costs Pucks after every game', () => {
    const { f, id } = offered('pricey');
    const rest = f.season.offer.filter((x) => x !== id);
    expect(pickArtifact(f, id).ok).toBe(true);
    expect(f.season.stage).toBe('reward');
    expect(f.season.offer).toEqual(rest);
    expect(f.season.offerStickers).toEqual({});
    expect(pickArtifact(f, rest[0]!).ok).toBe(true);
    expect(f.artifacts).toEqual(expect.arrayContaining([id, rest[0]!]));
    pickRinger(f, null);
    toGame(f);
    f.season.currency = 50;
    const plain = started();
    toGame(plain);
    plain.season.currency = 50;
    plain.artifacts = [...f.artifacts];
    recordGame(f, game([3, 1]), false);
    recordGame(plain, game([3, 1]), false);
    expect(plain.season.currency - f.season.currency).toBe(STICKERS.priceyFee);
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
    f.season.offerStickers = {};
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

  it('a half that is only on loan does not combine', () => {
    const f = started();
    toBoss(f);
    recordGame(f, game([3, 1]));
    const recipe = made[0]!;
    f.artifacts = [recipe.recipe![0]];
    f.season.loans = { [recipe.recipe![0]]: 2 };
    f.season.offer = [recipe.recipe![1]];
    f.season.offerStickers = {};
    pickArtifact(f, recipe.recipe![1]);
    expect(f.artifacts).toEqual([recipe.recipe![0], recipe.recipe![1]]);
  });
});

describe('unseen first', () => {
  it('an artifact you have held and an event you have met are remembered', () => {
    const f = started();
    toBoss(f);
    recordGame(f, game([3, 1]));
    f.season.offerStickers = {};
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
