import { describe, expect, it } from 'vitest';
import { braced } from '../src/sim/check';
import { stepGoalie } from '../src/sim/goalie';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/world';
import { clearIce, flyPuck, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);
const has = (events: SimEvent[], type: SimEvent['type']): boolean => events.some((e) => e.type === type);
const steps = (seconds: number): number => Math.ceil(seconds * STEPS_PER_SECOND);

describe('shot fake', () => {
  const shoot: InputFrame = { ...NO_INPUT, shoot: true };
  const both: InputFrame = { ...NO_INPUT, shoot: true, pass: true };

  /** The human's skater in the slot with the puck, facing the net, nobody near. */
  const inSlot = (): World => {
    const world = createWorld(t, 'fake');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, gx - 8, 0, 0);
    giveTo(world, ID.home1);
    world.human!.controlled = ID.home1;
    return world;
  };
  /** Holds shoot for a while, then presses pass as well. Returns everything that happened. */
  const windUpThenPass = (world: World, seconds: number): SimEvent[] => {
    const events: SimEvent[] = [];
    for (let i = 0; i < steps(seconds); i++) events.push(...step(world, shoot, t));
    events.push(...step(world, both, t));
    return events;
  };

  it('pass during a wind-up cancels the shot and passes nothing, however long pass stays down', () => {
    const world = inSlot();
    const events = windUpThenPass(world, t.fake.minCharge + 0.1);
    for (let i = 0; i < 10; i++) events.push(...step(world, both, t));
    events.push(...step(world, shoot, t));
    expect(has(events, 'fake')).toBe(true);
    expect(has(events, 'pass')).toBe(false);
    expect(has(events, 'shot')).toBe(false);
    expect(world.puck.carrier).toBe(ID.home1);
    // The wind-up started again from nothing.
    expect(player(world, ID.home1).charge).toBeLessThan(t.fake.minCharge + 0.1 + 12 * STEP_SECONDS);
    expect(player(world, ID.home1).fakeCooldown).toBeGreaterThan(0);
  });

  it('then a real shot can follow', () => {
    const world = inSlot();
    windUpThenPass(world, t.fake.minCharge + 0.1);
    step(world, shoot, t);
    expect(has(step(world, NO_INPUT, t), 'shot')).toBe(true);
  });

  it('before the wind-up has properly begun, pass is just a pass', () => {
    const world = inSlot();
    place(world, ID.home2, gx - 12, 4, 0);
    const events = [...step(world, shoot, t), ...step(world, both, t), ...step(world, shoot, t)];
    expect(has(events, 'fake')).toBe(false);
    expect(has(events, 'pass')).toBe(true);
  });

  it('a second fake straight away does nothing', () => {
    const world = inSlot();
    windUpThenPass(world, t.fake.minCharge + 0.1);
    step(world, shoot, t);
    const again = windUpThenPass(world, t.fake.minCharge + 0.05);
    expect(t.fake.cooldownSeconds).toBeGreaterThan(t.fake.minCharge + 0.2);
    expect(has(again, 'fake')).toBe(false);
  });

  it('the goalie bites: stuck where he is, for longer the slower his reactions', () => {
    const bite = (reaction: number): number => {
      const world = inSlot();
      const g = player(world, ID.awayGoalie);
      g.goalie!.fx = { ...g.goalie!.fx, reactionSeconds: reaction };
      windUpThenPass(world, t.fake.minCharge + 0.1);
      return g.goalie!.bitten;
    };
    expect(bite(0.2)).toBeGreaterThan(bite(0.1));
    expect(bite(0.1)).toBeGreaterThan(0);

    const world = inSlot();
    const g = player(world, ID.awayGoalie);
    for (let i = 0; i < 30; i++) step(world, NO_INPUT, t);
    g.goalie!.bitten = 0.2;
    // The puck is suddenly out wide: a goalie who has bitten does not follow it.
    place(world, ID.home1, gx - 4, 6, 0);
    giveTo(world, ID.home1);
    for (let i = 0; i < 40; i++) g.goalie!.seen.push({ pos: { ...world.puck.pos }, vel: { x: 0, y: 0 }, loose: false });
    const before = { ...g.pos };
    stepGoalie(g, world, t, STEP_SECONDS);
    expect(g.pos).toEqual(before);
    g.goalie!.bitten = 0;
    stepGoalie(g, world, t, STEP_SECONDS);
    expect(g.pos.y).toBeGreaterThan(before.y);
  });

  it('no bite from far out or facing away', () => {
    const far = inSlot();
    place(far, ID.home1, gx - t.fake.range - 4, 0, 0);
    giveTo(far, ID.home1);
    expect(has(windUpThenPass(far, t.fake.minCharge + 0.1), 'fake')).toBe(true);
    expect(player(far, ID.awayGoalie).goalie!.bitten).toBe(0);

    const away = inSlot();
    place(away, ID.home1, gx - 8, 0, Math.PI);
    giveTo(away, ID.home1);
    windUpThenPass(away, t.fake.minCharge + 0.1);
    expect(player(away, ID.awayGoalie).goalie!.bitten).toBe(0);
  });

  it('a defender close by cannot check for a moment', () => {
    const world = inSlot();
    place(world, ID.away1, gx - 8 + t.fake.defenderRange - 1.5, 2, Math.PI);
    place(world, ID.away2, gx - 8, t.fake.defenderRange + 3, Math.PI);
    player(world, ID.away1).ai.thinkIn = 99;
    player(world, ID.away1).ai.wantCheck = false;
    windUpThenPass(world, t.fake.minCharge + 0.1);
    expect(player(world, ID.away1).checkCooldown).toBeGreaterThan(t.fake.defenderFreezeSeconds - 0.1);
    expect(player(world, ID.away2).checkCooldown).toBe(0);
  });
});

