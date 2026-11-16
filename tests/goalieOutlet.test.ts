import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { outletTarget, stepGoalieHold } from '../src/sim/goalie';
import { attackDir, givePuck, ownNet } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEP_SECONDS } from '../src/sim/world';
import { ID, place, player } from './helpers';

const t = cloneTuning();

/** The home goalie holding the puck, about to throw it out, with his skaters where the test puts them. */
const holding = (seed = 'outlet'): World => {
  const world = createWorld(t, seed, { human: false });
  const g = player(world, ID.homeGoalie);
  givePuck(world, g);
  g.goalie!.hold = STEP_SECONDS / 2;
  return world;
};
/** Lets him throw it, and returns the way the puck leaves him. */
const thrown = (world: World): { vx: number; vy: number; target: number | null } => {
  const g = player(world, ID.homeGoalie);
  const events: SimEvent[] = [];
  stepGoalieHold(g, world, t, STEP_SECONDS, events);
  const pass = events.find((e) => e.type === 'pass');
  if (!pass || pass.type !== 'pass') throw new Error('he did not throw it');
  return { vx: world.puck.vel.x, vy: world.puck.vel.y, target: pass.target };
};

describe('the goalie throwing the puck out', () => {
  it('never picks a team-mate behind him or beside the net, however open he is', () => {
    const world = holding();
    const g = player(world, ID.homeGoalie);
    const net = ownNet(0, t);
    // One skater behind the goal line, wide open; the others up the ice among opponents.
    place(world, ID.home1, net.x - 2, 6);
    place(world, ID.home2, 4, -3);
    place(world, ID.home3, 6, 3);
    place(world, ID.away1, 4.5, -3);
    place(world, ID.away2, 6.5, 3);
    place(world, ID.away3, 5, 0);
    const target = outletTarget(g, world, t);
    expect(target).not.toBeNull();
    expect(target!.id).not.toBe(ID.home1);
    expect(attackDir(0) * (target!.pos.x - g.pos.x)).toBeGreaterThanOrEqual(t.goalie.outletMinAhead);
  });

  it('with every team-mate behind him he throws it straight up the ice to nobody', () => {
    const world = holding();
    const net = ownNet(0, t);
    place(world, ID.home1, net.x - 2, 6);
    place(world, ID.home2, net.x - 2, -6);
    place(world, ID.home3, net.x - 1, 0.5);
    expect(outletTarget(player(world, ID.homeGoalie), world, t)).toBeNull();
    const out = thrown(world);
    expect(out.target).toBeNull();
    expect(attackDir(0) * out.vx).toBeGreaterThan(0);
    expect(out.vy).toBeCloseTo(0);
  });

  it('a team-mate far out to the side is thrown to, but never at more than the widest angle', () => {
    const world = holding();
    const g = player(world, ID.homeGoalie);
    place(world, ID.home1, g.pos.x + t.goalie.outletMinAhead + 0.2, 11);
    place(world, ID.home2, g.pos.x - 3, 5);
    place(world, ID.home3, g.pos.x - 3, -5);
    const out = thrown(world);
    const angle = Math.abs(Math.atan2(out.vy, attackDir(0) * out.vx));
    expect((angle * 180) / Math.PI).toBeLessThanOrEqual(t.goalie.outletMaxAngleDegrees + 1e-6);
    expect(attackDir(0) * out.vx).toBeGreaterThan(0);
  });

  it('wherever his skaters stand, the puck he throws never ends up in his own net', () => {
    const rng = createRng('outlet-anywhere');
    const net = ownNet(0, t);
    for (let i = 0; i < 300; i++) {
      const world = holding(`outlet-${i}`);
      // His own skaters anywhere near the net, in front or behind; the others far away.
      for (const id of [ID.home1, ID.home2, ID.home3]) place(world, id, net.x + rng.range(-3.5, 9), rng.range(-12, 12));
      for (const id of [ID.away1, ID.away2, ID.away3]) place(world, id, 20, rng.range(-10, 10));
      for (const p of world.players) if (p.role === 'skater') p.ai.thinkIn = 99;
      const g = player(world, ID.homeGoalie);
      g.pos.y = rng.range(-1.2, 1.2);
      let scoredOnSelf = false;
      for (let s = 0; s < 150 && !scoredOnSelf; s++) {
        for (const e of step(world, NO_INPUT, t)) if (e.type === 'goal' && e.team === 1) scoredOnSelf = true;
      }
      expect(scoredOnSelf, `try ${i}`).toBe(false);
    }
  });
});
