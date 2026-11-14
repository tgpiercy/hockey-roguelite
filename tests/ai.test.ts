import { describe, expect, it } from 'vitest';
import { aiInput, aiLevel, chooseState, laneClear } from '../src/sim/ai';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);

const setUp = (seed = 'ai'): World => createWorld(t, seed, { human: false, levels: [0.5, 0.5] });
const state = (world: World, id: number) => chooseState(world, player(world, id), t);

describe('AI state machine: choosing a state', () => {
  it('attack: he has the puck', () => {
    const world = setUp();
    giveTo(world, ID.home1);
    expect(state(world, ID.home1)).toBe('attack');
  });

  it('support: a teammate has the puck', () => {
    const world = setUp();
    giveTo(world, ID.home1);
    expect(state(world, ID.home2)).toBe('support');
  });

  it('support: his own goalie is holding the puck', () => {
    const world = setUp();
    giveTo(world, ID.homeGoalie);
    expect(state(world, ID.home1)).toBe('support');
    expect(state(world, ID.home2)).toBe('support');
  });

  it('chase: the puck is loose and he is his team\'s nearest skater', () => {
    const world = setUp();
    place(world, ID.home1, 2, 0);
    place(world, ID.home2, -8, 5);
    world.puck.pos = { x: 4, y: 0 };
    expect(state(world, ID.home1)).toBe('chase');
  });

  it('the skater who is not nearest supports up ice, and defends in his own half', () => {
    const world = setUp();
    place(world, ID.home1, 2, 0);
    place(world, ID.home2, -8, 5);
    world.puck.pos = { x: 4, y: 0 };
    expect(state(world, ID.home2)).toBe('support');
    world.puck.pos = { x: -4, y: 0 };
    place(world, ID.home1, -5, 0);
    expect(state(world, ID.home2)).toBe('defend');
  });

  it('chase: a pass is on its way to him, even if a teammate is nearer the puck', () => {
    const world = setUp();
    place(world, ID.home1, 0, 0);
    place(world, ID.home2, 10, 6);
    world.puck.pos = { x: 1, y: 0.5 };
    world.puck.passTarget = ID.home2;
    expect(state(world, ID.home2)).toBe('chase');
    expect(state(world, ID.home1)).not.toBe('chase');
  });

  it('defend: the other team has the puck and he is on the goal side of it', () => {
    const world = setUp();
    place(world, ID.away1, 0, 0);
    giveTo(world, ID.away1);
    place(world, ID.home1, -6, 0);
    expect(state(world, ID.home1)).toBe('defend');
  });

  it('backcheck: the other team has the puck and he is caught up ice', () => {
    const world = setUp();
    place(world, ID.away1, 0, 0, Math.PI);
    giveTo(world, ID.away1);
    place(world, ID.home1, 12, 0);
    expect(state(world, ID.home1)).toBe('backcheck');
  });

  it('defend, not chase: their goalie is holding the puck', () => {
    const world = setUp();
    giveTo(world, ID.awayGoalie);
    place(world, ID.home1, 15, 0);
    expect(state(world, ID.home1)).toBe('defend');
  });

  it('mirrors for the team attacking the other way', () => {
    const world = setUp();
    place(world, ID.home1, 0, 0);
    giveTo(world, ID.home1);
    place(world, ID.away1, -12, 0);
    place(world, ID.away2, 8, 0);
    expect(state(world, ID.away1)).toBe('backcheck');
    expect(state(world, ID.away2)).toBe('defend');
  });
});