describe('shot block', () => {
  const hold: InputFrame = { ...NO_INPUT, check: true };

  /** The human's skater with the other team's carrier a given distance away. */
  const defending = (gap: number): World => {
    const world = createWorld(t, 'block');
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.home1, 0, 0, 0);
    place(world, ID.away1, gap, 0, Math.PI);
    giveTo(world, ID.away1);
    player(world, ID.away1).ai.thinkIn = 99;
    world.human!.controlled = ID.home1;
    return world;
  };

  it('holding check with the carrier far off braces him, and he can only shuffle', () => {
    const world = defending(12);
    const me = player(world, ID.home1);
    me.vel = { x: 0, y: 6 };
    expect(braced(world, me, t)).toBe(false);
    for (let i = 0; i < steps(t.block.braceAfterSeconds + 0.1); i++) step(world, { ...hold, moveY: 1 }, t);
    expect(braced(world, me, t)).toBe(true);
    expect(Math.hypot(me.vel.x, me.vel.y)).toBeLessThanOrEqual(t.block.maxSpeed + 1e-6);
  });

  it('with the carrier close the hold is for a hit, not a brace', () => {
    const world = defending(t.block.minCarrierDistance - 1);
    const me = player(world, ID.home1);
    me.checkCharge = t.block.braceAfterSeconds + 0.2;
    expect(braced(world, me, t)).toBe(false);
  });

  /** A shot from the other team passing just beyond his body. */
  const shotPast = (brace: boolean): { world: World; events: SimEvent[] } => {
    const world = defending(15);
    const me = player(world, ID.home1);
    world.puck.carrier = null;
    const offset = (t.skater.radius + t.puck.radius + t.block.reach) / 2;
    world.puck.pos = { x: 3, y: offset };
    world.puck.vel = { x: -28, y: 0 };
    world.puck.shotBy = ID.away1;
    world.puck.lastTeam = 1;
    me.checkCharge = brace ? t.block.braceAfterSeconds + 0.1 : 0;
    return { world, events: flyPuck(world, t, 20) };
  };

  it('a braced skater stops a shot dead that would have gone past his body', () => {
    const blocked = shotPast(true);
    expect(has(blocked.events, 'block')).toBe(true);
    expect(player(blocked.world, ID.home1).stats.blocks).toBe(1);
    expect(Math.hypot(blocked.world.puck.pos.x, blocked.world.puck.pos.y)).toBeLessThan(3);

    const missed = shotPast(false);
    expect(has(missed.events, 'block')).toBe(false);
    expect(missed.world.puck.pos.x).toBeLessThan(-3);
  });

  it('he does not block his own team\'s shot', () => {
    const world = defending(15);
    const me = player(world, ID.home1);
    world.puck.carrier = null;
    world.puck.pos = { x: -3, y: 0.9 };
    world.puck.vel = { x: 28, y: 0 };
    world.puck.shotBy = ID.home2;
    world.puck.lastTeam = 0;
    me.checkCharge = t.block.braceAfterSeconds + 0.1;
    expect(has(flyPuck(world, t, 20), 'block')).toBe(false);
  });

  it('a block adds to the team\'s momentum', () => {
    const world = defending(15);
    const me = player(world, ID.home1);
    me.checkCharge = 10;
    // A shot straight at him, with check held throughout.
    world.puck.carrier = null;
    world.puck.pos = { x: 4, y: 0.9 };
    world.puck.vel = { x: -28, y: 0 };
    world.puck.shotBy = ID.away1;
    world.puck.lastTeam = 1;
    const before = world.teams[0].heat;
    const events: SimEvent[] = [];
    for (let i = 0; i < 12; i++) events.push(...step(world, hold, t));
    expect(has(events, 'block')).toBe(true);
    expect(world.teams[0].heat).toBeGreaterThan(before);
  });
});
