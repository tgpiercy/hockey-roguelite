import { describe, expect, it } from 'vitest';
import { aiTeamsByStrength } from '../src/core/bosses';
import { generateLeague } from '../src/core/generate';
import {
  availableStops,
  buyScouting,
  canSimulate,
  chooseEvent,
  currentStop,
  dressUser,
  healPrice,
  leaveShop,
  matchup,
  newFranchise,
  pickArtifact,
  recordGame,
  scoutPrice,
  startSeason,
  train,
  trainingChoices,
  trainingFocus,
  travel,
  type Franchise, pickRinger } from '../src/core/season';
import { generateMap, type Stop } from '../src/core/seasonMap';
import artifacts from '../src/data/artifacts.json';
import events from '../src/data/events.json';
import rules from '../src/data/season.json';
import type { GameResult } from '../src/sim/match';

const started = (seed = 'choices'): Franchise => {
  const f = newFranchise(generateLeague(seed));
  expect(startSeason(f).ok).toBe(true);
  return f;
};
const result = (won: boolean, margin = 1): GameResult => ({ score: won ? [margin, 0] : [0, margin], winner: won ? 0 : 1, finished: true, overtime: false, periods: 3, players: [], powerupsUsed: [] }) as unknown as GameResult;

/** Deals with the stop the season is on in the simplest way, winning any game. */
const resolve = (f: Franchise): void => {
  if (f.season.stage === 'ringer') {
    pickRinger(f, null);
    return;
  }
  if (f.season.stage === 'reward') {
    pickArtifact(f, f.season.offer[0]!);
    return;
  }
  const stop = currentStop(f)!;
  if (stop.kind === 'game' || stop.kind === 'boss') recordGame(f, result(true));
  else if (stop.kind === 'training') train(f, f.season.dressed[0]!);
  else if (stop.kind === 'event') chooseEvent(f, 1);
  else leaveShop(f);
};
/** Walks the map, taking plain games, until a stop that matches is on offer; travels there and returns it. */
const advanceTo = (f: Franchise, wanted: (s: Stop) => boolean): Stop => {
  for (let guard = 0; guard < 60; guard++) {
    if (f.season.current !== null) {
      resolve(f);
      continue;
    }
    const options = availableStops(f);
    const hit = options.find(wanted);
    if (hit) {
      expect(travel(f, hit.id).ok).toBe(true);
      return hit;
    }
    travel(f, (options.find((s) => !s.elite) ?? options[0]!).id);
  }
  throw new Error('never reached the stop');
};

describe('the map offers real choices', () => {
  const league = generateLeague('choices');
  const order = aiTeamsByStrength(league);
  const map = generateMap('choices/map-test', order);
  const stops = Object.values(map.stops);

  it('every game step has one plain game and one elite game against a stronger team', () => {
    for (let region = 0; region < rules.regions; region++) {
      rules.steps.forEach((pattern, step) => {
        if (pattern !== 'game') return;
        const row = stops.filter((s) => s.region === region && s.step === step);
        expect(row.filter((s) => s.elite)).toHaveLength(1);
        const plain = row.find((s) => !s.elite)!;
        const elite = row.find((s) => s.elite)!;
        expect(elite.opponentId).not.toBe(plain.opponentId);
        expect(order.indexOf(elite.opponentId!)).toBeGreaterThan(order.indexOf(plain.opponentId!) - Math.ceil(order.length / rules.regions));
        if (region < rules.regions - 1) expect(order.indexOf(elite.opponentId!)).toBeGreaterThan(order.indexOf(plain.opponentId!));
      });
    }
  });

  it('every stop leads to every stop on the next step, so no choice is taken away', () => {
    for (const stop of stops) {
      const next = stops.filter((s) => s.region === stop.region && s.step === stop.step + 1);
      expect([...stop.next].sort()).toEqual(next.map((s) => s.id).sort());
    }
  });
});