describe('AI state machine: transitions', () => {
  it('moves from chase to attack on picking the puck up, then to defend when it is taken', () => {
    const world = setUp();
    clearIce(world, [ID.home1]);
    place(world, ID.home1, -3, 0);
    world.puck.pos = { x: 0, y: 0 };
    const p = player(world, ID.home1);

    aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('chase');

    giveTo(world, ID.home1);
    aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('attack');

    // The puck is stripped; he keeps his old plan until his reaction time is up, then defends.
    place(world, ID.away1, 3, 0);
    giveTo(world, ID.away1);
    p.ai.shootSteps = 0;
    p.ai.passSteps = 0;
    aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('attack');
    for (let i = 0; i < STEPS_PER_SECOND; i++) aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('defend');
  });

  it('a harder AI reacts sooner, aims better, sees more passes and checks more', () => {
    const easy = aiLevel(0);
    const hard = aiLevel(1);
    expect(hard.reactionSeconds).toBeLessThan(easy.reactionSeconds);
    expect(hard.aimErrorDegrees).toBeLessThan(easy.aimErrorDegrees);
    expect(hard.passAwareness).toBeGreaterThan(easy.passAwareness);
    expect(hard.checkEagerness).toBeGreaterThan(easy.checkEagerness);
    expect(aiLevel(5)).toEqual(hard);
    expect(aiLevel(-1)).toEqual(easy);
  });
});

describe('AI behaviour', () => {
  const play = (world: World, seconds: number): SimEvent[] => {
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) events.push(...step(world, NO_INPUT, t));
    return events;
  };

  it('attack: with a clear look from the slot, it shoots toward the net', () => {
    const world = setUp('shoot');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, gx - 7, 1, 0);
    giveTo(world, ID.home1);
    const events = play(world, 1.5);
    const shot = events.find((e) => e.type === 'shot');
    expect(shot).toMatchObject({ type: 'shot', player: ID.home1 });
  });

  it('attack: far from the net, it carries the puck up ice', () => {
    const world = setUp('carry');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, -10, 0, 0);
    giveTo(world, ID.home1);
    play(world, 1);
    expect(player(world, ID.home1).pos.x).toBeGreaterThan(-6);
    expect(world.puck.carrier).toBe(ID.home1);
  });

  it('chase: the nearest skater goes and gets a loose puck', () => {
    const world = setUp('fetch');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, -8, 3);
    world.puck.pos = { x: 0, y: -2 };
    const events = play(world, 2.5);
    expect(events.some((e) => e.type === 'pickup' && e.player === ID.home1)).toBe(true);
  });

  it('support: the teammate without the puck gets away from the carrier, into space', () => {
    const world = setUp('open');
    clearIce(world, [ID.home1, ID.home2]);
    place(world, ID.home1, 0, 2, 0);
    place(world, ID.home2, -1, 3);
    giveTo(world, ID.home1);
    player(world, ID.home1).stagger = 2;
    play(world, 1.5);
    const mate = player(world, ID.home2);
    const carrier = player(world, ID.home1);
    expect(Math.hypot(mate.pos.x - carrier.pos.x, mate.pos.y - carrier.pos.y)).toBeGreaterThan(4);
  });

  it('defend: the nearest defender closes on the carrier and checks him', () => {
    const world = createWorld(t, 'pressure', { human: false, levels: [1, 1] });
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.away1, 2, 0, Math.PI);
    giveTo(world, ID.away1);
    player(world, ID.away1).stagger = 3;
    place(world, ID.home1, -6, 0);
    const events = play(world, 3);
    expect(events.some((e) => e.type === 'check' && e.player === ID.home1)).toBe(true);
  });

  it('backcheck: a skater caught up ice comes back toward his own net', () => {
    const world = setUp('back');
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.away1, -5, 0, Math.PI);
    giveTo(world, ID.away1);
    player(world, ID.away1).stagger = 2;
    place(world, ID.home1, 15, 4);
    play(world, 1);
    expect(player(world, ID.home1).pos.x).toBeLessThan(10);
  });

  it('laneClear sees a defender standing in the way', () => {
    const world = setUp();
    clearIce(world, [ID.away1]);
    place(world, ID.away1, 5, 0.3);
    expect(laneClear(world, 0, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
    expect(laneClear(world, 0, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(true);
  });
});
