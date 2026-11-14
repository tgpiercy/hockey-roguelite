import { describe, expect, it } from 'vitest';
import { checkKind, stepChecking } from '../src/sim/check';
import { skaterEffects, type SkaterRatings } from '../src/sim/ratings';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const press: InputFrame = { ...NO_INPUT, check: true };

/** Tuning where checks always work (or never do), so the outcome is not down to luck. */
const tuningWithChance = (chance: number) => {
  const t = cloneTuning();
  t.check.bodyBaseChance = chance;
  t.check.pokeBaseChance = chance;
  t.check.ratingSwing = 0;
  return t;
};
const sure = tuningWithChance(1);

/** Opponent carrier at centre facing +x; home checker `gap` metres behind him, moving at `speed` toward him. */
const setUp = (gap: number, speed: number, seed = 'check'): World => {
  const world = createWorld(sure, seed);
  clearIce(world, [ID.home1, ID.away1]);
  place(world, ID.away1, 0, 0, 0);
  giveTo(world, ID.away1);
  const checker = place(world, ID.home1, -gap, 0, 0);
  checker.vel = { x: speed, y: 0 };
  return world;
};

const check = (world: World, t = sure): SimEvent[] => {
  const events: SimEvent[] = [];
  stepChecking(world, player(world, ID.home1), press, t, events);
  return events;
};

describe('body check', () => {
  it('close and closing in: knocks the puck loose and staggers the carrier', () => {
    const world = setUp(1.2, sure.check.minClosingSpeed + 1);
    expect(checkKind(player(world, ID.home1), player(world, ID.away1), world, sure)).toBe('body');
    const events = check(world);
    expect(events).toEqual([{ type: 'check', player: ID.home1, target: ID.away1, kind: 'body', success: true }]);
    expect(world.puck.carrier).toBe(null);
    expect(Math.hypot(world.puck.vel.x, world.puck.vel.y)).toBeGreaterThan(0);
    const carrier = player(world, ID.away1);
    expect(carrier.stagger).toBeCloseTo(sure.check.staggerSeconds);
    expect(carrier.pickupLock).toBeGreaterThan(0);
  });

  it('slows the checker down', () => {
    const world = setUp(1.2, 8);
    check(world);
    expect(player(world, ID.home1).vel.x).toBeCloseTo(8 * sure.check.checkerSpeedKeep);
  });

  it('a failed check leaves the carrier with the puck', () => {
    const never = tuningWithChance(0);
    const world = setUp(1.2, 8);
    const events = check(world, never);
    expect(events[0]).toMatchObject({ kind: 'body', success: false });
    expect(world.puck.carrier).toBe(ID.away1);
    expect(player(world, ID.away1).stagger).toBe(0);
  });

  it('a staggered skater cannot be steered until he recovers: he only slows down', () => {
    const world = setUp(1.2, 8);
    check(world);
    place(world, ID.home1, -20, 8);
    const carrier = player(world, ID.away1);
    carrier.vel = { x: 5, y: 0 };
    for (let i = 0; i < 10; i++) step(world, NO_INPUT, sure);
    expect(carrier.stagger).toBeGreaterThan(0);
    expect(carrier.vel.x).toBeLessThan(5);
    expect(carrier.vel.x).toBeGreaterThan(0);
    expect(carrier.vel.y).toBeCloseTo(0);
  });
});

describe('big hit', () => {
  it('thrown while closing fast, a body check puts the carrier on the ice for longer than a stagger', () => {
    expect(sure.check.knockdownSeconds).toBeGreaterThan(sure.check.staggerSeconds);
    const world = setUp(1.2, sure.check.bigHitClosingSpeed + 2);
    const events = check(world);
    expect(events[0]).toMatchObject({ kind: 'body', success: true, big: true });
    const carrier = player(world, ID.away1);
    expect(carrier.stagger).toBeCloseTo(sure.check.knockdownSeconds);
    expect(carrier.knockedDown).toBe(true);
    // He gets up when the time is served.
    for (let i = 0; i < 60 * (sure.check.knockdownSeconds + 0.2); i++) step(world, NO_INPUT, sure);
    expect(carrier.stagger).toBe(0);
    expect(carrier.knockedDown).toBe(false);
  });

  it('below that speed it is an ordinary check: a stagger, and he stays on his feet', () => {
    const world = setUp(1.2, sure.check.bigHitClosingSpeed - 1);
    const events = check(world);
    expect(events[0]).toMatchObject({ kind: 'body', success: true });
    expect(events[0]).not.toHaveProperty('big');
    expect(player(world, ID.away1).knockedDown).toBe(false);
    expect(player(world, ID.away1).stagger).toBeCloseTo(sure.check.staggerSeconds);
  });

  it('a big hit that fails knocks nobody down', () => {
    const world = setUp(1.2, sure.check.bigHitClosingSpeed + 2);
    const events = check(world, tuningWithChance(0));
    expect(events[0]).toMatchObject({ success: false });
    expect(player(world, ID.away1).knockedDown).toBe(false);
  });
});

