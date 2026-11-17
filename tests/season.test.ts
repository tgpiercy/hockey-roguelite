import { describe, expect, it } from 'vitest';
import { decideContract, finishSeason } from '../src/core/offseason';
import { bossLossEnds, DIFFICULTIES, difficultyInfo, abandonSeason, pickRinger } from '../src/core/season';
import { seasonSummary } from '../src/core/seasonSummary';
import { aiTeamsByStrength, buildBoss, teamStrength } from '../src/core/bosses';
import { generateLeague } from '../src/core/generate';
import { skatersOn, userTeam } from '../src/core/league';
import { dressedSkaters } from '../src/core/lineup';
import { fromSave, parseSave, SAVE_VERSION, toSave, franchiseOf } from '../src/core/save';
import {
  artifactInfo,
  availableStops,
  buy,
  chooseEvent,
  currentStop,
  dressUser,
  endSeason,
  eventInfo,
  healPrice,
  healStrike,
  leaveShop,
  matchup,
  newFranchise,
  pickArtifact,
  powerupInfo,
  recordGame,
  rosterLocked,
  setLoadout,
  setSeasonLineupSlot,
  shopPrice,
  startSeason,
  teamModifiers,
  train,
  travel,
  type EventEffect,
  type Franchise,
} from '../src/core/season';
import { generateMap, type SeasonMap, type Stop, type StopKind } from '../src/core/seasonMap';
import artifacts from '../src/data/artifacts.json';
import bosses from '../src/data/bosses.json';
import events from '../src/data/events.json';
import powerups from '../src/data/powerups.json';
import rules from '../src/data/season.json';
import { forfeitResult, type GameResult } from '../src/sim/match';
import { goalieEffects, skaterEffects, defaultGoalieRatings, defaultSkaterRatings } from '../src/sim/ratings';

const fresh = (seed = 'season-test'): Franchise => newFranchise(generateLeague(seed));
const started = (seed = 'season-test'): Franchise => {
  const f = fresh(seed);
  expect(startSeason(f).ok).toBe(true);
  return f;
};

const result = (won: boolean, margin = 1, used: string[] = [], overtime = false): GameResult => ({
  score: won ? [margin, 0] : [0, margin],
  winner: won ? 0 : 1,
  finished: true,
  overtime,
  periods: 3,
  players: [],
  powerupsUsed: used,
});

/** Travels to the first available stop of a kind, searching forward along any path. */
const goTo = (f: Franchise, kind: StopKind): Stop => {
  const stop = availableStops(f).find((s) => s.kind === kind);
  if (!stop) throw new Error(`no ${kind} stop available: ${availableStops(f).map((s) => s.kind).join(',')}`);
  // These tests are about the usual game: a stop's own rink (and its extra pay) is tested in rinks.test.ts.
  delete stop.rink;
  expect(travel(f, stop.id).ok).toBe(true);
  return stop;
};

/** Deals with whatever stop the season is on in the simplest way; games are won or lost as told. */
const resolve = (f: Franchise, win: boolean): void => {
  const stop = currentStop(f);
  if (!stop) return;
  if (stop.kind === 'game' || stop.kind === 'boss') {
    while ((f.season.stage as string) === 'reward') {
      pickArtifact(f, f.season.offer[0]!);
    }
    if ((f.season.stage as string) === 'ringer') pickRinger(f, null);
    else {
      recordGame(f, result(win));
      // Beating a boss moves the stage on to the artifact pick.
      while ((f.season.stage as string) === 'reward') {
      pickArtifact(f, f.season.offer[0]!);
    }
      if ((f.season.stage as string) === 'ringer') pickRinger(f, null);
    }
  } else if (stop.kind === 'training') train(f, f.season.dressed[0]!);
  else if (stop.kind === 'event') chooseEvent(f, 0);
  else leaveShop(f);
};

/** Plays the map through, winning every game, until the playoffs begin. */
const winTheMap = (f: Franchise): void => {
  for (let guard = 0; guard < 200 && f.season.phase === 'map'; guard++) {
    if (f.season.current === null) travel(f, availableStops(f)[0]!.id);
    resolve(f, true);
  }
};

