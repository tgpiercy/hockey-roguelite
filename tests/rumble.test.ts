import { describe, expect, it } from 'vitest';
import controls from '../src/data/controls.json';
import { buzz, buzzesFor, type BuzzName } from '../src/game/rumbleMap';
import { cloneTuning } from '../src/sim/tuning';
import type { SimEvent, World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { ID } from './helpers';

const t = cloneTuning();
const one = (): World => {
  const world = createWorld(t, 'rumble');
  world.human!.controlled = ID.home1;
  return world;
};
const felt = (world: World, events: SimEvent[]): (BuzzName | null)[] =>
  buzzesFor(events, world).map((b) => (b ? ((Object.keys(controls.rumble.buzzes) as BuzzName[]).find((name) => buzz(name) === b) ?? null) : null));

describe('controller rumble', () => {
  it('every buzz in the table is a sensible strength and a short time', () => {
    for (const [name, b] of Object.entries(controls.rumble.buzzes)) {
      expect(b.strong, name).toBeGreaterThanOrEqual(0);
      expect(b.strong, name).toBeLessThanOrEqual(1);
      expect(b.weak, name).toBeGreaterThanOrEqual(0);
      expect(b.weak, name).toBeLessThanOrEqual(1);
      expect(b.ms, name).toBeGreaterThan(40);
      expect(b.ms, name).toBeLessThanOrEqual(500);
    }
  });

  it('your goal is felt hard, theirs lightly, and nothing happening is nothing', () => {
    const world = one();
    expect(felt(world, [])).toEqual([null, null]);
    expect(felt(world, [{ type: 'goal', side: 1, team: 0, scorer: 1, assists: [] }])[0]).toBe('goalFor');
    expect(felt(world, [{ type: 'goal', side: -1, team: 1, scorer: 8, assists: [] }])[0]).toBe('goalAgainst');
    const mine = buzz('goalFor');
    const theirs = buzz('goalAgainst');
    expect(mine.strong * mine.ms).toBeGreaterThan(theirs.strong * theirs.ms);
  });

  it('a body check is felt by the one who throws it and the one who takes it, a big one more; a poke by nobody', () => {
    const world = one();
    const hit = (player: number, target: number, big = false): SimEvent => ({ type: 'check', player, target, kind: 'body', success: true, ...(big ? { big } : {}) });
    expect(felt(world, [hit(ID.home1, ID.away1)])[0]).toBe('hit');
    expect(felt(world, [hit(ID.away1, ID.home1)])[0]).toBe('hitTaken');
    expect(felt(world, [hit(ID.home1, ID.away1, true)])[0]).toBe('bigHit');
    // A team-mate's hit, a missed one and a poke are not felt.
    expect(felt(world, [hit(ID.home2, ID.away1)])[0]).toBeNull();
    expect(felt(world, [{ type: 'check', player: ID.home1, target: ID.away1, kind: 'body', success: false }])[0]).toBeNull();
    expect(felt(world, [{ type: 'check', player: ID.home1, target: ID.away1, kind: 'poke', success: true }])[0]).toBeNull();
  });

  it('your goalie saving is felt; theirs is not', () => {
    const world = one();
    expect(felt(world, [{ type: 'save', goalie: ID.homeGoalie, frozen: false }])[0]).toBe('save');
    expect(felt(world, [{ type: 'save', goalie: ID.awayGoalie, frozen: false }])[0]).toBeNull();
  });

  it('when two things happen at once the bigger is felt', () => {
    const world = one();
    const both = felt(world, [{ type: 'save', goalie: ID.homeGoalie, frozen: false }, { type: 'goal', side: 1, team: 0, scorer: 1, assists: [] }]);
    expect(both[0]).toBe('goalFor');
  });

  it('with one player there is nothing for a second controller; with two, each feels his own side', () => {
    expect(felt(one(), [{ type: 'goal', side: 1, team: 0, scorer: 1, assists: [] }])[1]).toBeNull();
    const versus = createWorld(t, 'rumble-2', { second: 1 });
    const out = felt(versus, [{ type: 'goal', side: 1, team: 0, scorer: 1, assists: [] }]);
    expect(out).toEqual(['goalFor', 'goalAgainst']);
  });
});