describe('deke', () => {
  const deke: InputFrame = { ...NO_INPUT, switchPlayer: true };
  /** The opponent carrier is the human here, so his switch button is a deke. */
  const carrying = (): World => {
    const world = createWorld(sure, 'deke');
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.home1, 0, 0, 0);
    giveTo(world, ID.home1);
    world.human!.controlled = ID.home1;
    return world;
  };

  it('with the puck, the switch button is a sidestep that costs stamina and starts a cooldown', () => {
    const world = carrying();
    const p = player(world, ID.home1);
    const events = step(world, { ...deke, moveX: 0, moveY: 1 }, sure);
    expect(events.some((e) => e.type === 'deke' && e.player === ID.home1)).toBe(true);
    expect(p.deke).toBeGreaterThan(0);
    expect(p.dekeCooldown).toBeGreaterThan(sure.deke.cooldownSeconds - 0.1);
    expect(p.stamina).toBeCloseTo(1 - sure.deke.staminaCost, 1);
    // He was pushed the way the stick pointed: down the screen.
    expect(p.vel.y).toBeGreaterThan(1);
    expect(world.puck.carrier).toBe(ID.home1);
  });

  it('a check thrown during the deke misses; the same check without it lands', () => {
    const setUpCheck = (withDeke: boolean): World => {
      const world = setUp(1.2, sure.check.minClosingSpeed + 1);
      if (withDeke) player(world, ID.away1).deke = sure.deke.windowSeconds;
      return world;
    };
    const dodged = setUpCheck(true);
    expect(check(dodged)[0]).toMatchObject({ kind: 'body', success: false });
    expect(dodged.puck.carrier).toBe(ID.away1);
    expect(player(dodged, ID.away1).stagger).toBe(0);
    const caught = setUpCheck(false);
    expect(check(caught)[0]).toMatchObject({ kind: 'body', success: true });
  });

  it('cannot be used again until the cooldown is over, nor without the puck, nor when out of breath', () => {
    const world = carrying();
    const count = (events: SimEvent[]): number => events.filter((e) => e.type === 'deke').length;
    expect(count(step(world, deke, sure))).toBe(1);
    step(world, NO_INPUT, sure);
    expect(count(step(world, deke, sure))).toBe(0);
    for (let i = 0; i < 60 * (sure.deke.cooldownSeconds + 0.1); i++) step(world, NO_INPUT, sure);
    step(world, NO_INPUT, sure);
    player(world, ID.home1).stamina = sure.deke.staminaCost / 2;
    expect(count(step(world, deke, sure))).toBe(0);
    // Without the puck the button switches player and nobody dekes.
    const other = createWorld(sure, 'no-puck');
    clearIce(other, [ID.home1]);
    place(other, ID.home1, 0, 0);
    other.puck.pos = { x: 15, y: 8 };
    expect(count(step(other, deke, sure))).toBe(0);
  });
});

