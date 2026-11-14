import { describe, expect, it } from 'vitest';
import { goalieTarget } from '../src/sim/goalie';
import type { GoalieRatings } from '../src/sim/ratings';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';
import { clearIce, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);
const rated = (value: number): GoalieRatings => ({ reflexes: value, positioning: value, reboundControl: value, stamina: value });

/** A full world with every skater parked in a corner and unable to act: just the puck and the away goalie. */
const setUp = (seed: string, goalie = rated(70)): World => {
  const world = createWorld(t, seed, { human: false, goalieRatings: [rated(70), goalie] });
  clearIce(world, []);
  for (const p of world.players) if (p.role === 'skater') p.stagger = 999;
  return world;
};

const run = (world: World, seconds: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) events.push(...step(world, NO_INPUT, t));
  return events;
};

/** Leaves the puck still at a spot long enough for the goalie to set himself against it. */
const settle = (world: World, x: number, y: number): void => {
  for (let i = 0; i < 90; i++) {
    world.puck.pos = { x, y };
    world.puck.vel = { x: 0, y: 0 };
    step(world, NO_INPUT, t);
  }
};

const shootAt = (world: World, targetY: number, speed: number): void => {
  const puck = world.puck;
  const angle = Math.atan2(targetY - puck.pos.y, gx - puck.pos.x);
  puck.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
};

const scored = (events: SimEvent[]): boolean => events.some((e) => e.type === 'goal');

describe('goalie positioning', () => {
  it('stands on the line between the puck and the middle of the net, a set depth out', () => {
    const world = setUp('angle');
    settle(world, gx - 8, 6);
    const goalie = player(world, ID.awayGoalie);
    const depth = goalie.goalie!.fx.depth;
    const d = Math.hypot(8, 6);
    expect(goalie.pos.x).toBeCloseTo(gx - (8 / d) * depth, 2);
    expect(goalie.pos.y).toBeCloseTo((6 / d) * depth, 2);
  });

  it('follows the puck from side to side but stays in the crease', () => {
    const world = setUp('crease');
    settle(world, gx - 2, 12);
    const goalie = player(world, ID.awayGoalie);
    expect(goalie.pos.y).toBeGreaterThan(0);
    expect(goalie.pos.y).toBeLessThanOrEqual(t.goalie.creaseHalfWidth + 1e-9);
    expect(Math.abs(goalie.pos.x - gx)).toBeLessThan(2);
  });

  it('hugs the near post when the puck is behind the goal line', () => {
    const world = setUp('behind');
    world.puck.pos = { x: gx + 2, y: 5 };
    const target = goalieTarget(player(world, ID.awayGoalie), world, t);
    expect(target.y).toBeGreaterThan(0);
    expect(target.x).toBeLessThan(gx);
  });
});

describe('goalie saves', () => {
  it('stops a straight shot when he is set', () => {
    const world = setUp('straight');
    settle(world, gx - 10, 0);
    shootAt(world, 0, 30);
    const events = run(world, 1);
    expect(events.some((e) => e.type === 'save')).toBe(true);
    expect(scored(events)).toBe(false);
    expect(world.score).toEqual([0, 0]);
  });

  /** Shots from one spot aimed at points all the way across the net mouth: how many get past him? */
  const TARGETS = 41;
  const goalsFrom = (label: string, goalie: GoalieRatings, prepare: (world: World) => void): number => {
    let goals = 0;
    for (let i = 0; i < TARGETS; i++) {
      const world = setUp(`${label}-${i}`, goalie);
      prepare(world);
      const half = t.net.mouthWidth / 2 - 0.1;
      shootAt(world, -half + (2 * half * i) / (TARGETS - 1), 30);
      if (scored(run(world, 0.6))) goals++;
    }
    return goals;
  };
  /** The puck has been sitting on the right side: he is set for the shot. */
  const set = (world: World): void => settle(world, gx - 5, 4);
  /** He is set on the left side, then the puck crosses to the right in a fifth of a second. */
  const crossIce = (world: World): void => {
    settle(world, gx - 5, -4);
    world.puck.vel = { x: 0, y: 40 };
    run(world, 0.2);
    world.puck.pos = { x: gx - 5, y: 4 };
  };

  it('is beaten more often by a quick cross-ice pass and shot than by a shot he is set for', () => {
    const setGoals = goalsFrom('set', rated(70), set);
    const crossGoals = goalsFrom('cross', rated(70), crossIce);
    expect(setGoals).toBeLessThan(TARGETS);
    expect(crossGoals).toBeGreaterThan(setGoals);
  });

  it('a better goalie stops more, set or not', () => {
    const against = (rating: number): number =>
      goalsFrom(`set-${rating}`, rated(rating), set) + goalsFrom(`cross-${rating}`, rated(rating), crossIce);
    expect(against(95)).toBeLessThan(against(35));
  });
});

describe('freezing and rebounds', () => {
  const save = (speed: number, goalie = rated(70)): { events: SimEvent[]; world: World } => {
    const world = setUp('rebound', goalie);
    settle(world, gx - 8, 0);
    shootAt(world, 0, speed);
    // Run until he has dealt with it.
    const events: SimEvent[] = [];
    for (let i = 0; i < 2 * STEPS_PER_SECOND && !events.some((e) => e.type === 'save'); i++) {
      events.push(...step(world, NO_INPUT, t));
    }
    return { events, world };
  };
  const firstSave = (events: SimEvent[]) => events.find((e) => e.type === 'save');

  it('freezes a soft shot and holds the puck', () => {
    const { events, world } = save(12);
    expect(firstSave(events)).toMatchObject({ type: 'save', goalie: ID.awayGoalie, frozen: true });
    expect(world.puck.carrier).toBe(ID.awayGoalie);
  });

  it('kicks a hard shot out as a rebound, slower than it came in', () => {
    const { events, world } = save(36);
    expect(firstSave(events)).toMatchObject({ frozen: false });
    expect(world.puck.carrier).toBe(null);
    expect(Math.hypot(world.puck.vel.x, world.puck.vel.y)).toBeLessThan(36);
    expect(world.score).toEqual([0, 0]);
  });

  it('better rebound control freezes harder shots', () => {
    expect(firstSave(save(26, rated(100)).events)).toMatchObject({ frozen: true });
    expect(firstSave(save(26, rated(20)).events)).toMatchObject({ frozen: false });
  });

  it('after holding a frozen puck, passes it out to a teammate', () => {
    const { world } = save(12);
    const events = run(world, t.goalie.holdSeconds + 0.2);
    const pass = events.find((e) => e.type === 'pass');
    expect(pass).toMatchObject({ type: 'pass', player: ID.awayGoalie, saucer: true });
    expect([ID.away1, ID.away2, ID.away3]).toContain(pass && pass.type === 'pass' ? pass.target : -1);
    expect(world.puck.carrier).not.toBe(ID.awayGoalie);
  });

  it('smothers a puck that a skater tries to carry into him', () => {
    const world = setUp('smother');
    settle(world, gx - 6, 0);
    const goalie = player(world, ID.awayGoalie);
    const carrier = place(world, ID.home1, goalie.pos.x - 1.2, goalie.pos.y, 0);
    carrier.stagger = 0;
    carrier.ai.thinkIn = 99;
    world.puck.carrier = ID.home1;
    world.puck.pos = { x: goalie.pos.x - 0.3, y: goalie.pos.y };
    const events = run(world, 0.1);
    expect(firstSave(events)).toMatchObject({ frozen: true });
    expect(world.puck.carrier).toBe(ID.awayGoalie);
    expect(world.score).toEqual([0, 0]);
  });
});
