import { describe, expect, it } from 'vitest';
import ai from '../src/data/ai.json';
import { aiInput, aiLevel, inZone, think } from '../src/sim/ai';
import { goalieTarget, stepGoalie } from '../src/sim/goalie';
import { cloneTuning } from '../src/sim/tuning';
import type { World } from '../src/sim/types';
import { createWorld, STEP_SECONDS } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const P = ai.positions;
const sharp = aiLevel(1);

/**
 * No person on either team. The away side carries toward the home net, which is at the left end. The
 * carrier is over centre and not yet in the home zone; home skater 1 is beside him, the other two wide.
 */
const rush = (matesAhead: boolean, seed = 'smart-defence'): World => {
  const world = createWorld(t, seed, { human: false });
  let x = -1;
  while (!inZone(1, x - 1)) x -= 1;
  place(world, ID.away1, x, 0, Math.PI);
  giveTo(world, ID.away1);
  place(world, ID.away2, matesAhead ? x - 8 : x + 8, 6);
  place(world, ID.away3, x + 9, -6);
  place(world, ID.home1, x + 1.5, 1);
  place(world, ID.home2, x - 2, 7);
  place(world, ID.home3, x - 3, -7);
  return world;
};
const plan = (world: World, id: number, level = aiLevel(0.5)): World['players'][number]['ai'] => {
  const p = player(world, id);
  think(world, p, t, level);
  return p.ai;
};

describe('a man coming in alone meets somebody', () => {
  it('with the carrier leading the rush, one of the two men off the puck drops into the lane to the net', () => {
    const world = rush(false);
    const carrier = player(world, ID.away1);
    expect(inZone(1, carrier.pos.x)).toBe(false);
    expect(plan(world, ID.home1).follow).toBe('carrier');
    const plans = [plan(world, ID.home2), plan(world, ID.home3)];
    const inLane = plans.filter((m) => m.follow === 'point' && Math.abs(m.targetY) < 1 && m.targetX < carrier.pos.x - 5);
    expect(inLane).toHaveLength(1);
  });

  it('with one of his team-mates nearer the net than he is, nobody is held back: that man is marked', () => {
    const world = rush(true);
    const ahead = player(world, ID.away2);
    const plans = [plan(world, ID.home2), plan(world, ID.home3)];
    expect(plans.filter((m) => Math.abs(m.targetY) < 1)).toHaveLength(0);
    // One of them goes to the man in front, from the goal side.
    expect(plans.some((m) => Math.hypot(m.targetX - ahead.pos.x, m.targetY - ahead.pos.y) < 3 && m.targetX < ahead.pos.x)).toBe(true);
  });
});

describe('a defender in the shooting lane goes down to block', () => {
  /** The carrier in range of the net; home skater 2 stands on the line from him to it, well clear of him. */
  const laneHeld = (seed?: string): World => {
    const world = rush(false, seed);
    const carrier = player(world, ID.away1);
    place(world, ID.home2, carrier.pos.x - 6, 0);
    return world;
  };

  it('a sharp one holds the check button in the lane, and a dull one mostly does not', () => {
    const world = laneHeld();
    expect(plan(world, ID.home2, sharp).brace).toBe(true);
    const held = aiInput(world, player(world, ID.home2), t, sharp);
    expect(held.check).toBe(true);
    let dull = 0;
    for (let i = 0; i < 200; i++) {
      const fresh = laneHeld(`dull-${i}`);
      if (plan(fresh, ID.home2, aiLevel(0)).brace) dull += 1;
    }
    expect(dull / 200).toBeGreaterThan(ai.levels.blockEagerness[0]! - 0.12);
    expect(dull / 200).toBeLessThan(ai.levels.blockEagerness[0]! + 0.12);
  });

  it('not when the carrier is out of range, nor when he is close enough that holding the button is a hit', () => {
    const far = laneHeld();
    const carrier = player(far, ID.away1);
    place(far, ID.away1, carrier.pos.x + P.blockRange, 0, Math.PI);
    giveTo(far, ID.away1);
    place(far, ID.home2, player(far, ID.away1).pos.x - 6, 0);
    place(far, ID.home1, player(far, ID.away1).pos.x + 1.5, 1);
    expect(plan(far, ID.home2, sharp).brace).toBe(false);
    const close = laneHeld();
    place(close, ID.home2, player(close, ID.away1).pos.x - (t.block.minCarrierDistance - 0.5), 0);
    expect(plan(close, ID.home2, sharp).brace).toBe(false);
  });

  it('he stays down while their shot is on its way, and gets up when the puck is nobody\'s shot', () => {
    const world = laneHeld();
    const me = player(world, ID.home2);
    plan(world, ID.home2, sharp);
    me.ai.thinkIn = 10;
    // The carrier lets it go.
    world.puck.carrier = null;
    world.puck.shotBy = ID.away1;
    world.puck.vel = { x: -30, y: 0 };
    expect(aiInput(world, me, t, sharp).check).toBe(true);
    expect(me.ai.brace).toBe(true);
    world.puck.shotBy = null;
    me.ai.thinkIn = 10;
    expect(aiInput(world, me, t, sharp).check).toBe(false);
    expect(me.ai.brace).toBe(false);
  });
});