describe('elite games', () => {
  it('are harder than the plain game beside them', () => {
    const f = started();
    const plainStop = availableStops(f).find((s) => !s.elite)!;
    travel(f, plainStop.id);
    const plain = matchup(f)!;
    const g = started();
    travel(g, availableStops(g).find((s) => s.elite)!.id);
    const elite = matchup(g)!;
    expect(elite.elite).toBe(true);
    // An elite game has to be played, not settled from the ratings.
    expect(canSimulate(g)).toBe(false);
    expect(canSimulate(f)).toBe(true);
    expect(elite.title).toMatch(/Elite/);
    expect(elite.level).toBeCloseTo(plain.level + rules.eliteLevelBonus);
  });

  it('a win pays more and offers an artifact; a loss is a strike like any other', () => {
    const f = started();
    travel(f, availableStops(f).find((s) => s.elite)!.id);
    recordGame(f, result(true, 1));
    expect(f.season.currency).toBe(rules.winCurrency + rules.eliteCurrency + rules.marginCurrency);
    expect(f.season.stage).toBe('reward');
    expect(f.season.offer).toHaveLength(rules.eliteArtifactChoices);
    expect(pickArtifact(f, f.season.offer[0]!).ok).toBe(true);
    expect(f.artifacts).toHaveLength(1);
    expect(f.season.current).toBeNull();

    const g = started();
    travel(g, availableStops(g).find((s) => s.elite)!.id);
    recordGame(g, result(false));
    expect(g.season.strikes).toBe(1);
    expect(g.artifacts).toEqual([]);
  });
});

describe('strikes', () => {
  it('beating a boss wipes one', () => {
    const f = started();
    advanceTo(f, (s) => s.kind === 'boss');
    f.season.strikes = 2;
    recordGame(f, result(true));
    expect(f.season.strikes).toBe(2 - rules.bossHealsStrikes);
    const g = started();
    advanceTo(g, (s) => s.kind === 'boss');
    recordGame(g, result(true));
    expect(g.season.strikes).toBe(0);
  });

  it('wiping one in a shop costs about two wins, not four', () => {
    const f = started();
    expect(healPrice(f)).toBeLessThanOrEqual(3 * (rules.winCurrency + rules.marginCurrency));
  });
});

describe('artifacts that change how you play', () => {
  const fresh = ['quick-release', 'thread-the-needle', 'guardian-angel', 'wrecking-crew', 'open-ice', 'howitzer', 'puck-hog', 'counter-punch', 'glass-cannon', 'marathon-men'];
  it('each new one gives something and takes something', () => {
    for (const id of fresh) {
      const artifact = artifacts.find((a) => a.id === id)!;
      expect(artifact, id).toBeDefined();
      expect(artifact.modifiers.length).toBeGreaterThanOrEqual(2);
      expect(artifact.description).toMatch(/, but /);
    }
  });

  it('reach the ice like any other', () => {
    const f = started();
    f.artifacts = ['quick-release'];
    expect(dressUser(f)!.setup.modifiers).toContainEqual({ stat: 'oneTimerScale', op: 'mul', value: 1.3 });
  });
});

describe('training is a pick', () => {
  const atTraining = (): Franchise => {
    for (const seed of ['choices', 'choices-b', 'choices-c', 'choices-d']) {
      const f = started(seed);
      try {
        advanceTo(f, (s) => s.kind === 'training');
        return f;
      } catch {
        // No training stop on this map before the season ended: try another.
      }
    }
    throw new Error('no map with a training stop');
  };

  it('a skater may take a little of everything, a lot of one rating, or a trait; a goalie has no traits', () => {
    const f = atTraining();
    const skater = f.season.dressed[0]!;
    const goalie = f.season.dressed[f.season.dressed.length - 1]!;
    const ids = trainingChoices(f, skater).map((c) => c.id);
    expect(ids[0]).toBe('all');
    expect([...ids].sort()).toEqual(['all', 'shooting', 'passing', 'speed', 'checking', 'puckControl', 'stamina', ...rules.trainingTraits.map((t) => t.id)].sort());
    expect(trainingChoices(f, goalie).map((c) => c.id).sort()).toEqual(['all', 'reflexes', 'positioning', 'reboundControl', 'stamina'].sort());
  });

  it('one rating: it shows in his ratings on the ice, and only that one', () => {
    const f = atTraining();
    const id = f.season.dressed[0]!;
    const before = dressUser(f)!.setup.skaters[0]!;
    expect(train(f, id, 'shooting').ok).toBe(true);
    const after = dressUser(f)!.setup.skaters[0]!;
    expect(after.shooting).toBe(Math.min(rules.maxRating, before.shooting + trainingFocus(f)));
    expect(after.speed).toBe(before.speed);
    expect(f.season.current).toBeNull();
    expect(trainingFocus(f)).toBeGreaterThan(rules.trainingBump * 2);
  });

  it('a trait: it reaches the ice as his own modifier, and cannot be learned twice', () => {
    const f = atTraining();
    const id = f.season.dressed[1]!;
    const trait = rules.trainingTraits[0]!;
    expect(train(f, id, trait.id).ok).toBe(true);
    expect(dressUser(f)!.setup.skaterModifiers![1]).toContainEqual(trait.modifiers[0]);
    expect(dressUser(f)!.setup.skaterModifiers![0]!.some((m) => m.stat === trait.modifiers[0]!.stat)).toBe(false);
    expect(trainingChoices(f, id).map((c) => c.id)).not.toContain(trait.id);
  });

  it('all-round still works, and nonsense is refused', () => {
    const f = atTraining();
    const id = f.season.dressed[0]!;
    expect(train(f, id, 'juggling').ok).toBe(false);
    expect(train(f, id).ok).toBe(true);
    expect(f.season.bumps[id]).toBe(rules.trainingBump);
  });
});