describe('season map', () => {
  const league = generateLeague('map-test');
  const order = aiTeamsByStrength(league);
  const map = generateMap('map-seed', order);
  const stops = Object.values(map.stops);

  it('is the same from the same seed and different from another', () => {
    expect(generateMap('map-seed', order)).toEqual(map);
    expect(generateMap('other-seed', order)).not.toEqual(map);
  });

  it('each region follows the pattern: game, stop, game, stop, boss, with a choice at every step but the boss', () => {
    expect(map.regionStarts).toHaveLength(rules.regions);
    for (let region = 0; region < rules.regions; region++) {
      rules.steps.forEach((pattern, step) => {
        const row = stops.filter((s) => s.region === region && s.step === step);
        if (pattern === 'boss') {
          expect(row.map((s) => s.kind)).toEqual(['boss']);
        } else {
          expect(row).toHaveLength(rules.choicesPerStep);
          for (const s of row) {
            if (pattern === 'game') expect(s.kind).toBe('game');
            else expect(rules.stopKinds).toContain(s.kind);
          }
          if (pattern === 'stop') expect(new Set(row.map((s) => s.kind)).size).toBe(row.length);
        }
      });
    }
  });

  const pathsFrom = (m: SeasonMap, id: string): string[][] => {
    const stop = m.stops[id]!;
    if (stop.next.length === 0) return [[id]];
    return stop.next.flatMap((next) => pathsFrom(m, next).map((path) => [id, ...path]));
  };

  it('every path from every start reaches the boss, through 2 games on the way', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const m = generateMap(seed, order);
      for (const starts of m.regionStarts) {
        for (const start of starts) {
          const paths = pathsFrom(m, start);
          expect(paths.length).toBeGreaterThan(0);
          for (const path of paths) {
            const kinds = path.map((id) => m.stops[id]!.kind);
            expect(kinds[kinds.length - 1]).toBe('boss');
            expect(kinds.filter((k) => k === 'game')).toHaveLength(2);
            expect(path).toHaveLength(rules.steps.length);
          }
        }
      }
    }
  });

  it('no stop is unreachable', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const m = generateMap(seed, order);
      const reachable = new Set(m.regionStarts.flat());
      for (const starts of m.regionStarts) for (const start of starts) for (const path of pathsFrom(m, start)) for (const id of path) reachable.add(id);
      expect([...reachable].sort()).toEqual(Object.keys(m.stops).sort());
    }
  });

  it('opponents get stronger by region; game stops name a league team, events an event, shops have stock', () => {
    const tier = (region: number): number =>
      stops.filter((s) => s.region === region && s.kind === 'game').reduce((sum, s) => sum + teamStrength(league, s.opponentId!), 0);
    expect(tier(0)).toBeLessThan(tier(1));
    expect(tier(1)).toBeLessThan(tier(2));
    for (const s of stops) {
      if (s.kind === 'game') expect(order).toContain(s.opponentId);
      if (s.kind === 'event') expect(events.map((e) => e.id)).toContain(s.eventId);
      if (s.kind === 'boss') expect(bosses.map((b) => b.id)).toContain(s.bossId);
      if (s.kind === 'shop') {
        expect(s.stock).toHaveLength(rules.shopItems);
        expect(new Set(s.stock).size).toBe(rules.shopItems);
      }
    }
    expect(new Set(stops.filter((s) => s.kind === 'boss').map((s) => s.bossId)).size).toBe(rules.regions);
    const eventIds = stops.filter((s) => s.kind === 'event').map((s) => s.eventId);
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });
});