describe('a goalie reads a pass', () => {
  /** The away goalie alone, the puck out in front of him to one side, a home skater waiting on the other. */
  const passing = (onItsWay: boolean): World => {
    const world = createWorld(t, 'pass-read', { human: false });
    clearIce(world, [ID.home2]);
    for (const p of world.players) if (p.role === 'skater') p.stagger = 999;
    const goalie = player(world, ID.awayGoalie);
    const netX = goalie.pos.x;
    place(world, ID.home2, netX - 5, 4);
    world.puck.carrier = null;
    world.puck.pos = { x: netX - 8, y: -5 };
    world.puck.vel = { x: 3, y: 9 };
    world.puck.passTarget = onItsWay ? ID.home2 : null;
    // He has been watching it there.
    goalie.goalie!.seen.length = 0;
    for (let i = 0; i < 40; i++) goalie.goalie!.seen.push({ pos: { ...world.puck.pos }, vel: { x: 0, y: 0 }, loose: false });
    return world;
  };

  it('while a pass is on its way to one of their skaters he plays the angle of the man it is going to', () => {
    const plain = goalieTarget(player(passing(false), ID.awayGoalie), passing(false), t);
    const world = passing(true);
    const read = goalieTarget(player(world, ID.awayGoalie), world, t);
    // The puck is on the negative side and the receiver on the positive: he is already across.
    expect(plain.y).toBeLessThan(0);
    expect(read.y).toBeGreaterThan(0);
    expect(t.goalie.passRead).toBeGreaterThan(0);
  });

  it('and he pushes across faster than he shuffles', () => {
    const moved = (onItsWay: boolean): number => {
      const world = passing(onItsWay);
      const goalie = player(world, ID.awayGoalie);
      // The same place to get to in both: only the pass on its way differs.
      goalie.pos.y = -1.4;
      const before = goalie.pos.y;
      world.puck.pos = { x: goalie.pos.x - 6, y: 5 };
      goalie.goalie!.seen.length = 0;
      for (let i = 0; i < 40; i++) goalie.goalie!.seen.push({ pos: { ...world.puck.pos }, vel: { x: 0, y: 0 }, loose: false });
      stepGoalie(goalie, world, t, STEP_SECONDS);
      return Math.abs(goalie.pos.y - before);
    };
    expect(t.goalie.passSlide).toBeGreaterThan(1);
    expect(moved(true)).toBeGreaterThan(moved(false) * 1.2);
  });

  it('a pass between his own skaters, or a shot, is not read as one', () => {
    const world = passing(true);
    world.puck.passTarget = ID.awayGoalie;
    expect(goalieTarget(player(world, ID.awayGoalie), world, t).y).toBeLessThan(0);
  });
});