describe('boss preparation', () => {
  it('a scouting report from a shop makes the next boss weaker and slower, until he is beaten', () => {
    const f = started();
    advanceTo(f, (s) => s.kind === 'shop');
    f.season.currency = 100;
    const price = scoutPrice(f);
    expect(buyScouting(f).ok).toBe(true);
    expect(f.season.currency).toBe(100 - price);
    expect(buyScouting(f).ok).toBe(false);
    leaveShop(f);
    advanceTo(f, (s) => s.kind === 'boss');
    const scouted = matchup(f)!;
    // The same boss on the same day without the report.
    delete f.season.scouted;
    const plain = matchup(f)!;
    f.season.scouted = true;
    expect(scouted.level).toBeCloseTo(plain.level - rules.scoutLevelCut);
    expect(scouted.trait).toMatch(/Scouted/);
    const strength = (m: typeof plain): number => m.away.setup.skaters.reduce((sum, s) => sum + s.shooting + s.speed, 0);
    expect(strength(scouted)).toBeLessThan(strength(plain));

    recordGame(f, result(true));
    expect(f.season.scouted).toBeUndefined();
  });

  it('cannot be bought without the Pucks, or outside a shop', () => {
    const f = started();
    expect(buyScouting(f).ok).toBe(false);
    advanceTo(f, (s) => s.kind === 'shop');
    f.season.currency = 0;
    expect(buyScouting(f).ok).toBe(false);
  });

  it('an event can sell the same report', () => {
    const event = events.find((e) => e.id === 'scouts-notebook')!;
    expect(event.choices[0]!.outcomes[0]!.effects.map((e) => e.type)).toEqual(['currency', 'scout']);
  });
});

describe('events without an always-best answer', () => {
  const event = (id: string) => events.find((e) => e.id === id)!;
  const pucks = (outcome: { weight?: number; effects: { type: string; amount?: number }[] }): number => outcome.effects.filter((e) => e.type === 'currency').reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const expected = (choice: { outcomes: { weight?: number; effects: { type: string; amount?: number }[] }[] }): number => {
    const total = choice.outcomes.reduce((sum, o) => sum + (o.weight ?? 1), 0);
    return choice.outcomes.reduce((sum, o) => sum + (pucks(o) * (o.weight ?? 1)) / total, 0);
  };

  it('the charity donation buys something', () => {
    expect(event('charity-game').choices[1]!.outcomes[0]!.effects.some((e) => e.type === 'temp')).toBe(true);
  });

  it('the veteran\'s two speeches help different players', () => {
    const [heart, kids] = event('veteran-speech').choices.map((c) => c.outcomes[0]!.effects[0] as { who: string; amount: number });
    expect(heart!.who).toBe('all');
    expect(kids!.who).toBe('worst');
    expect(kids!.amount).toBeGreaterThan(heart!.amount);
  });

  it('returning the wallet is a gamble; keeping the cash is certain', () => {
    expect(event('found-wallet').choices[0]!.outcomes.length).toBe(2);
    expect(event('found-wallet').choices[1]!.outcomes.length).toBe(1);
  });

  it('the wagers are close to even, so refusing is reasonable', () => {
    expect(Math.abs(expected(event('old-rival').choices[0]!))).toBeLessThanOrEqual(6);
    expect(Math.abs(expected(event('card-game').choices[0]!))).toBeLessThanOrEqual(6);
  });
});
