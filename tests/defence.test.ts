import { describe, expect, it } from 'vitest';
import { resolveCheck } from '../src/sim/check';
import { shotInFlight } from '../src/sim/match';
import { stepMomentum } from '../src/sim/momentum';
import { cloneTuning, type Tuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createGame, createWorld, step } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const withChance = (chance: number): Tuning => {
  const t = cloneTuning();
  t.check.bodyBaseChance = chance;
  t.check.pokeBaseChance = chance;
  t.check.ratingSwing = 0;
  return t;
};
const sure = withChance(1);
const never = withChance(0);

/** An opponent with the puck at centre, and a home checker within a stick's reach, standing still. */
const duel = (t: Tuning): World => {
  const world = createWorld(t, 'defence', { human: false });
  clearIce(world, [ID.home1, ID.away1]);
  place(world, ID.away1, 0, 0, 0);
  giveTo(world, ID.away1);
  place(world, ID.home1, -1, 0, 0);
  return world;
};

const poke = (world: World, t: Tuning): SimEvent[] => {
  const events: SimEvent[] = [];
  resolveCheck(world, player(world, ID.home1), false, t, events);
  return events;
};

describe('momentum from defending', () => {
  it('a poke check that takes the puck fills the meter', () => {
    const world = duel(sure);
    const events = poke(world, sure);
    expect(events).toContainEqual(expect.objectContaining({ type: 'check', kind: 'poke', success: true }));
    stepMomentum(world, sure, events, 0);
    expect(world.teams[0].heat).toBeCloseTo(sure.momentum.steal);
    expect(world.teams[1].heat).toBe(0);
  });

  it('a poke that fails fills nothing', () => {
    const world = duel(never);
    const events = poke(world, never);
    expect(events).toContainEqual(expect.objectContaining({ type: 'check', success: false }));
    stepMomentum(world, never, events, 0);
    expect(world.teams[0].heat).toBe(0);
    expect(world.teams[1].heat).toBe(0);
  });

  it('a deke that slips a check fills the carrier\'s meter', () => {
    const world = duel(sure);
    player(world, ID.away1).deke = 0.3;
    const events = poke(world, sure);
    expect(events).toContainEqual(expect.objectContaining({ type: 'check', success: false, evaded: true }));
    expect(world.puck.carrier).toBe(ID.away1);
    stepMomentum(world, sure, events, 0);
    expect(world.teams[1].heat).toBeCloseTo(sure.momentum.evade);
    expect(world.teams[0].heat).toBe(0);
  });
});

describe('the steal at the wind-up', () => {
  const marksman = (world: World): void => {
    const carrier = player(world, ID.away1);
    carrier.fx = { ...carrier.fx, unstoppableCharged: 1 };
    carrier.charge = 0.4;
  };

  it('a check on a skater winding up an unstoppable shot always takes the puck, and pays more', () => {
    const world = duel(never);
    marksman(world);
    const events = poke(world, never);
    expect(events).toContainEqual(expect.objectContaining({ type: 'check', success: true, windUp: true }));
    expect(world.puck.carrier).toBeNull();
    expect(player(world, ID.away1).charge).toBe(0);
    stepMomentum(world, never, events, 0);
    expect(world.teams[0].heat).toBeCloseTo(never.momentum.steal + never.momentum.windUpSteal);
  });

  it('not while he is only carrying it, and not for an ordinary shooter winding up', () => {
    const carrying = duel(never);
    marksman(carrying);
    player(carrying, ID.away1).charge = 0;
    expect(poke(carrying, never)).toContainEqual(expect.objectContaining({ success: false }));
    const ordinary = duel(never);
    player(ordinary, ID.away1).charge = 0.4;
    expect(poke(ordinary, never)).toContainEqual(expect.objectContaining({ success: false }));
  });

  it('a deke still slips it', () => {
    const world = duel(never);
    marksman(world);
    player(world, ID.away1).deke = 0.3;
    expect(poke(world, never)).toContainEqual(expect.objectContaining({ success: false, evaded: true }));
  });
});

describe('the horn waits for a shot', () => {
  const t = cloneTuning();
  /** A game in play with a split second left, everyone out of the way. */
  const lastSecond = (): World => {
    const world = createGame(t, 'horn', { human: false, levels: [0.5, 0.5] });
    world.phase = 'play';
    world.faceoff = null;
    world.clock = 0.02;
    return world;
  };
  /** A shot by a home skater from his own half, flying at the away net: it takes a moment to get there. */
  const shoot = (world: World, speed: number, direction = 1): void => {
    world.puck.carrier = null;
    world.puck.pos = { x: -4, y: 9 };
    world.puck.vel = { x: direction * speed, y: 0 };
    world.puck.shotBy = ID.home1;
  };

  it('with no shot on its way, the period ends on time', () => {
    const world = lastSecond();
    world.puck.carrier = null;
    world.puck.shotBy = null;
    world.puck.vel = { x: 0, y: 0 };
    for (let i = 0; i < 3; i++) step(world, NO_INPUT, t);
    expect(world.phase).toBe('break');
  });

  it('with a shot on its way, play goes on at 0:00 until the shot is over', () => {
    const world = lastSecond();
    shoot(world, 30);
    expect(shotInFlight(world, t)).toBe(true);
    for (let i = 0; i < 4; i++) step(world, NO_INPUT, t);
    expect(world.phase).toBe('play');
    expect(world.clock).toBe(0);
    // It ends soon after: when the shot is stopped, goes in or dies, or at the limit.
    let steps = 4;
    while (world.phase === 'play' && steps < 600) {
      step(world, NO_INPUT, t);
      steps++;
    }
    expect(world.phase).not.toBe('play');
    expect(steps / 60).toBeLessThanOrEqual(t.period.shotGraceSeconds + 0.2);
  });

  it('a slow roller, or a shot going the wrong way, does not hold the horn', () => {
    const slow = lastSecond();
    shoot(slow, t.period.shotGraceSpeed - 1);
    expect(shotInFlight(slow, t)).toBe(false);
    const away = lastSecond();
    shoot(away, 30, -1);
    expect(shotInFlight(away, t)).toBe(false);
  });

  it('a shot that never stops is not waited for past the limit', () => {
    const world = lastSecond();
    let steps = 0;
    while (world.phase === 'play' && steps < 600) {
      // Keep a shot in the air for ever.
      shoot(world, 30);
      step(world, NO_INPUT, t);
      steps++;
    }
    expect(world.phase).toBe('break');
    expect(steps / 60).toBeLessThanOrEqual(t.period.shotGraceSeconds + 0.2);
    expect(world.hornWait).toBe(0);
  });
});