describe('content', () => {
  it('has at least 15 events, 10 powerups, 12 artifacts and 3 bosses, with unique ids', () => {
    expect(events.length).toBeGreaterThanOrEqual(15);
    expect(powerups.length).toBeGreaterThanOrEqual(10);
    expect(artifacts.length).toBeGreaterThanOrEqual(12);
    expect(bosses.length).toBeGreaterThanOrEqual(3);
    for (const list of [events, powerups, artifacts, bosses]) expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
  });

  const simStats = new Set([...Object.keys(skaterEffects(defaultSkaterRatings)), ...Object.keys(goalieEffects(defaultGoalieRatings))]);
  const seasonStats = new Set(['currencyGain', 'shopPrice', 'trainingBonus', 'powerupDropChance', 'eliteGain', 'eliteBump', 'cupGain', 'bountyGain', 'bossInsurance']);
  const validModifier = (m: { stat: string; op: string; value: number }, allowSeason: boolean): void => {
    expect(['add', 'mul']).toContain(m.op);
    expect(Number.isFinite(m.value)).toBe(true);
    expect(simStats.has(m.stat) || (allowSeason && seasonStats.has(m.stat))).toBe(true);
  };

  it('every powerup is a timed boost with real stats, or an instant effect', () => {
    for (const p of powerups as unknown as { name: string; description: string; price: number; seconds?: number; modifiers?: { stat: string; op: string; value: number }[]; effect?: string }[]) {
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.description.length).toBeGreaterThan(10);
      expect(p.price).toBeGreaterThan(0);
      if (p.effect) {
        expect(['restoreLineEnergy', 'restoreBenchEnergy', 'restoreAllEnergy', 'fillHeat']).toContain(p.effect);
      } else {
        expect(p.seconds).toBeGreaterThan(0);
        expect(p.modifiers!.length).toBeGreaterThan(0);
        for (const m of p.modifiers!) validModifier(m, false);
      }
    }
  });

  it('every artifact and boss trait changes a stat that something reads', () => {
    for (const a of artifacts) for (const m of a.modifiers) validModifier(m, true);
    for (const b of bosses) for (const m of b.modifiers) validModifier(m, false);
  });

  it('every event has text, at least two choices, and outcomes with valid effects', () => {
    for (const event of events) {
      expect(event.title.length).toBeGreaterThan(3);
      expect(event.text.length).toBeGreaterThan(30);
      expect(event.choices.length).toBeGreaterThanOrEqual(2);
      for (const choice of event.choices) {
        expect(choice.label.length).toBeGreaterThan(2);
        expect(choice.outcomes.length).toBeGreaterThan(0);
        for (const outcome of choice.outcomes) {
          expect(outcome.result.length).toBeGreaterThan(5);
          for (const effect of outcome.effects as EventEffect[]) {
            expect(['currency', 'powerup', 'losePowerup', 'strike', 'bump', 'temp', 'scout', 'skillPoint', 'artifact']).toContain(effect.type);
            if (effect.type === 'temp') {
              expect(effect.games).toBeGreaterThan(0);
              for (const m of effect.modifiers) validModifier(m, false);
            }
            if (effect.type === 'bump') expect(['random', 'best', 'worst', 'all']).toContain(effect.who);
          }
        }
      }
    }
  });

  it('every choice of every event can be taken without breaking the season', () => {
    for (const event of events) {
      event.choices.forEach((_, index) => {
        for (const seed of ['x', 'y', 'z']) {
          const f = started(`events-${seed}`);
          f.season.currency = 50;
          f.season.strikes = 1;
          // Stand on an event stop and make it this event.
          winToEvent(f);
          currentStop(f)!.eventId = event.id;
          const outcome = chooseEvent(f, index);
          expect(outcome.ok).toBe(true);
          expect(outcome.ok && outcome.message.length).toBeGreaterThan(5);
          expect(f.season.currency).toBeGreaterThanOrEqual(0);
          expect(f.season.strikes).toBeGreaterThanOrEqual(0);
          expect(f.season.strikes).toBeLessThan(rules.maxStrikes);
          expect(f.season.current).toBe(null);
          expect(eventInfo(event.id).title).toBe(event.title);
        }
      });
    }
  });
});

/** Walks forward (winning games) until standing on an event stop. Tries other branches by seed if needed. */
function winToEvent(f: Franchise): void {
  for (let guard = 0; guard < 60; guard++) {
    const options = availableStops(f);
    const event = options.find((s) => s.kind === 'event');
    if (event) {
      travel(f, event.id);
      return;
    }
    // Prefer a stop that leads to an event next.
    const map = f.season.map!;
    const toward = options.find((s) => s.next.some((id) => map.stops[id]!.kind === 'event')) ?? options[0]!;
    travel(f, toward.id);
    resolve(f, true);
  }
  throw new Error('no event stop found');
}

describe('starting a season', () => {
  it('locks in the dressed seven, builds the map and hands out a starting powerup', () => {
    const f = fresh();
    const team = userTeam(f.league);
    const dressed = [...dressedSkaters(team.lineup), team.lineup.goalie];
    expect(rosterLocked(f)).toBe(false);
    expect(startSeason(f)).toMatchObject({ ok: true });
    expect(f.season.phase).toBe('map');
    expect(f.season.dressed).toEqual(dressed);
    expect(f.season.powerups).toHaveLength(rules.startingPowerups);
    expect(rosterLocked(f)).toBe(true);
    expect(availableStops(f).map((s) => s.kind)).toEqual(['game', 'game']);
    expect(startSeason(f).ok).toBe(false);
  });

  it('is refused without a legal lineup', () => {
    const f = fresh();
    userTeam(f.league).lineup.goalie = null;
    expect(startSeason(f).ok).toBe(false);
    expect(f.season.phase).toBe('offseason');
  });

  it('the same franchise always gets the same map for the same season number', () => {
    expect(started().season.map).toEqual(started().season.map);
  });

  it('during the season the dressed skaters can swap spots', () => {
    const f = started();
    const team = userTeam(f.league);
    const other = team.lineup.line2[0]!;
    expect(setSeasonLineupSlot(f, 0, 0, other).ok).toBe(true);
    expect(team.lineup.line1[0]).toBe(other);
  });
});