describe('poke check', () => {
  /** The checker stands still beside the puck, stick side on, facing it (or facing away). */
  const beside = (facing: number): World => {
    const world = setUp(6, 0);
    place(world, ID.home1, world.puck.pos.x, -1.4, facing);
    return world;
  };

  it('standing near the puck and facing it: jars it loose without a stagger', () => {
    const world = beside(Math.PI / 2);
    expect(checkKind(player(world, ID.home1), player(world, ID.away1), world, sure)).toBe('poke');
    const events = check(world);
    expect(events[0]).toMatchObject({ kind: 'poke', success: true });
    expect(world.puck.carrier).toBe(null);
    expect(player(world, ID.away1).stagger).toBe(0);
  });

  it('reaches about a stick length: well beyond a body check, and no further', () => {
    expect(sure.check.pokeRange).toBeGreaterThan(sure.check.bodyRange + 1);
    const at = (gap: number): World => {
      const world = setUp(6, 0);
      place(world, ID.home1, world.puck.pos.x, -gap, Math.PI / 2);
      return world;
    };
    // From a distance: the puck comes loose and the carrier is not staggered.
    const far = at(sure.check.pokeRange - 0.3);
    expect(checkKind(player(far, ID.home1), player(far, ID.away1), far, sure)).toBe('poke');
    expect(check(far)[0]).toMatchObject({ kind: 'poke', success: true });
    expect(far.puck.carrier).toBe(null);
    expect(player(far, ID.away1).stagger).toBe(0);
    // Beyond the stick: nothing.
    const beyond = at(sure.check.pokeRange + 0.5);
    expect(checkKind(player(beyond, ID.home1), player(beyond, ID.away1), beyond, sure)).toBe(null);
    expect(check(beyond)).toEqual([]);
    expect(beyond.puck.carrier).toBe(ID.away1);
  });

  it('up close and closing in, it is still a body check that staggers', () => {
    const world = setUp(sure.check.bodyRange - 0.2, sure.check.minClosingSpeed + 2);
    expect(checkKind(player(world, ID.home1), player(world, ID.away1), world, sure)).toBe('body');
    expect(check(world)[0]).toMatchObject({ kind: 'body', success: true });
    expect(player(world, ID.away1).stagger).toBeGreaterThan(0);
  });

  it('does nothing when the puck is behind the checker', () => {
    const world = beside(-Math.PI / 2);
    expect(check(world)).toEqual([]);
    expect(world.puck.carrier).toBe(ID.away1);
  });
});

describe('check limits', () => {
  it('out of range it does nothing, but still costs the cooldown', () => {
    const world = setUp(6, 8);
    expect(check(world)).toEqual([]);
    expect(world.puck.carrier).toBe(ID.away1);
    expect(player(world, ID.home1).checkCooldown).toBeCloseTo(sure.check.cooldownSeconds);
  });

  it('needs a fresh press, and cannot be thrown again during the cooldown', () => {
    const world = setUp(6, 8);
    const checker = player(world, ID.home1);
    check(world);
    // Now in range, but the button is still held and the cooldown is running.
    place(world, ID.home1, -1.2, 0).vel = { x: 8, y: 0 };
    expect(check(world)).toEqual([]);
    stepChecking(world, checker, NO_INPUT, sure, []);
    expect(check(world)).toEqual([]);
    checker.checkCooldown = 0;
    stepChecking(world, checker, NO_INPUT, sure, []);
    expect(check(world)).toHaveLength(1);
  });

  it('cannot check a teammate, or while carrying the puck', () => {
    const world = setUp(1.2, 8);
    giveTo(world, ID.home2);
    place(world, ID.home2, 0, 0);
    expect(check(world)).toEqual([]);
    giveTo(world, ID.home1);
    expect(check(world)).toEqual([]);
  });

  it('a strong checker beats a weak puck handler more often than the reverse', () => {
    const t = cloneTuning();
    const rated = (checking: number, puckControl: number): SkaterRatings => ({
      shooting: 70,
      passing: 70,
      speed: 70,
      stamina: 70,
      checking,
      puckControl,
    });
    const wins = (checking: number, puckControl: number): number => {
      let count = 0;
      for (let i = 0; i < 300; i++) {
        const world = setUp(1.2, 8, `swing-${i}`);
        player(world, ID.home1).fx = skaterEffects(rated(checking, 70));
        player(world, ID.away1).fx = skaterEffects(rated(70, puckControl));
        if (check(world, t)[0]?.type === 'check' && world.puck.carrier === null) count++;
      }
      return count;
    };
    const strong = wins(95, 40);
    const weak = wins(40, 95);
    expect(strong).toBeGreaterThan(weak + 20);
    expect(weak).toBeGreaterThan(0);
  });
});
