import { describe, expect, it } from 'vitest';
import { createRng, rngFrom } from '../src/core/rng';
import { looksPacked, packWorld, unpackWorld } from '../src/sim/snapshot';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame } from '../src/sim/types';
import { createGame, step } from '../src/sim/world';
import { uniformTeam } from './harness/harness';

const t = cloneTuning();

describe('a generator noted and made again', () => {
  it('gives exactly what the one noted was about to', () => {
    const rng = createRng('kept');
    for (let i = 0; i < 37; i++) rng.next();
    const again = rngFrom(rng.seed, rng.state());
    for (let i = 0; i < 50; i++) expect(again.next()).toBe(rng.next());
    // Its forks are the same too: they come from the seed alone.
    expect(again.fork('x').next()).toBe(rng.fork('x').next());
  });
});

describe('a game kept and picked up again', () => {
  const inputAt = (n: number): InputFrame => ({ ...NO_INPUT, moveX: Math.sin(n / 40), moveY: Math.cos(n / 55), shoot: n % 90 < 30, pass: n % 130 < 4, check: n % 70 < 10, switchPlayer: n % 200 < 3 });

  it('goes on exactly as the game it was kept from, with a person playing', () => {
    const live = createGame(t, 'kept-game', { teams: [uniformTeam(72), uniformTeam(70)], levels: [null, 0.6], overtimeLimit: 60 });
    for (let n = 0; n < 2500; n++) step(live, inputAt(n), t);
    // Kept as the store keeps it: a copy that shares nothing, with no functions in it.
    const stored = structuredClone(packWorld(live));
    expect(looksPacked(stored)).toBe(true);
    expect(JSON.stringify(stored).length).toBeGreaterThan(100);
    const again = unpackWorld(stored);
    for (let n = 2500; n < 6000; n++) {
      const a = step(live, inputAt(n), t);
      const b = step(again, inputAt(n), t);
      expect(b).toEqual(a);
    }
    expect(again.score).toEqual(live.score);
    expect(again.clock).toBe(live.clock);
    expect(structuredClone(packWorld(again))).toEqual(structuredClone(packWorld(live)));
  });

  it('refuses what is not a game', () => {
    for (const bad of [null, 7, 'game', {}, { players: [], puck: {}, score: [], teams: [], rng: { seed: 's', state: [1, 2, 3, 4] } }, { players: [{}], puck: {}, score: [0, 0], teams: [], rng: { seed: 's', state: [1, 2] } }]) {
      expect(looksPacked(bad)).toBe(false);
    }
  });
});