describe('abandoning a season', () => {
  it('ends a season under way at once, without a title', () => {
    const f = fresh();
    startSeason(f);
    expect(abandonSeason(f)).toMatchObject({ ok: true });
    expect(f.season.phase).toBe('ended');
    expect(f.season.outcome).toBe('abandoned');
    expect(matchup(f)).toBeNull();
    expect(seasonSummary(f).finish).toBe('Season abandoned');
    expect(seasonSummary(f).champion).toBe(false);
  });

  it('is refused when no season is under way', () => {
    const f = fresh();
    expect(abandonSeason(f).ok).toBe(false);
    startSeason(f);
    abandonSeason(f);
    expect(abandonSeason(f).ok).toBe(false);
  });

  it('leads into an ordinary off-season and a new season', () => {
    const f = fresh();
    startSeason(f);
    const season = f.league.season;
    abandonSeason(f);
    expect(finishSeason(f)).toMatchObject({ ok: true });
    for (const id of [...f.offseason.pending]) decideContract(f, id, 1);
    expect(f.league.season).toBe(season + 1);
    expect(f.season.phase).toBe('offseason');
  });
});

describe('moving on the map', () => {
  it('only the stops ahead can be travelled to, and not while a stop is being dealt with', () => {
    const f = started();
    const [first, second] = availableStops(f);
    expect(travel(f, 'r2s4n0').ok).toBe(false);
    expect(travel(f, first!.id).ok).toBe(true);
    expect(currentStop(f)?.id).toBe(first!.id);
    expect(availableStops(f)).toEqual([]);
    expect(travel(f, second!.id).ok).toBe(false);
  });

  it('a won game pays currency, more for a bigger margin, and leads on', () => {
    const narrow = started();
    goTo(narrow, 'game');
    recordGame(narrow, result(true, 1));
    const wide = started();
    goTo(wide, 'game');
    recordGame(wide, result(true, 5));
    expect(narrow.season.currency).toBe(rules.startingCurrency + rules.winCurrency + rules.marginCurrency);
    expect(wide.season.currency).toBe(rules.startingCurrency + rules.winCurrency + rules.maxMarginCurrency);
    expect(narrow.season.strikes).toBe(0);
    expect(narrow.season.current).toBe(null);
    expect(narrow.record.wins).toBe(1);
    expect(availableStops(narrow).every((s) => s.step === 1)).toBe(true);
  });

  it('a lost game is a strike, pays nothing, and you still move on', () => {
    const f = started();
    goTo(f, 'game');
    const outcome = recordGame(f, result(false));
    expect(outcome.ok && outcome.message).toMatch(/Strike 1/);
    expect(f.season.strikes).toBe(1);
    expect(f.season.currency).toBe(rules.startingCurrency);
    expect(f.record.losses).toBe(1);
    expect(availableStops(f).length).toBeGreaterThan(0);
  });

  it('a forfeited game is a loss whatever the score: a strike and no pack', () => {
    const f = started();
    goTo(f, 'game');
    // Ahead 3-0 and not yet finished when the player gives up.
    const ahead: GameResult = { ...result(true, 3), winner: null, finished: false };
    const given = forfeitResult(ahead, 0);
    expect(given).toMatchObject({ winner: 1, finished: true, forfeit: true, score: [3, 0] });
    const packs = f.packs.length;
    const outcome = recordGame(f, given);
    expect(outcome.ok && outcome.message).toMatch(/^You forfeit the game\. .*Strike 1/);
    expect(f.season.strikes).toBe(1);
    expect(f.record.losses).toBe(1);
    expect(f.packs.length).toBe(packs);
    // The other side forfeiting would be a win for team 0.
    expect(forfeitResult(ahead, 1).winner).toBe(0);
  });

  it('an unfinished game does not count', () => {
    const f = started();
    goTo(f, 'game');
    recordGame(f, { ...result(true), finished: false });
    expect(f.season.gamesPlayed).toBe(0);
    expect(currentStop(f)?.kind).toBe('game');
  });

  it('the third strike ends the season', () => {
    const f = started();
    for (let guard = 0; guard < 40 && f.season.phase === 'map'; guard++) {
      if (f.season.current === null) travel(f, availableStops(f)[0]!.id);
      resolve(f, false);
    }
    expect(f.season.strikes).toBe(rules.maxStrikes);
    expect(f.season.phase).toBe('ended');
    expect(f.season.outcome).toBe('struckOut');
    expect(availableStops(f)).toEqual([]);
  });

  it('training bumps one dressed player for the season, and shows up on the ice', () => {
    const f = started();
    const before = dressUser(f)!.setup.skaters[0]!;
    for (let guard = 0; guard < 20 && !availableStops(f).some((s) => s.kind === 'training'); guard++) {
      const map = f.season.map!;
      const options = availableStops(f);
      const toward = options.find((s) => s.next.some((id) => map.stops[id]!.kind === 'training')) ?? options[0]!;
      travel(f, toward.id);
      resolve(f, true);
    }
    goTo(f, 'training');
    const centre = userTeam(f.league).lineup.line1[0]!;
    expect(train(f, 'p-9999').ok).toBe(false);
    const outcome = train(f, centre);
    expect(outcome.ok).toBe(true);
    expect(f.season.bumps[centre]).toBe(rules.trainingBump);
    const after = dressUser(f)!.setup.skaters[0]!;
    expect(after.shooting).toBe(Math.min(rules.maxRating, before.shooting + rules.trainingBump));
    expect(after.speed).toBe(Math.min(rules.maxRating, before.speed + rules.trainingBump));
    expect(f.season.current).toBe(null);
  });
});

