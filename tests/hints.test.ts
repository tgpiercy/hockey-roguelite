import { describe, expect, it } from 'vitest';
import data from '../src/data/hints.json';
import { HINT_IDS, hintDone, hintFor, hintsThatApply, hintText, retired } from '../src/game/hints';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import type { World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { DEFAULT_PREFS, parseHintCounts, parsePrefs } from '../src/ui/prefs';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);

/** The human's skater and one opponent, everyone else out of the way. */
const stage = (keep: number[] = [ID.home1, ID.away1]): World => {
  const world = createWorld(t, 'hints');
  clearIce(world, keep);
  world.human!.controlled = ID.home1;
  return world;
};

describe('which hints apply', () => {
  it('every hint has words, and the list is the one in the data', () => {
    expect(HINT_IDS).toEqual(Object.keys(data.hints));
    for (const id of HINT_IDS) expect(hintText(id).length).toBeGreaterThan(8);
  });

  it('a pass on its way to him: one-timer, unless shoot is already held', () => {
    const world = stage([ID.home1]);
    place(world, ID.home1, 5, 0, 0);
    world.puck.carrier = null;
    world.puck.pos = { x: 0, y: 0 };
    world.puck.vel = { x: 20, y: 0 };
    world.puck.passTarget = ID.home1;
    world.puck.lastTeam = 0;
    expect(hintsThatApply(world, t)).toEqual(['oneTimer']);
    player(world, ID.home1).shootHeld = true;
    expect(hintsThatApply(world, t)).toEqual([]);
  });

  it('carrying with a checker close: deke', () => {
    const world = stage();
    place(world, ID.home1, -5, 0, 0);
    giveTo(world, ID.home1);
    place(world, ID.away1, -5 + data.dekeRange - 1, 1, Math.PI);
    expect(hintsThatApply(world, t)).toContain('deke');
    place(world, ID.away1, -5 + data.dekeRange + 3, 0, Math.PI);
    expect(hintsThatApply(world, t)).not.toContain('deke');
  });

  it('winding up in range of the net: fake', () => {
    const world = stage([ID.home1]);
    place(world, ID.home1, gx - 8, 0, 0);
    giveTo(world, ID.home1);
    expect(hintsThatApply(world, t)).not.toContain('fake');
    player(world, ID.home1).charge = 0.2;
    expect(hintsThatApply(world, t)).toContain('fake');
  });

  it('an opponent in the lane to a teammate: saucer pass', () => {
    const world = stage([ID.home1, ID.home2, ID.away1]);
    place(world, ID.home1, -10, 0, 0);
    giveTo(world, ID.home1);
    place(world, ID.home2, -2, 0, 0);
    place(world, ID.away1, -6, 0.3, Math.PI);
    expect(hintsThatApply(world, t)).toContain('saucer');
    place(world, ID.away1, -6, 8, Math.PI);
    expect(hintsThatApply(world, t)).not.toContain('saucer');
  });

  it('in the attacking half with a teammate near: give and go', () => {
    const world = stage([ID.home1, ID.home2]);
    place(world, ID.home1, 6, 0, 0);
    giveTo(world, ID.home1);
    place(world, ID.home2, 10, 5, 0);
    expect(hintsThatApply(world, t)).toContain('giveGo');
    place(world, ID.home1, -6, 0, 0);
    giveTo(world, ID.home1);
    expect(hintsThatApply(world, t)).not.toContain('giveGo');
  });

  it('their carrier close: poke and body check; further off, neither', () => {
    const world = stage();
    place(world, ID.away1, 0, 0, Math.PI);
    giveTo(world, ID.away1);
    place(world, ID.home1, -2.5, 0, 0);
    expect(hintsThatApply(world, t)).toEqual(['poke', 'bodyCheck']);
    place(world, ID.home1, -(data.hitNear + 4), 0, 0);
    expect(hintsThatApply(world, t)).toEqual([]);
  });

  it('their shooter winding up with him in the lane: block', () => {
    const world = stage();
    place(world, ID.away1, -gx + 10, 0, Math.PI);
    giveTo(world, ID.away1);
    player(world, ID.away1).charge = 0.3;
    place(world, ID.home1, -gx + 4, 0.5, 0);
    expect(hintsThatApply(world, t)).toContain('block');
    place(world, ID.home1, -gx + 4, 7, 0);
    expect(hintsThatApply(world, t)).not.toContain('block');
  });

  it('nothing at a faceoff, after the game, or in a game with no human', () => {
    const world = stage();
    place(world, ID.away1, 0, 0, Math.PI);
    giveTo(world, ID.away1);
    place(world, ID.home1, -2.5, 0, 0);
    world.phase = 'faceoff';
    expect(hintsThatApply(world, t)).toEqual([]);
    world.phase = 'final';
    expect(hintsThatApply(world, t)).toEqual([]);
    expect(hintsThatApply(createWorld(t, 'ai', { human: false }), t)).toEqual([]);
  });
});

