import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { matchup, newFranchise, recordGame, setLoadout, signatureOffer, startSeason, type Franchise } from '../src/core/season';
import powerups from '../src/data/powerups.json';
import rules from '../src/data/season.json';
import type { GameResult } from '../src/sim/match';
import type { PowerupSpec } from '../src/sim/modifiers';
import { usePowerup } from '../src/sim/powerups';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';

const t = cloneTuning();
const fresh = (seed = 'signature'): Franchise => newFranchise(generateLeague(seed));
const atGame = (f: Franchise): void => {
  const stop = Object.values(f.season.map!.stops).find((s) => s.kind === 'game' && !s.elite && s.region === 0)!;
  f.season.current = stop.id;
  f.season.stage = 'arrived';
};

describe('the powerups a season offers as its own', () => {
  it('three are drawn, all different, the same every time for the season, and another three next season', () => {
    const f = fresh();
    const offer = signatureOffer(f);
    expect(offer).toHaveLength(rules.signatureChoices);
    expect(new Set(offer).size).toBe(offer.length);
    for (const id of offer) expect(powerups.some((p) => p.id === id)).toBe(true);
    expect(signatureOffer(f)).toEqual(offer);
    f.league.season += 1;
    expect(signatureOffer(f)).not.toEqual(offer);
  });

  it('the one chosen is kept for the season; one not on offer is not taken; none chosen is the game as it was', () => {
    const f = fresh();
    const offer = signatureOffer(f);
    startSeason(f, { signature: offer[1] as string });
    expect(f.season.signature).toBe(offer[1]);

    const wrong = fresh();
    const notOffered = powerups.find((p) => !signatureOffer(wrong).includes(p.id))!.id;
    startSeason(wrong, { signature: notOffered });
    expect(wrong.season.signature).toBeUndefined();

    const none = fresh();
    startSeason(none);
    expect(none.season.signature).toBeUndefined();
  });
});

describe('in a game', () => {
  const withSignature = (): Franchise => {
    const f = fresh();
    startSeason(f, { signature: signatureOffer(f)[0] as string });
    return f;
  };

  it('it is on the first button, recharging; the second button is loaded from the bag as before', () => {
    const f = withSignature();
    f.season.powerups = ['cannon'];
    expect(setLoadout(f, 1, 'cannon').ok).toBe(true);
    atGame(f);
    const loaded = matchup(f)!.powerups;
    expect(loaded[0]?.id).toBe(f.season.signature);
    expect(loaded[0]?.recharge).toBe(rules.signatureRechargeSeconds);
    expect(loaded[1]?.id).toBe('cannon');
    expect(loaded[1]?.recharge).toBeUndefined();
  });

  it('the first button cannot be loaded with anything else', () => {
    const f = withSignature();
    f.season.powerups = ['cannon'];
    const out = setLoadout(f, 0, 'cannon');
    expect(out.ok).toBe(false);
  });

  it('using it never takes anything out of the bag', () => {
    const f = withSignature();
    f.season.powerups = ['cannon'];
    atGame(f);
    const result: GameResult = { score: [2, 1], winner: 0, finished: true, overtime: false, periods: 3, players: [], powerupsUsed: [] };
    recordGame(f, result);
    expect(f.season.powerups).toContain('cannon');
    expect(f.season.signature).toBeDefined();
  });
});

describe('a recharging powerup on the ice', () => {
  const boost: PowerupSpec = { id: 'own', name: 'Own', seconds: 5, modifiers: [{ stat: 'topSpeedScale', op: 'mul', value: 1.2 }], recharge: 10 };
  const world = (spec: PowerupSpec): World => createWorld(t, 'recharge', { powerups: [spec, null] });
  const press = (w: World): boolean => usePowerup(w, 0, 0, [] as SimEvent[]);
  const run = (w: World, seconds: number): void => {
    for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) step(w, NO_INPUT, t);
  };

  it('stays on its button when used, is not counted as used up, and starts its boost', () => {
    const w = world(boost);
    expect(press(w)).toBe(true);
    expect(w.teams[0].powerups[0]?.id).toBe('own');
    expect(w.teams[0].powerupsUsed).toEqual([]);
    expect(w.teams[0].boosts.map((b) => b.id)).toEqual(['own']);
  });

  it('cannot be used again until its boost has ended and the recharge has passed', () => {
    const w = world(boost);
    press(w);
    expect(press(w)).toBe(false);
    run(w, 5 + 10 - 1);
    expect(press(w)).toBe(false);
    run(w, 1.2);
    expect(w.teams[0].powerupWait[0]).toBe(0);
    expect(press(w)).toBe(true);
    expect(w.teams[0].boosts.map((b) => b.id)).toEqual(['own']);
  });

  it('an ordinary powerup is still used up at once', () => {
    const { recharge: _none, ...plain } = boost;
    const w = world(plain);
    expect(press(w)).toBe(true);
    expect(w.teams[0].powerups[0]).toBeNull();
    expect(w.teams[0].powerupsUsed).toEqual(['own']);
    expect(press(w)).toBe(false);
  });

  it('an instant one (no boost) recharges too', () => {
    const w = world({ id: 'salts', name: 'Salts', effect: 'restoreAllEnergy', recharge: 10 });
    expect(press(w)).toBe(true);
    expect(press(w)).toBe(false);
    run(w, 10.2);
    expect(press(w)).toBe(true);
  });
});
