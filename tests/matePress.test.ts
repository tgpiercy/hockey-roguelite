import { describe, expect, it } from 'vitest';
import ai from '../src/data/ai.json';
import { aiLevel, think } from '../src/sim/ai';
import { cloneTuning } from '../src/sim/tuning';
import type { World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const lv = aiLevel(0.5);
const P = ai.positions;

/**
 * The other team carrying the puck in the home end. Home skater 1 is the nearest man to the carrier
 * (and, with a person playing, the one the person controls); skaters 2 and 3 are further off.
 */
const defending = (human: boolean, gap: number): World => {
  const world = createWorld(t, 'mate-press', { human });
  place(world, ID.away1, -10, 0, Math.PI);
  giveTo(world, ID.away1);
  place(world, ID.away2, -6, 8);
  place(world, ID.away3, -6, -8);
  // The home net is at the left end: the defenders stand between the carrier and it.
  place(world, ID.home1, -10 - gap, 0.5);
  place(world, ID.home2, -10 - gap - 3, 4);
  place(world, ID.home3, -10 - gap - 6, -6);
  if (world.human) world.human.controlled = ID.home1;
  return world;
};
const goesToCarrier = (world: World, id: number): boolean => {
  const p = player(world, id);
  think(world, p, t, lv);
  return p.ai.follow === 'carrier';
};

describe('a person cannot be everywhere: his nearest AI team-mate goes to the carrier too', () => {
  it('with the person well off the carrier, one AI team-mate holds the lane to the net and the other presses', () => {
    const world = defending(true, P.matePressGap + 2);
    const pressers = [ID.home2, ID.home3].filter((id) => goesToCarrier(world, id));
    expect(pressers).toHaveLength(1);
    // The other is the last man back: he goes to a spot between the carrier and his own net, in the lane.
    const holder = player(world, pressers[0] === ID.home2 ? ID.home3 : ID.home2);
    const carrier = player(world, ID.away1);
    expect(holder.ai.follow).toBe('point');
    expect(holder.ai.targetX).toBeLessThan(carrier.pos.x);
    expect(Math.abs(holder.ai.targetY)).toBeLessThan(1);
  });

  it('the last man is the one nearest the lane, whoever is nearer the carrier', () => {
    const world = defending(true, P.matePressGap + 2);
    // Home 3 stands in front of his net; home 2 is up beside the play.
    place(world, ID.home3, -15.5, -0.5);
    place(world, ID.home2, -12, 6);
    expect(goesToCarrier(world, ID.home3)).toBe(false);
    expect(goesToCarrier(world, ID.home2)).toBe(true);
  });

  it('with the person right on the carrier, his team-mates leave it to him', () => {
    const world = defending(true, P.matePressGap - 1);
    expect(goesToCarrier(world, ID.home2)).toBe(false);
    expect(goesToCarrier(world, ID.home3)).toBe(false);
  });

  it('before the carrier is over centre nobody is sent', () => {
    const world = defending(true, P.matePressGap + 2);
    // Move the whole play up the ice, beyond the line the help starts at.
    const shift = 10 + P.matePressFromX + 12;
    for (const p of world.players) if (p.role === 'skater') p.pos.x += shift;
    world.puck.pos.x += shift;
    expect(goesToCarrier(world, ID.home2)).toBe(false);
  });

  it('a team with nobody playing on it sends its one nearest man, as it always did', () => {
    const world = defending(false, P.matePressGap + 2);
    expect(goesToCarrier(world, ID.home1)).toBe(true);
    expect(goesToCarrier(world, ID.home2)).toBe(false);
    expect(goesToCarrier(world, ID.home3)).toBe(false);
  });
});