describe('shop', () => {
  const atShop = (seed: string): Franchise => {
    for (const s of [seed, `${seed}-b`, `${seed}-c`, `${seed}-d`, `${seed}-e`, `${seed}-f`]) {
      const f = started(s);
      for (let guard = 0; guard < 30 && f.season.phase === 'map'; guard++) {
        const options = availableStops(f);
        const shop = options.find((x) => x.kind === 'shop');
        if (shop) {
          travel(f, shop.id);
          return f;
        }
        const map = f.season.map!;
        const toward = options.find((x) => x.next.some((id) => map.stops[id]!.kind === 'shop')) ?? options[0]!;
        travel(f, toward.id);
        resolve(f, true);
      }
    }
    throw new Error('no shop found');
  };

  it('buying costs currency, takes the item off the shelf, and is refused without enough', () => {
    const f = atShop('shop');
    const item = currentStop(f)!.stock![0]!;
    const price = shopPrice(f, item);
    f.season.currency = price - 1;
    expect(buy(f, item).ok).toBe(false);
    f.season.currency = price + 7;
    const bag = f.season.powerups.length;
    expect(buy(f, item).ok).toBe(true);
    expect(f.season.currency).toBe(7);
    expect(f.season.powerups).toHaveLength(bag + 1);
    expect(currentStop(f)!.stock).not.toContain(item);
    expect(buy(f, item).ok).toBe(false);
    expect(buy(f, 'no-such-thing').ok).toBe(false);
  });

  it('a strike can be wiped for a price', () => {
    const f = atShop('heal');
    expect(healStrike(f).ok).toBe(false);
    f.season.strikes = 2;
    f.season.currency = healPrice(f) - 1;
    expect(healStrike(f).ok).toBe(false);
    f.season.currency = healPrice(f);
    expect(healStrike(f).ok).toBe(true);
    expect(f.season.strikes).toBe(1);
    expect(f.season.currency).toBe(0);
  });

  it('you stay in the shop until you leave', () => {
    const f = atShop('leave');
    expect(availableStops(f)).toEqual([]);
    expect(leaveShop(f).ok).toBe(true);
    expect(availableStops(f).length).toBeGreaterThan(0);
    expect(leaveShop(f).ok).toBe(false);
  });

  it('an artifact can lower shop prices', () => {
    const f = atShop('discount');
    const item = currentStop(f)!.stock![0]!;
    const full = shopPrice(f, item);
    f.artifacts.push('friendly-vendor');
    expect(shopPrice(f, item)).toBe(Math.round(full * 0.8));
  });
});

describe('powerups and the loadout', () => {
  it('a powerup from the bag can be loaded on a button; one you do not have cannot', () => {
    const f = started();
    f.season.powerups = ['cannon', 'second-wind'];
    expect(setLoadout(f, 0, 'cannon').ok).toBe(true);
    expect(setLoadout(f, 1, 'speed-burst').ok).toBe(false);
    expect(setLoadout(f, 1, 'cannon').ok).toBe(false);
    expect(setLoadout(f, 1, 'second-wind').ok).toBe(true);
    expect(f.season.loadout).toEqual(['cannon', 'second-wind']);
    expect(matchupAtGame(f).powerups.map((p) => p?.id)).toEqual(['cannon', 'second-wind']);
    expect(setLoadout(f, 0, null).ok).toBe(true);
    expect(f.season.loadout).toEqual([null, 'second-wind']);
  });

  it('with two copies, the same powerup can go on both buttons', () => {
    const f = started();
    f.season.powerups = ['cannon', 'cannon'];
    expect(setLoadout(f, 0, 'cannon').ok).toBe(true);
    expect(setLoadout(f, 1, 'cannon').ok).toBe(true);
  });

  it('a powerup used in a game leaves the bag; an unused one stays loaded', () => {
    const f = started();
    f.season.powerups = ['cannon', 'second-wind'];
    setLoadout(f, 0, 'cannon');
    setLoadout(f, 1, 'second-wind');
    goTo(f, 'game');
    recordGame(f, result(true, 1, ['cannon']));
    expect(f.season.powerups).not.toContain('cannon');
    expect(f.season.powerups).toContain('second-wind');
    expect(f.season.loadout[0]).toBe(null);
    expect(f.season.loadout[1]).toBe('second-wind');
  });

  it('powerup and artifact look-ups give the data entry', () => {
    expect(powerupInfo('cannon').name).toBe('Cannon');
    expect(artifactInfo('big-pads').modifiers[0]).toMatchObject({ stat: 'coverRadius' });
  });
});

