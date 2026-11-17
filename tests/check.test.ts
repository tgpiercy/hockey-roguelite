import { checkRules } from '../src/sim/check';
import { dekeAngle, dekeThreat, wrongFoot } from '../src/sim/deke';
import { describe, expect, it } from 'vitest';
import { checkKind, resolveCheck, stepChecking } from '../src/sim/check';
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

/** Opponent carrier at centre, facing the home checker, who is `gap` metres away and moving at `speed` toward him. (A poke by your own skater works from in front or the side, not from behind.) */
const setUp = (gap: number, speed: number, seed = 'check'): World => {
  const world = createWorld(sure, seed);
  clearIce(world, [ID.home1, ID.away1]);
  place(world, ID.away1, 0, 0, Math.PI);
  giveTo(world, ID.away1);
  const checker = place(world, ID.home1, -gap, 0, 0);
  checker.vel = { x: speed, y: 0 };
  return world;
};

/** Throws a check with the button having been held long enough for a body check (which falls back to a poke out of reach). */
const check = (world: World, t = sure, charged = true): SimEvent[] => {
  const events: SimEvent[] = [];
  resolveCheck(world, player(world, ID.home1), charged, t, events);
  return events;
};

/** Holds the check button for a time and lets go, as a player would. */
const holdAndRelease = (world: World, seconds: number, t = sure): SimEvent[] => {
  const events: SimEvent[] = [];
  const checker = player(world, ID.home1);
  for (let i = 0; i < Math.max(1, Math.round(seconds * 60)); i++) stepChecking(world, checker, press, t, events);
  stepChecking(world, checker, NO_INPUT, t, events);
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

describe('where a deke goes', () => {
  const d = sure.deke;
  /** The carrier at the middle of the rink facing right, with a defender straight ahead. */
  const facing = (gap: number): World => {
    const world = createWorld(sure, 'deke-way');
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.home1, 0, 0, 0);
    giveTo(world, ID.home1);
    place(world, ID.away1, gap, 0, Math.PI);
    return world;
  };
  const degrees = (a: number): number => (a * 180) / Math.PI;

  it('round a defender who is close: across him and a little forward, never straight at him', () => {
    const world = facing(d.threatRange - 1);
    const angle = dekeAngle(world, player(world, ID.home1), { moveX: 1, moveY: 0 }, sure);
    expect(Math.abs(degrees(angle))).toBeCloseTo(d.sideDegrees);
    expect(Math.cos(angle)).toBeGreaterThan(0);
  });

  it('to the side the stick is pushed', () => {
    const world = facing(2);
    const p = player(world, ID.home1);
    expect(degrees(dekeAngle(world, p, { moveX: 0.5, moveY: 0.9 }, sure))).toBeCloseTo(d.sideDegrees);
    expect(degrees(dekeAngle(world, p, { moveX: 0.5, moveY: -0.9 }, sure))).toBeCloseTo(-d.sideDegrees);
  });

  it('with the stick straight or centred, to the side with more room', () => {
    // Near the bottom boards: go up the screen, into open ice.
    const low = facing(2);
    place(low, ID.home1, 0, sure.rink.width / 2 - 1.5, 0);
    place(low, ID.away1, 2, sure.rink.width / 2 - 1.5, Math.PI);
    expect(Math.sin(dekeAngle(low, player(low, ID.home1), { moveX: 0, moveY: 0 }, sure))).toBeLessThan(0);
    // A second defender on one side: go the other way.
    const crowded = facing(2);
    place(crowded, ID.away2, 1.5, 2.2, Math.PI);
    expect(Math.sin(dekeAngle(crowded, player(crowded, ID.home1), { moveX: 1, moveY: 0 }, sure))).toBeLessThan(0);
  });

  it('with nobody close it goes where the stick points, as before', () => {
    const world = facing(d.threatRange + 4);
    const p = player(world, ID.home1);
    expect(dekeAngle(world, p, { moveX: 0, moveY: 1 }, sure)).toBeCloseTo(Math.PI / 2);
    expect(dekeAngle(world, p, { moveX: 0, moveY: 0 }, sure)).toBeCloseTo(p.facing);
    expect(dekeThreat(world, p, sure)).toBeNull();
  });

  it('leaves the defender wrong-footed: slowed, and (an AI one) unable to check for a moment', () => {
    const world = facing(2);
    const ai = player(world, ID.away1);
    ai.vel = { x: -4, y: 0 };
    world.human!.controlled = ID.home1;
    const events = step(world, { ...NO_INPUT, switchPlayer: true }, sure);
    expect(events.some((e) => e.type === 'deke')).toBe(true);
    expect(ai.checkCooldown).toBeGreaterThan(d.beatSeconds - 0.1);
    expect(Math.hypot(ai.vel.x, ai.vel.y)).toBeLessThan(4);
    // The carrier has moved off the line between them.
    expect(Math.abs(player(world, ID.home1).vel.y)).toBeGreaterThan(d.impulse * 0.5);
  });

  it('the human\'s own skater is slowed by an opponent\'s deke but keeps his check', () => {
    const world = facing(2);
    world.human!.controlled = ID.away1;
    world.human!.team = 1;
    const me = player(world, ID.away1);
    me.vel = { x: -4, y: 0 };
    wrongFoot(world, player(world, ID.home1), sure);
    expect(me.checkCooldown).toBe(0);
    expect(Math.hypot(me.vel.x, me.vel.y)).toBeCloseTo(4 * d.beatSlow);
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

  it('cannot be used again until the cooldown is over, nor without the puck; being out of breath does not stop it', () => {
    const world = carrying();
    const count = (events: SimEvent[]): number => events.filter((e) => e.type === 'deke').length;
    expect(count(step(world, deke, sure))).toBe(1);
    step(world, NO_INPUT, sure);
    expect(count(step(world, deke, sure))).toBe(0);
    for (let i = 0; i < 60 * (sure.deke.cooldownSeconds + 0.1); i++) step(world, NO_INPUT, sure);
    step(world, NO_INPUT, sure);
    // A tired skater can still deke: it takes what stamina he has left. (He is handed the puck again in case it got away while waiting.)
    giveTo(world, ID.home1);
    world.human!.controlled = ID.home1;
    player(world, ID.home1).dekeCooldown = 0;
    player(world, ID.home1).stagger = 0;
    player(world, ID.home1).stamina = sure.deke.staminaCost / 2;
    expect(count(step(world, deke, sure))).toBe(1);
    expect(player(world, ID.home1).stamina).toBeLessThan(sure.deke.staminaCost / 2);
    // Without the puck the button switches player and nobody dekes.
    const other = createWorld(sure, 'no-puck');
    clearIce(other, [ID.home1]);
    place(other, ID.home1, 0, 0);
    other.puck.pos = { x: 15, y: 8 };
    expect(count(step(other, deke, sure))).toBe(0);
  });
});

describe('tap or hold', () => {
  it('a tap in arm\'s reach is a poke: the puck comes loose and nobody is staggered', () => {
    const world = setUp(1.2, sure.check.minClosingSpeed + 1);
    const events = holdAndRelease(world, 0.05);
    expect(events[0]).toMatchObject({ kind: 'poke', success: true });
    expect(player(world, ID.away1).stagger).toBe(0);
    expect(world.puck.carrier).toBe(null);
  });

  it('held for a moment and let go in arm\'s reach, it is a body check that staggers', () => {
    expect(sure.check.bodyHoldSeconds).toBeGreaterThan(0.1);
    const world = setUp(1.2, sure.check.minClosingSpeed + 1);
    const events = holdAndRelease(world, sure.check.bodyHoldSeconds + 0.05);
    expect(events[0]).toMatchObject({ kind: 'body', success: true });
    expect(player(world, ID.away1).stagger).toBeGreaterThan(0);
  });

  it('held, but the carrier is beyond arm\'s reach: still a poke with the stick', () => {
    const world = setUp(6, 0);
    place(world, ID.home1, world.puck.pos.x, -(sure.check.bodyRange + 0.6), Math.PI / 2);
    const events = holdAndRelease(world, sure.check.bodyHoldSeconds + 0.05);
    expect(events[0]).toMatchObject({ kind: 'poke', success: true });
    expect(player(world, ID.away1).stagger).toBe(0);
  });

  it('counts the speed he came in at, not the speed left after the two have bumped', () => {
    const world = setUp(1.2, sure.check.bigHitClosingSpeed + 2);
    const checker = player(world, ID.home1);
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round((sure.check.bodyHoldSeconds + 0.05) * 60); i++) stepChecking(world, checker, press, sure, events);
    // They have collided and he has stopped; then the button comes up.
    checker.vel = { x: 0, y: 0 };
    stepChecking(world, checker, NO_INPUT, sure, events);
    expect(events[0]).toMatchObject({ kind: 'body', success: true, big: true });
    expect(checker.checkClosing).toBe(0);
  });

  it('the hold starts again from nothing after each check', () => {
    const world = setUp(1.2, sure.check.minClosingSpeed + 1);
    const checker = player(world, ID.home1);
    holdAndRelease(world, sure.check.bodyHoldSeconds + 0.05);
    expect(checker.checkCharge).toBe(0);
    expect(checkKind(checker, player(world, ID.away1), world, sure, false)).not.toBe('body');
  });
});

describe('check assist for the human', () => {
  const a = sure.checkAssist;
  /** The same check thrown by the human's skater and by an AI skater in the same spot. */
  const both = (setup: (world: World) => void, charged: boolean, t = sure): { human: SimEvent[]; ai: SimEvent[]; humanWorld: World; aiWorld: World } => {
    const run = (human: boolean): { events: SimEvent[]; world: World } => {
      const world = createWorld(t, 'assist', { human });
      clearIce(world, [ID.home1, ID.away1]);
      place(world, ID.away1, 0, 0, 0);
      giveTo(world, ID.away1);
      setup(world);
      if (world.human) world.human.controlled = ID.home1;
      const events: SimEvent[] = [];
      resolveCheck(world, player(world, ID.home1), charged, t, events);
      return { events, world };
    };
    const h = run(true);
    const ai = run(false);
    return { human: h.events, ai: ai.events, humanWorld: h.world, aiWorld: ai.world };
  };

  it('his poke reaches a puck out to the side that an AI skater facing the same way cannot', () => {
    expect(a.pokeConeDegrees).toBeGreaterThan(sure.check.pokeConeDegrees);
    // The puck is square to his side: outside the ordinary arc, inside the assisted one.
    const result = both((world) => place(world, ID.home1, world.puck.pos.x, -1.4, 0), false);
    expect(result.human[0]).toMatchObject({ kind: 'poke' });
    expect(result.ai).toEqual([]);
  });

  it('a check that reaches nobody costs him only a short wait', () => {
    expect(a.missCooldownSeconds).toBeLessThan(sure.check.cooldownSeconds);
    const result = both((world) => place(world, ID.home1, -8, 0, 0), false);
    expect(result.human.filter((e) => e.type !== 'whiff')).toEqual([]);
    expect(player(result.humanWorld, ID.home1).checkCooldown).toBeCloseTo(a.missCooldownSeconds);
    expect(player(result.aiWorld, ID.home1).checkCooldown).toBeCloseTo(sure.check.cooldownSeconds);
  });

  it('his body check needs a shorter hold, a little less speed, and reaches a little further', () => {
    expect(a.bodyHoldSeconds).toBeLessThan(sure.check.bodyHoldSeconds);
    expect(a.bodyRange).toBeGreaterThan(sure.check.bodyRange);
    expect(a.minClosingSpeed).toBeLessThan(sure.check.minClosingSpeed);
    const gap = (a.bodyRange + sure.check.bodyRange) / 2;
    const speed = (a.minClosingSpeed + sure.check.minClosingSpeed) / 2;
    const result = both((world) => {
      place(world, ID.home1, -gap, 0, 0).vel = { x: speed, y: 0 };
    }, true);
    expect(result.human[0]).toMatchObject({ kind: 'body' });
    expect(result.ai[0]?.type === 'check' ? result.ai[0].kind : 'none').not.toBe('body');
  });

  it('a hold too short for the AI is long enough for him', () => {
    const world = setUp(1.2, sure.check.minClosingSpeed + 1);
    world.human!.controlled = ID.home1;
    const events = holdAndRelease(world, (a.bodyHoldSeconds + sure.check.bodyHoldSeconds) / 2);
    expect(events[0]).toMatchObject({ kind: 'body' });
  });

  it('his checks work more often, and switching the assist off takes all of it away', () => {
    expect(a.pokeChanceBonus).toBeGreaterThan(0);
    expect(a.bodyChanceBonus).toBeGreaterThan(0);
    const wins = (t: typeof sure, human: boolean): number => {
      let count = 0;
      for (let i = 0; i < 300; i++) {
        const world = createWorld(t, `odds-${i}`, { human });
        clearIce(world, [ID.home1, ID.away1]);
        place(world, ID.away1, 0, 0, 0);
        giveTo(world, ID.away1);
        place(world, ID.home1, world.puck.pos.x, -1.4, Math.PI / 2);
        if (world.human) world.human.controlled = ID.home1;
        const events: SimEvent[] = [];
        resolveCheck(world, player(world, ID.home1), false, t, events);
        if (events[0]?.type === 'check' && events[0].success) count++;
      }
      return count;
    };
    const real = cloneTuning();
    expect(wins(real, true)).toBeGreaterThan(wins(real, false) + 20);
    const off = cloneTuning();
    off.checkAssist.strength = 0;
    expect(Math.abs(wins(off, true) - wins(off, false))).toBeLessThan(40);
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
    // From a distance, within sure reach: the puck comes loose and the carrier is not staggered.
    const far = at(sure.checkAssist.pokeSureReach - 0.2);
    expect(checkKind(player(far, ID.home1), player(far, ID.away1), far, sure)).toBe('poke');
    expect(check(far)[0]).toMatchObject({ kind: 'poke', success: true });
    expect(far.puck.carrier).toBe(null);
    expect(player(far, ID.away1).stagger).toBe(0);
    // At full stretch the stick gets there but does not take it: your own poke is settled by reach, not luck.
    const stretched = at(sure.check.pokeRange - 0.2);
    expect(check(stretched)[0]).toMatchObject({ kind: 'poke', success: false });
    expect(stretched.puck.carrier).toBe(ID.away1);
    // Beyond the stick: nothing.
    const beyond = at(sure.check.pokeRange + 0.5);
    expect(checkKind(player(beyond, ID.home1), player(beyond, ID.away1), beyond, sure)).toBe(null);
    expect(check(beyond).filter((e) => e.type !== 'whiff')).toEqual([]);
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
    expect(check(world).filter((e) => e.type !== 'whiff')).toEqual([]);
    expect(world.puck.carrier).toBe(ID.away1);
  });
});

describe('check limits', () => {
  it('out of range it does nothing, but still costs a wait: the short one for the human', () => {
    const world = setUp(6, 8);
    expect(check(world).filter((e) => e.type !== 'whiff')).toEqual([]);
    expect(world.puck.carrier).toBe(ID.away1);
    expect(player(world, ID.home1).checkCooldown).toBeCloseTo(sure.checkAssist.missCooldownSeconds);
  });

  it('is thrown when the button comes up, and cannot be thrown again during the cooldown', () => {
    const world = setUp(6, 8);
    const checker = player(world, ID.home1);
    // Out of range: nothing happens, but the cooldown starts.
    expect(holdAndRelease(world, 0.05).filter((e) => e.type !== 'whiff')).toEqual([]);
    place(world, ID.home1, -1.2, 0).vel = { x: 8, y: 0 };
    // Holding the button throws nothing by itself.
    const events: SimEvent[] = [];
    stepChecking(world, checker, press, sure, events);
    expect(events).toEqual([]);
    // Letting go during the cooldown throws nothing either.
    stepChecking(world, checker, NO_INPUT, sure, events);
    expect(events).toEqual([]);
    checker.checkCooldown = 0;
    expect(holdAndRelease(world, sure.check.bodyHoldSeconds + 0.05)).toHaveLength(1);
  });

  it('cannot check a teammate, or while carrying the puck', () => {
    const world = setUp(1.2, 8);
    giveTo(world, ID.home2);
    place(world, ID.home2, 0, 0);
    expect(check(world).filter((e) => e.type !== 'whiff')).toEqual([]);
    giveTo(world, ID.home1);
    expect(check(world).filter((e) => e.type !== 'whiff')).toEqual([]);
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

describe('the AI team-mates of a person', () => {
  it('get better odds on a check than any other AI skater, and none of the rest of the help', () => {
    const base = cloneTuning();
    const withPerson = createWorld(base, 'mates');
    const allAi = createWorld(base, 'mates', { human: false });
    const me = withPerson.human!.controlled;
    const mate = withPerson.players.find((p) => p.team === 0 && p.role === 'skater' && p.onIce && p.id !== me)!;
    const theirs = withPerson.players.find((p) => p.team === 1 && p.role === 'skater' && p.onIce)!;

    const mine = checkRules(withPerson, withPerson.players[me]!, base);
    const his = checkRules(withPerson, mate, base);
    const other = checkRules(withPerson, theirs, base);
    const plain = checkRules(allAi, allAi.players[mate.id]!, base);

    expect(his.pokeBonus).toBe(base.checkAssist.matePokeBonus);
    expect(his.bodyBonus).toBe(base.checkAssist.mateBodyBonus);
    expect(his.pokeBonus).toBeGreaterThan(0);
    expect(his.pokeBonus).toBeLessThan(mine.pokeBonus);
    // No sure poke, no wider cone, no shorter hold: those are the person's alone.
    expect(his.pokeSureReach).toBe(0);
    expect(his.pokeConeDegrees).toBe(base.check.pokeConeDegrees);
    expect(his.bodyHoldSeconds).toBe(base.check.bodyHoldSeconds);
    // The other team, and a team with nobody playing on it, get nothing.
    expect(other.pokeBonus).toBe(0);
    expect(plain.pokeBonus).toBe(0);
    // Switched off with the rest of check assist.
    const off = cloneTuning();
    off.checkAssist.strength = 0;
    expect(checkRules(withPerson, mate, off).pokeBonus).toBe(0);
  });
});