describe('which hint is shown', () => {
  const close = (): World => {
    const world = stage();
    place(world, ID.away1, 0, 0, Math.PI);
    giveTo(world, ID.away1);
    place(world, ID.home1, -2.5, 0, 0);
    return world;
  };

  it('the first in the list between equals, then the one done less often', () => {
    expect(hintFor(close(), t, {})).toBe('poke');
    expect(hintFor(close(), t, { poke: 1 })).toBe('bodyCheck');
    expect(hintFor(close(), t, { poke: 2, bodyCheck: 1 })).toBe('bodyCheck');
  });

  it('a move done often enough is never hinted again', () => {
    const n = data.retireAfter;
    expect(retired('poke', { poke: n })).toBe(true);
    expect(retired('poke', { poke: n - 1 })).toBe(false);
    expect(hintFor(close(), t, { poke: n })).toBe('bodyCheck');
    expect(hintFor(close(), t, { poke: n, bodyCheck: n })).toBeNull();
  });
});

describe('what counts as doing a move', () => {
  it('each event of his own counts for its hint', () => {
    expect(hintDone({ type: 'shot', speed: 30, player: 0, oneTimer: true }, 0)).toBe('oneTimer');
    expect(hintDone({ type: 'shot', speed: 30, player: 0 }, 0)).toBeNull();
    expect(hintDone({ type: 'fake', player: 0 }, 0)).toBe('fake');
    expect(hintDone({ type: 'block', player: 0 }, 0)).toBe('block');
    expect(hintDone({ type: 'deke', player: 0 }, 0)).toBe('deke');
    expect(hintDone({ type: 'pass', player: 0, target: 1, saucer: true }, 0)).toBe('saucer');
    expect(hintDone({ type: 'pass', player: 0, target: 1, saucer: false }, 0)).toBeNull();
    expect(hintDone({ type: 'check', player: 0, target: 7, kind: 'poke', success: false }, 0)).toBe('poke');
    expect(hintDone({ type: 'check', player: 0, target: 7, kind: 'body', success: true }, 0)).toBe('bodyCheck');
    expect(hintDone({ type: 'post' }, 0)).toBeNull();
  });

  it('a teammate\'s move does not', () => {
    expect(hintDone({ type: 'deke', player: 1 }, 0)).toBeNull();
    expect(hintDone({ type: 'pass', player: 1, target: 0, saucer: true }, 0)).toBeNull();
    expect(hintDone({ type: 'check', player: 2, target: 7, kind: 'body', success: true }, 0)).toBeNull();
  });
});

describe('hints on this device', () => {
  it('are on unless switched off, and old stored preferences still load', () => {
    expect(DEFAULT_PREFS.hints).toBe(true);
    expect(parsePrefs(JSON.stringify({ sound: false })).hints).toBe(true);
    expect(parsePrefs(JSON.stringify({ hints: false })).hints).toBe(false);
  });

  it('the counts come back as stored; anything broken is dropped', () => {
    expect(parseHintCounts(JSON.stringify({ poke: 2, deke: 3 }))).toEqual({ poke: 2, deke: 3 });
    expect(parseHintCounts(JSON.stringify({ poke: -1, deke: 'x', fake: 1.5, block: 1 }))).toEqual({ block: 1 });
    expect(parseHintCounts(null)).toEqual({});
    expect(parseHintCounts('nonsense')).toEqual({});
    expect(parseHintCounts('[1]')).toEqual({});
  });
});