function matchupAtGame(f: Franchise) {
  if (!currentStop(f)) goTo(f, 'game');
  const game = matchup(f);
  if (!game) throw new Error('no matchup');
  return game;
}

describe('bosses and artifacts', () => {
  const atBoss = (): Franchise => {
    const f = started();
    for (let guard = 0; guard < 30; guard++) {
      const options = availableStops(f);
      if (options[0]?.kind === 'boss') {
        travel(f, options[0].id);
        return f;
      }
      travel(f, options[0]!.id);
      resolve(f, true);
    }
    throw new Error('no boss reached');
  };

  it('a boss is stronger than its region, sharper, and carries its trait as modifiers', () => {
    const f = atBoss();
    const game = matchup(f)!;
    expect(game.kind).toBe('boss');
    expect(game.level).toBeCloseTo(rules.regionLevels[0]! + rules.bossLevelBonus);
    expect(game.trait).toBeTruthy();
    expect(game.away.setup.modifiers!.length).toBeGreaterThan(0);
    const order = aiTeamsByStrength(f.league);
    const best = teamStrength(f.league, order[3]!);
    const boss = game.away.players.reduce((s, p) => s + p.overall, 0) / game.away.players.length;
    expect(boss).toBeGreaterThan(best);
    // The game adds the boss's mascot to the team; everything else is the boss as built.
    const { mascot: bossMascot, ...bossSetup } = game.away.setup;
    expect(bossMascot).toBeDefined();
    expect(buildBoss(f.league, currentStop(f)!.bossId!, 0, f.season.seed)).toEqual({ ...game.away, setup: bossSetup });
  });

  it('without the handicap, losing to a boss is a strike and he must be played again, on any difficulty', () => {
    const f = atBoss();
    f.difficulty = 'allstar';
    expect(bossLossEnds(f)).toBe(false);
    const boss = currentStop(f)!.id;
    const outcome = recordGame(f, result(false));
    expect(outcome.ok && outcome.message).toMatch(/again/);
    expect(f.season.strikes).toBe(1);
    expect(currentStop(f)?.id).toBe(boss);
    expect(matchup(f)?.kind).toBe('boss');
  });

  it('under the One meeting handicap, losing to a boss ends the season at once, whatever strikes were left', () => {
    for (const difficulty of ['rookie', 'pro', 'allstar']) {
      const f = atBoss();
      f.difficulty = difficulty;
      f.season.vows = { oneMeeting: 1 };
      expect(bossLossEnds(f)).toBe(true);
      expect(f.season.strikes).toBe(0);
      const outcome = recordGame(f, result(false));
      expect(outcome.ok && outcome.message).toMatch(/season is over/);
      expect(f.season.phase).toBe('ended');
      expect(f.season.outcome).toBe('struckOut');
      expect(matchup(f)).toBeNull();
    }
  });

  it('an ordinary loss is still only a strike on every setting, and a boss win is unchanged', () => {
    for (const d of DIFFICULTIES) {
      const f = started();
      f.difficulty = d.id;
      goTo(f, 'game');
      recordGame(f, result(false));
      expect(f.season.phase, d.id).toBe('map');
      expect(f.season.strikes, d.id).toBe(1);
    }
    const f = atBoss();
    recordGame(f, result(true));
    expect(f.season.phase).toBe('map');
    expect(f.season.stage).toBe('reward');
  });

  it('beating a boss offers three artifacts; the one picked is kept and the next region opens', () => {
    const f = atBoss();
    recordGame(f, result(true));
    expect(f.season.stage).toBe('reward');
    expect(f.season.offer).toHaveLength(rules.artifactChoices);
    expect(new Set(f.season.offer).size).toBe(rules.artifactChoices);
    expect(pickArtifact(f, 'not-on-offer').ok).toBe(false);
    const pick = f.season.offer[1]!;
    expect(pickArtifact(f, pick).ok).toBe(true);
    expect(f.artifacts).toEqual([pick]);
    expect(f.season.currency).toBeGreaterThanOrEqual(rules.bossCurrency);
    expect(availableStops(f).every((s) => s.region === 1 && s.step === 0)).toBe(true);
    expect(matchup(f)).toBe(null);
  });

  it('artifacts are never offered twice, and become team modifiers on the ice', () => {
    const f = atBoss();
    // Everything that can be offered but two. (A recipe's result is made, never offered.)
    const offered = (artifacts as unknown as { id: string; recipe?: string[] }[]).filter((a) => !a.recipe).map((a) => a.id);
    f.artifacts = offered.slice(0, offered.length - 2);
    recordGame(f, result(true));
    expect(f.season.offer).toHaveLength(2);
    for (const id of f.season.offer) expect(f.artifacts).not.toContain(id);

    // A season starts with none: each run is its own build.
    const g = fresh();
    g.artifacts = ['heavy-sticks'];
    startSeason(g);
    expect(g.artifacts).toEqual([]);
    g.artifacts = ['sharpened-skates'];
    expect(teamModifiers(g)).toContainEqual({ stat: 'topSpeedScale', op: 'mul', value: 1.03 });
    expect(dressUser(g)!.setup.modifiers).toContainEqual({ stat: 'topSpeedScale', op: 'mul', value: 1.03 });
  });

  it('an artifact can raise what wins pay', () => {
    const f = started();
    f.artifacts = ['season-tickets'];
    goTo(f, 'game');
    recordGame(f, result(true, 1));
    expect(f.season.currency).toBe(rules.startingCurrency + Math.round((rules.winCurrency + rules.marginCurrency) * 1.25));
  });
});

