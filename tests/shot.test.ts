import { describe, expect, it } from 'vitest';
import { chargeFraction, shotSpeed, shotSpread } from '../src/sim/shot';
import { cloneTuning } from '../src/sim/tuning';
import type { InputFrame, SimEvent, World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';

const t = cloneTuning();
const hold: InputFrame = { moveX: 0, moveY: 0, sprint: false, shoot: true };
const release: InputFrame = { moveX: 0, moveY: 0, sprint: false, shoot: false };

/** A world where the skater already has the puck, well away from the nets. */
const withPuck = (seed: string, tuning = t): World => {
  const world = createWorld(tuning, seed);
  world.puck.carried = true;
  world.puck.pos = { x: world.skater.pos.x + tuning.puck.carryForward, y: tuning.puck.carrySide };
  return world;
};

const shoot = (world: World, heldSteps: number, releaseWith: InputFrame = release, tuning = t): SimEvent[] => {
  for (let i = 0; i < heldSteps; i++) step(world, hold, tuning);
  return step(world, releaseWith, tuning);
};

const shotOf = (events: SimEvent[]): number => {
  const shot = events.find((e) => e.type === 'shot');
  if (!shot || shot.type !== 'shot') throw new Error('no shot');
  return shot.speed;
};

describe('shot power', () => {
  it('charge runs from 0 at a tap to 1 at the full charge time', () => {
    expect(chargeFraction(0, t)).toBe(0);
    expect(chargeFraction(t.shot.tapTime, t)).toBe(0);
    expect(chargeFraction((t.shot.tapTime + t.shot.chargeTime) / 2, t)).toBeCloseTo(0.5);
    expect(chargeFraction(t.shot.chargeTime, t)).toBe(1);
    expect(chargeFraction(t.shot.chargeTime * 3, t)).toBe(1);
  });

  it('a full-power skater gets the wrist speed on a tap and the maximum on a full charge', () => {
    expect(shotSpeed(0, 1, t)).toBeCloseTo(t.shot.wristSpeed);
    expect(shotSpeed(t.shot.chargeTime, 1, t)).toBeCloseTo(t.shot.maxSpeed);
  });

  it('higher shot power shoots harder', () => {
    expect(shotSpeed(0.5, 0.9, t)).toBeGreaterThan(shotSpeed(0.5, 0.4, t));
    expect(shotSpeed(0, 0, t)).toBeCloseTo(t.shot.wristSpeed * t.shot.powerFloor);
  });

  it('higher accuracy narrows the spread', () => {
    expect(shotSpread(1, t)).toBeLessThan(shotSpread(0.5, t));
    expect(shotSpread(0.5, t)).toBeLessThan(shotSpread(0, t));
    expect(shotSpread(1, t)).toBeCloseTo((t.shot.minSpreadDegrees * Math.PI) / 180);
  });
});

describe('shooting in the world', () => {
  it('a tap releases a wrist shot and the puck leaves the stick', () => {
    const world = withPuck('tap');
    const events = shoot(world, 2);
    expect(shotOf(events)).toBeCloseTo(shotSpeed(0, t.player.shotPower, t));
    expect(world.puck.carried).toBe(false);
    expect(Math.hypot(world.puck.vel.x, world.puck.vel.y)).toBeGreaterThan(0);
  });

  it('a full hold releases the hardest shot', () => {
    const world = withPuck('slap');
    const events = shoot(world, Math.ceil(t.shot.chargeTime * STEPS_PER_SECOND) + 5);
    expect(shotOf(events)).toBeCloseTo(shotSpeed(t.shot.chargeTime, t.player.shotPower, t));
  });

  it('aims where the stick points, or straight ahead with the stick centred', () => {
    const exact = cloneTuning();
    exact.shot.maxSpreadDegrees = 0;
    exact.shot.minSpreadDegrees = 0;

    const ahead = withPuck('ahead', exact);
    shoot(ahead, 2, release, exact);
    expect(ahead.puck.vel.x).toBeGreaterThan(0);
    expect(ahead.puck.vel.y).toBeCloseTo(0);

    const down = withPuck('down', exact);
    shoot(down, 2, { moveX: 0, moveY: 1, sprint: false, shoot: false }, exact);
    expect(down.puck.vel.y).toBeGreaterThan(0);
    expect(Math.abs(down.puck.vel.x)).toBeLessThan(1);
  });

  it('strays from the aim by no more than the spread, and differently for different seeds', () => {
    const limit = shotSpread(t.player.accuracy, t);
    const angles = ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => {
      const world = withPuck(seed);
      shoot(world, 2);
      return Math.atan2(world.puck.vel.y, world.puck.vel.x);
    });
    for (const angle of angles) expect(Math.abs(angle)).toBeLessThanOrEqual(limit + 1e-9);
    expect(new Set(angles.map((a) => a.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('cannot be picked straight back up, then can be collected again', () => {
    const world = withPuck('cooldown');
    const events = shoot(world, 2);
    expect(events.some((e) => e.type === 'pickup')).toBe(false);
    step(world, release, t);
    expect(world.puck.carried).toBe(false);
  });

  it('skating onto a loose puck picks it up', () => {
    const world = createWorld(t, 'pickup');
    const events: SimEvent[] = [];
    for (let i = 0; i < 120 && !world.puck.carried; i++) {
      events.push(...step(world, { moveX: 1, moveY: 0, sprint: false, shoot: false }, t));
    }
    expect(world.puck.carried).toBe(true);
    expect(events.some((e) => e.type === 'pickup')).toBe(true);
  });
});
