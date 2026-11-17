import { describe, expect, it } from 'vitest';
import sets from '../src/data/sets.json';
import { resolveLoosePuck } from '../src/sim/contact';
import type { Modifier } from '../src/sim/modifiers';
import { stepPassing } from '../src/sim/pass';
import { stepLoosePuck } from '../src/sim/puck';
import { defaultGoalieRatings, defaultSkaterRatings } from '../src/sim/ratings';
import { goalLineX } from '../src/sim/rink';
import { shotSpeed } from '../src/sim/shot';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createGame, createWorld, step, STEP_SECONDS, STEPS_PER_SECOND, type TeamSetup } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
t.aimAssist.strength = 0;
t.passAssist.strength = 0;
const gx = goalLineX(t);

const team = (skaterModifiers: Modifier[][] = [], goalieModifiers: Modifier[] = []): TeamSetup => ({
  skaters: Array.from({ length: 6 }, () => ({ ...defaultSkaterRatings })),
  goalie: { ...defaultGoalieRatings },
  skaterModifiers,
  goalieModifiers,
});

describe('modifiers for one player', () => {
  it('reach that skater only, and stack on top of the team\'s', () => {
    const world = createWorld(t, 'own', {
      human: false,
      teams: [
        { ...team([[{ stat: 'topSpeedScale', op: 'mul', value: 1.1 }]]), modifiers: [{ stat: 'topSpeedScale', op: 'mul', value: 1.05 }] },
        team(),
      ],
    });
    expect(player(world, ID.home1).fx.topSpeedScale).toBeCloseTo(1.1 * 1.05);
    expect(player(world, ID.home2).fx.topSpeedScale).toBeCloseTo(1.05);
    expect(player(world, ID.away1).fx.topSpeedScale).toBeCloseTo(1);
  });

  it('goalie modifiers reach the goalie and not the skaters', () => {
    const world = createWorld(t, 'own-goalie', { human: false, teams: [team([], [{ stat: 'coverRadius', op: 'mul', value: 1.2 }]), team()] });
    const mine = player(world, ID.homeGoalie).goalie!.fx.coverRadius;
    expect(mine).toBeCloseTo(player(world, ID.awayGoalie).goalie!.fx.coverRadius * 1.2);
  });
});

describe('Burner: faster while carrying the puck', () => {
  const topSpeed = (modifiers: Modifier[], carrying: boolean): number => {
    const world = createWorld(t, 'carry', { teams: [team([modifiers]), team()] });
    for (const p of world.players) if (p.role === 'skater' && p.id !== ID.home1) p.stagger = 999;
    const p = place(world, ID.home1, -20, 6);
    world.puck.pos = { x: 20, y: -10 };
    if (carrying) giveTo(world, ID.home1);
    let best = 0;
    for (let i = 0; i < 2 * STEPS_PER_SECOND; i++) {
      step(world, { ...NO_INPUT, moveX: 1 }, t);
      best = Math.max(best, Math.hypot(p.vel.x, p.vel.y));
    }
    return best;
  };
  const burner: Modifier[] = [{ stat: 'carrySpeedScale', op: 'mul', value: 1.08 }];

  it('only with the puck, and only with the modifier', () => {
    const plain = topSpeed([], true);
    expect(topSpeed(burner, true)).toBeCloseTo(plain * 1.08, 1);
    expect(topSpeed(burner, false)).toBeCloseTo(plain, 1);
    expect(topSpeed([], false)).toBeCloseTo(plain, 1);
  });
});

describe('Sniper: a fully charged shot is harder', () => {
  const shoot = (modifiers: Modifier[], heldSeconds: number): number => {
    const world = createWorld(t, 'charged', { teams: [team([modifiers]), team()] });
    clearIce(world, [ID.home1]);
    for (const p of world.players) if (p.role === 'skater' && p.id !== ID.home1) p.stagger = 999;
    place(world, ID.home1, -5, 8, 0);
    giveTo(world, ID.home1);
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round(heldSeconds * STEPS_PER_SECOND); i++) step(world, { ...NO_INPUT, shoot: true }, t);
    events.push(...step(world, NO_INPUT, t));
    const shot = events.find((e) => e.type === 'shot');
    return shot && shot.type === 'shot' ? shot.speed : 0;
  };
  const sniper: Modifier[] = [{ stat: 'chargedShotScale', op: 'mul', value: 1.2 }];
  const power = 0.7;

  it('a full wind-up gets the bonus; a tap or a part charge does not', () => {
    const full = t.shot.chargeTime + 0.1;
    expect(shoot(sniper, full)).toBeCloseTo(shotSpeed(full, power, t) * 1.2, 4);
    expect(shoot([], full)).toBeCloseTo(shotSpeed(full, power, t), 4);
    expect(shoot(sniper, 0.05)).toBeCloseTo(shotSpeed(0.05, power, t), 4);
    const half = (t.shot.tapTime + t.shot.chargeTime) / 2;
    expect(shoot(sniper, half)).toBeCloseTo(shoot([], half), 6);
  });
});