describe('temporary effects', () => {
  it('an effect lasts the number of games it says, then is gone', () => {
    const f = started();
    f.season.temps = [{ label: 'Heavy legs', games: 2, modifiers: [{ stat: 'drainScale', op: 'mul', value: 1.4 }] }];
    expect(teamModifiers(f)).toContainEqual({ stat: 'drainScale', op: 'mul', value: 1.4 });
    goTo(f, 'game');
    recordGame(f, result(true));
    expect(f.season.temps[0]?.games).toBe(1);
    while (!availableStops(f).some((s) => s.kind === 'game')) {
      travel(f, availableStops(f)[0]!.id);
      resolve(f, true);
    }
    goTo(f, 'game');
    recordGame(f, result(true));
    expect(f.season.temps).toEqual([]);
  });
});

describe('playoffs and the end of the season', () => {
  it('beating the last boss starts the playoffs against a team from the top of the table', () => {
    const f = started();
    winTheMap(f);
    expect(f.season.phase).toBe('playoffs');
    expect(f.artifacts).toHaveLength(rules.regions);
    const seeds = f.season.bracket!.seeds;
    // You won every game, so you are the top seed and meet the last of the four.
    expect(seeds[0]).toBe(f.league.userTeamId);
    expect(f.season.playoffs).toEqual({ round: 0, wins: 0, losses: 0, opponentId: seeds[3] });
    const game = matchup(f)!;
    expect(game.kind).toBe('playoff');
    // Pro eases the playoffs by its own shift (season.json).
    expect(game.level).toBeCloseTo(rules.playoffLevel + (difficultyInfo(f.difficulty).playoffShift ?? 0));
    expect(f.season.gamesPlayed).toBe(9);
  });

  it('a series is best of three: two wins move on, and the final is against the winner of the other semi-final', () => {
    const f = started();
    winTheMap(f);
    recordGame(f, result(true));
    recordGame(f, result(false));
    expect(f.season.playoffs).toMatchObject({ round: 0, wins: 1, losses: 1 });
    recordGame(f, result(true));
    const bracket = f.season.bracket!;
    expect(bracket.other).toContain(bracket.otherWinner);
    expect(f.season.playoffs).toEqual({ round: 1, wins: 0, losses: 0, opponentId: bracket.otherWinner });
    expect(f.season.strikes).toBe(0);

    // A season begun before the league kept a table finishes by the old rule: the two strongest teams.
    const old = started();
    delete old.season.standings;
    winTheMap(old);
    const order = aiTeamsByStrength(old.league);
    expect(old.season.playoffs).toEqual({ round: 0, wins: 0, losses: 0, opponentId: order[order.length - 2] });
    recordGame(old, result(true));
    recordGame(old, result(true));
    expect(old.season.playoffs).toEqual({ round: 1, wins: 0, losses: 0, opponentId: order[order.length - 1] });
  });

  it('losing a series ends the season', () => {
    const f = started();
    winTheMap(f);
    recordGame(f, result(false));
    expect(f.season.phase).toBe('playoffs');
    recordGame(f, result(false));
    expect(f.season.phase).toBe('ended');
    expect(f.season.outcome).toBe('eliminated');
    expect(recordGame(f, result(true)).ok).toBe(false);
  });

  it('winning the final makes you champion', () => {
    const f = started();
    winTheMap(f);
    for (let i = 0; i < 4; i++) recordGame(f, result(true));
    expect(f.season.phase).toBe('ended');
    expect(f.season.outcome).toBe('champion');
    expect(f.artifacts).toHaveLength(rules.regions);
    expect(new Set(f.artifacts).size).toBe(f.artifacts.length);
    expect(f.season.gamesPlayed).toBe(13);
  });

  it('ending the season wipes powerups, currency, bumps and effects, keeps artifacts and the record, and unlocks the roster', () => {
    const f = started();
    winTheMap(f);
    for (let i = 0; i < 4; i++) recordGame(f, result(true));
    f.season.bumps = { x: 3 };
    f.season.temps = [{ label: 'x', games: 3, modifiers: [] }];
    const kept = [...f.artifacts];
    const wins = f.record.wins;
    expect(endSeason(f).ok).toBe(true);
    expect(f.season.phase).toBe('offseason');
    expect(f.season.powerups).toEqual([]);
    expect(f.season.currency).toBe(0);
    expect(f.season.bumps).toEqual({});
    expect(f.season.temps).toEqual([]);
    expect(f.season.strikes).toBe(0);
    expect(f.artifacts).toEqual(kept);
    expect(f.record.wins).toBe(wins);
    expect(f.league.season).toBe(2);
    expect(rosterLocked(f)).toBe(false);
    expect(endSeason(f).ok).toBe(false);
  });

  it('the next season has a different map', () => {
    const f = started();
    const first = JSON.stringify(f.season.map);
    f.season.phase = 'ended';
    endSeason(f);
    startSeason(f);
    expect(JSON.stringify(f.season.map)).not.toBe(first);
  });
});

