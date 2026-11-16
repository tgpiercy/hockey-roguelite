import { describe, expect, it } from 'vitest';
import { goalieHelped, goalieTarget } from '../src/sim/goalie';
import { ownNet } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import type { World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();

/** An opponent with the puck in front of the home net; the home skaters are where the test puts them. */
const scene = (human: boolean): World => {
  const world = createWorld(t, 'goalie-assist', { human });
  clearIce(world, [ID.away1, ID.home1]);
  place(world, ID.away1, -12, 0, Math.PI);
  giveTo(world, ID.away1);
  return world;
};

describe('goalie assist', () => {
  it('helps the goalie of a team a person plays on when the carrier has nobody in front of him', () => {
    const world = scene(true);
    // Every home skater behind the carrier: a man in alone.
    for (const p of world.players) if (p.team === 0 && p.role === 'skater' && p.onIce) p.pos.x = 5;
    expect(goalieHelped(player(world, ID.homeGoalie), world, t)).toBe(true);
    // A defender between him and the net: it is his job, and the goalie gets no help.
    place(world, ID.home1, -16, 0);
    expect(goalieHelped(player(world, ID.homeGoalie), world, t)).toBe(false);
  });

  it('never helps a team with no person on it, or the other goalie, and can be switched off', () => {
    const allAi = scene(false);
    for (const p of allAi.players) if (p.team === 0 && p.role === 'skater' && p.onIce) p.pos.x = 5;
    expect(goalieHelped(player(allAi, ID.homeGoalie), allAi, t)).toBe(false);

    const world = scene(true);
    for (const p of world.players) if (p.team === 0 && p.role === 'skater' && p.onIce) p.pos.x = 5;
    // The away goalie faces no attacker of the other side with the puck.
    expect(goalieHelped(player(world, ID.awayGoalie), world, t)).toBe(false);
    const off = cloneTuning();
    off.goalieAssist.strength = 0;
    expect(goalieHelped(player(world, ID.homeGoalie), world, off)).toBe(false);
  });

  it('still counts just after the shot: the man who shot it had the clear path', () => {
    const world = scene(true);
    for (const p of world.players) if (p.team === 0 && p.role === 'skater' && p.onIce) p.pos.x = 5;
    world.puck.carrier = null;
    world.puck.shotBy = ID.away1;
    expect(goalieHelped(player(world, ID.homeGoalie), world, t)).toBe(true);
    world.puck.shotBy = null;
    expect(goalieHelped(player(world, ID.homeGoalie), world, t)).toBe(false);
  });

  it('helped, he comes further out against a carrier straight in front', () => {
    const net = ownNet(0, t);
    const depthOf = (world: World): number => {
      const g = player(world, ID.homeGoalie);
      // Let him see the play as it is now.
      g.goalie!.seen.length = 0;
      const target = goalieTarget(g, world, t);
      return Math.hypot(target.x - net.x, target.y - net.y);
    };
    const alone = scene(true);
    for (const p of alone.players) if (p.team === 0 && p.role === 'skater' && p.onIce) p.pos.x = 5;
    const covered = scene(true);
    for (const p of covered.players) if (p.team === 0 && p.role === 'skater' && p.onIce) p.pos.x = 5;
    place(covered, ID.home1, -16, 6);
    expect(depthOf(alone) - depthOf(covered)).toBeCloseTo(t.goalieAssist.challengeDepth * t.goalieAssist.strength);
  });
});
