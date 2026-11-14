import { describe, expect, it } from 'vitest';
import { updateControl } from '../src/sim/control';
import { passTarget, stepPassing } from '../src/sim/pass';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createWorld, STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/world';
import { clearIce, flyPuck, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();

/**
 * Passer at centre with the puck; one teammate 10 m up ice and 6 m to the right, the other off to the left;
 * the opponents in the corners.
 */
const setUp = (seed = 'pass'): World => {
  const world = createWorld(t, seed);
  clearIce(world, [ID.home1, ID.home2, ID.home3]);
  place(world, ID.home1, 0, 0);
  place(world, ID.home2, 10, 6);
  place(world, ID.home3, 3, -9);
  giveTo(world, ID.home1);
  for (const p of world.players) p.fx = { ...p.fx, passSpreadDegrees: 0 };
  return world;
};

/** Holds pass for some steps, then lets go with the stick pointing at (aimX, aimY). */
const pass = (world: World, heldSteps: number, aimX: number, aimY: number): SimEvent[] => {
  const events: SimEvent[] = [];
  const passer = player(world, ID.home1);
  const held: InputFrame = { ...NO_INPUT, pass: true };
  for (let i = 0; i < heldSteps; i++) stepPassing(world, passer, held, t, STEP_SECONDS, events);
  stepPassing(world, passer, { ...NO_INPUT, moveX: aimX, moveY: aimY }, t, STEP_SECONDS, events);
  return events;
};

const saucerSteps = Math.ceil(t.pass.saucerHoldTime * STEPS_PER_SECOND) + 1;

describe('pass targeting', () => {
  it('picks the teammate the stick points toward', () => {
    const world = setUp();
    const passer = player(world, ID.home1);
    expect(passTarget(world, passer, Math.atan2(6, 10), t.pass.speed, t)?.id).toBe(ID.home2);
    expect(passTarget(world, passer, 0, t.pass.speed, t)?.id).toBe(ID.home2);
    expect(passTarget(world, passer, -Math.PI / 2, t.pass.speed, t)?.id).toBe(ID.home3);
  });

  it('picks nobody when the stick points away from every teammate', () => {
    const world = setUp();
    expect(passTarget(world, player(world, ID.home1), Math.PI, t.pass.speed, t)).toBe(null);
  });

  it('sends the puck at the teammate, and marks him as the receiver', () => {
    const world = setUp();
    const events = pass(world, 1, 1, 0.3);
    expect(events).toEqual([{ type: 'pass', player: ID.home1, target: ID.home2, saucer: false }]);
    expect(world.puck.carrier).toBe(null);
    expect(world.puck.passTarget).toBe(ID.home2);
    const mate = player(world, ID.home2);
    const toMate = Math.atan2(mate.pos.y - world.puck.pos.y, mate.pos.x - world.puck.pos.x);
    expect(Math.atan2(world.puck.vel.y, world.puck.vel.x)).toBeCloseTo(toMate, 5);
    expect(Math.hypot(world.puck.vel.x, world.puck.vel.y)).toBeCloseTo(t.pass.speed * player(world, ID.home1).fx.passSpeedScale);
  });

  it('leads a moving teammate: the pass is aimed ahead of where he is now', () => {
    const world = setUp();
    const mate = player(world, ID.home2);
    mate.vel = { x: 8, y: 0 };
    pass(world, 1, 1, 0.5);
    const toMateNow = Math.atan2(mate.pos.y - world.puck.pos.y, mate.pos.x - world.puck.pos.x);
    // He is skating toward +x, so the pass angle is flatter (smaller) than straight at him.
    expect(Math.atan2(world.puck.vel.y, world.puck.vel.x)).toBeLessThan(toMateNow - 0.05);
  });

  it('with nobody in that direction, the puck just goes where the stick points', () => {
    const world = setUp();
    const events = pass(world, 1, -1, 0);
    expect(events[0]).toMatchObject({ type: 'pass', target: null });
    expect(world.puck.vel.x).toBeLessThan(0);
    expect(world.puck.vel.y).toBeCloseTo(0);
  });
});

describe('pass completion', () => {
  it('the receiver catches a flat pass', () => {
    const world = setUp();
    pass(world, 1, 1, 0.6);
    const events = flyPuck(world, t, 120);
    expect(events).toEqual([{ type: 'pickup', player: ID.home2 }]);
    expect(world.puck.carrier).toBe(ID.home2);
  });

  it('an opponent standing in the lane picks off a flat pass', () => {
    const world = setUp();
    place(world, ID.away1, 5, 3);
    pass(world, 1, 1, 0.6);
    flyPuck(world, t, 120);
    expect(world.puck.carrier).toBe(ID.away1);
  });

  it('a held pass is a saucer: it flies over the same opponent and reaches the receiver', () => {
    const world = setUp();
    place(world, ID.away1, 5, 3);
    const events = pass(world, saucerSteps, 1, 0.6);
    expect(events[0]).toMatchObject({ type: 'pass', saucer: true });
    expect(world.puck.air).toBeGreaterThan(0);
    flyPuck(world, t, 120);
    expect(world.puck.carrier).toBe(ID.home2);
  });

  it('the passer cannot catch his own pass straight away', () => {
    const world = setUp();
    pass(world, 1, -1, 0);
    expect(player(world, ID.home1).pickupLock).toBeGreaterThan(0);
    flyPuck(world, t, 3);
    expect(world.puck.carrier).toBe(null);
  });
});

describe('who the human controls', () => {
  it('control goes with the pass to the receiver', () => {
    const world = setUp();
    expect(world.human?.controlled).toBe(ID.home1);
    pass(world, 1, 1, 0.6);
    expect(world.human?.controlled).toBe(ID.home2);
  });

  it('with the puck, the carrier is always the controlled skater', () => {
    const world = setUp();
    giveTo(world, ID.home2);
    updateControl(world, NO_INPUT);
    expect(world.human?.controlled).toBe(ID.home2);
  });

  it('on defence, the switch button jumps to the skater nearest the puck, once per press', () => {
    const world = setUp();
    giveTo(world, ID.away1);
    place(world, ID.away1, 10, 5);
    world.puck.pos = { x: 10, y: 5 };
    world.human!.controlled = ID.home1;
    const press: InputFrame = { ...NO_INPUT, switchPlayer: true };

    updateControl(world, press);
    expect(world.human?.controlled).toBe(ID.home2);
    updateControl(world, press);
    expect(world.human?.controlled).toBe(ID.home2);
    updateControl(world, NO_INPUT);
    updateControl(world, press);
    // Already on the nearest skater: the press moves to the other one.
    expect(world.human?.controlled).toBe(ID.home1);
  });
});