describe('saving a season', () => {
  it('a Phase 4 save (version 1) is brought up to date: off-season, no artifacts', () => {
    const league = generateLeague('old-save');
    const old = { schemaVersion: 1, savedAt: 'then', league, record: { wins: 4, losses: 2, overtimeLosses: 1 } };
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(3);
    const loaded = fromSave(JSON.parse(JSON.stringify(old)));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.schemaVersion).toBe(SAVE_VERSION);
    expect(loaded.save.season.phase).toBe('offseason');
    expect(loaded.save.artifacts).toEqual([]);
    expect(loaded.save.record).toEqual(old.record);
    expect(loaded.save.league).toEqual(league);
  });

  it('a save in the middle of a season loads back to exactly the same place', () => {
    const f = started('mid-season');
    goTo(f, 'game');
    recordGame(f, result(false));
    travel(f, availableStops(f)[0]!.id);
    f.season.powerups.push('cannon');
    setLoadout(f, 0, 'cannon');
    f.artifacts.push('big-pads');

    const loaded = parseSave(JSON.stringify(toSave(f, 'now')));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const back = franchiseOf(loaded.save);
    expect(back).toEqual(f);
    expect(currentStop(back)?.id).toBe(currentStop(f)?.id);
    expect(back.season.strikes).toBe(1);
    // And it carries on from there.
    resolve(back, true);
    expect(availableStops(back).length).toBeGreaterThan(0);
  });

  it('a save with no season state is refused as damaged', () => {
    const save = JSON.parse(JSON.stringify(toSave(fresh(), 'now')));
    delete save.season;
    expect(fromSave(save).ok).toBe(false);
  });
});

describe('difficulty by region', () => {
  const shiftAt = (id: string, region: number): number => {
    const d = difficultyInfo(id);
    const eased = d.regionShift ?? [];
    return d.levelShift + (eased[region] ?? eased[eased.length - 1] ?? 0);
  };

  it('no setting changes the first region beyond its own level, and none gets sharper later by its shift', () => {
    for (const d of DIFFICULTIES) {
      expect((d.regionShift ?? [0])[0]).toBe(0);
      for (const x of d.regionShift ?? []) expect(x).toBeLessThanOrEqual(0);
      expect(d.playoffShift ?? 0).toBeLessThanOrEqual(0);
    }
  });

  it('Rookie is easier than Pro and Pro easier than All-Star in every region and the playoffs', () => {
    for (let region = 0; region < rules.regions; region++) {
      expect(shiftAt('rookie', region)).toBeLessThan(shiftAt('pro', region));
      expect(shiftAt('pro', region)).toBeLessThan(shiftAt('allstar', region));
    }
    const playoff = (id: string): number => difficultyInfo(id).levelShift + (difficultyInfo(id).playoffShift ?? 0);
    expect(playoff('rookie')).toBeLessThan(playoff('pro'));
    expect(playoff('pro')).toBeLessThan(playoff('allstar'));
  });

  it('only Rookie gives more strikes', () => {
    expect(difficultyInfo('pro').extraStrikes ?? 0).toBe(0);
    expect(difficultyInfo('allstar').extraStrikes ?? 0).toBe(0);
    expect(difficultyInfo('rookie').extraStrikes ?? 0).toBeGreaterThan(0);
  });
});