describe('Playmaker: flat passes cannot be picked off', () => {
  /** Passer at centre, teammate up ice, an opponent standing right in the lane. */
  const setUp = (modifiers: Modifier[]): World => {
    const world = createWorld(t, 'thread', { teams: [team([modifiers]), team()] });
    clearIce(world, [ID.home1, ID.home2, ID.away1]);
    place(world, ID.home1, 0, 0);
    place(world, ID.home2, 10, 6);
    place(world, ID.away1, 5, 3);
    giveTo(world, ID.home1);
    for (const p of world.players) p.fx = { ...p.fx, passSpreadDegrees: 0 };
    return world;
  };
  const pass = (world: World, heldSteps: number): void => {
    const passer = player(world, ID.home1);
    for (let i = 0; i < heldSteps; i++) stepPassing(world, passer, { ...NO_INPUT, pass: true }, t, STEP_SECONDS, []);
    stepPassing(world, passer, { ...NO_INPUT, moveX: 1, moveY: 0.6 }, t, STEP_SECONDS, []);
  };
  const fly = (world: World): void => {
    for (let i = 0; i < 120 && world.puck.carrier === null; i++) {
      stepLoosePuck(world.puck, t, STEP_SECONDS);
      resolveLoosePuck(world, t, []);
    }
  };
  const playmaker: Modifier[] = [{ stat: 'passThrough', op: 'add', value: 1 }];

  it('without the bonus the opponent in the lane takes it; with it, the pass gets through', () => {
    const plain = setUp([]);
    pass(plain, 1);
    expect(plain.puck.threaded).toBe(false);
    fly(plain);
    expect(plain.puck.carrier).toBe(ID.away1);

    const threaded = setUp(playmaker);
    pass(threaded, 1);
    expect(threaded.puck.threaded).toBe(true);
    fly(threaded);
    expect(threaded.puck.carrier).toBe(ID.home2);
    expect(threaded.puck.threaded).toBe(false);
  });

  it('applies to the passer who has it, not to his teammates', () => {
    const world = setUp(playmaker);
    giveTo(world, ID.home2);
    place(world, ID.home2, 0, 0);
    place(world, ID.home1, 10, 6);
    const passer = player(world, ID.home2);
    stepPassing(world, passer, { ...NO_INPUT, pass: true }, t, STEP_SECONDS, []);
    stepPassing(world, passer, { ...NO_INPUT, moveX: 1, moveY: 0.6 }, t, STEP_SECONDS, []);
    expect(world.puck.threaded).toBe(false);
  });
});

describe('Brick Wall: the first shot that beats him each period is saved', () => {
  const wall: Modifier[] = [{ stat: 'periodAutoSaves', op: 'add', value: 1 }];

  /** A game in play with every skater parked and the away goalie pulled out of his net. */
  const setUp = (goalieModifiers: Modifier[]): World => {
    const world = createGame(t, 'wall', { human: false, levels: [0.5, 0.5], teams: [team(), team([], goalieModifiers)] });
    world.phase = 'play';
    world.faceoff = null;
    clearIce(world, []);
    for (const p of world.players) if (p.role === 'skater') p.stagger = 9999;
    return world;
  };
  /** Fires a shot (as if by the home centre) into the empty side of the away net. */
  const shootIn = (world: World, shotBy: number | null = ID.home1): SimEvent[] => {
    world.phase = 'play';
    world.faceoff = null;
    player(world, ID.awayGoalie).pos = { x: gx - 1, y: 10 };
    player(world, ID.awayGoalie).goalie!.hold = 0;
    world.puck.carrier = null;
    world.puck.shotBy = shotBy;
    world.puck.pos = { x: gx - 2, y: 0.3 };
    world.puck.vel = { x: 30, y: 0 };
    const events: SimEvent[] = [];
    for (let i = 0; i < 12; i++) events.push(...step(world, NO_INPUT, t));
    return events;
  };

  it('without the set, the shot is a goal', () => {
    const world = setUp([]);
    expect(shootIn(world).some((e) => e.type === 'goal')).toBe(true);
    expect(world.score).toEqual([1, 0]);
  });

  it('with the set, the first one is saved and frozen, and the second goes in', () => {
    const world = setUp(wall);
    const first = shootIn(world);
    expect(first.some((e) => e.type === 'goal')).toBe(false);
    expect(first).toContainEqual({ type: 'save', goalie: ID.awayGoalie, frozen: true });
    expect(world.score).toEqual([0, 0]);
    expect(player(world, ID.awayGoalie).stats.saves).toBe(1);
    expect(world.puck.carrier).toBe(ID.awayGoalie);

    const second = shootIn(world);
    expect(second.some((e) => e.type === 'goal')).toBe(true);
    expect(world.score).toEqual([1, 0]);
  });

  it('he gets it back at the start of the next period', () => {
    const world = setUp(wall);
    shootIn(world);
    world.period = 2;
    const again = shootIn(world);
    expect(again.some((e) => e.type === 'goal')).toBe(false);
    expect(world.score).toEqual([0, 0]);
  });

  it('it only stops shots: a puck that is not a shot still counts', () => {
    const world = setUp(wall);
    expect(shootIn(world, null).some((e) => e.type === 'goal')).toBe(true);
  });

  it('the gear set gives one for the whole game, not one a period: it does not come back', () => {
    const bonus = sets.find((x) => x.id === 'brick-wall')!.bonuses.find((b) => b.pieces === 3)!.modifiers as Modifier[];
    expect(bonus).toEqual([{ stat: 'gameAutoSaves', op: 'add', value: 1 }]);
    const world = setUp(bonus);
    expect(shootIn(world).some((e) => e.type === 'goal')).toBe(false);
    expect(shootIn(world).some((e) => e.type === 'goal')).toBe(true);
    world.period = 2;
    expect(shootIn(world).some((e) => e.type === 'goal')).toBe(true);
    expect(world.score).toEqual([2, 0]);
  });
});
