import { describe, expect, it } from 'vitest';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';

const t = cloneTuning();

const worldWithPuck = (x: number, y: number, vx: number, vy: number): World => {
  const world = createWorld(t, 'goal-tests');
  world.puck.pos = { x, y };
  world.puck.vel = { x: vx, y: vy };
  return world;
};

const play = (world: World, steps: number): SimEvent[] => {
  const all: SimEvent[] = [];
  for (let i = 0; i < steps; i++) all.push(...step(world, NO_INPUT, t));
  return all;
};

const goals = (events: SimEvent[]): SimEvent[] => events.filter((e) => e.type === 'goal');

describe('goal detection', () => {
  it('counts a shot into the front of the right net', () => {
    const world = worldWithPuck(15, 0, 20, 0);
    const events = play(world, 60);
    expect(goals(events)).toEqual([{ type: 'goal', side: 1 }]);
    expect(world.goals).toBe(1);
  });

  it('counts a shot into the front of the left net', () => {
    const world = worldWithPuck(-15, 0.5, -20, 0);
    expect(goals(play(world, 60))).toEqual([{ type: 'goal', side: -1 }]);
  });

  it('does not count a shot off the post', () => {
    const world = worldWithPuck(10, t.net.mouthWidth / 2, 30, 0);
    const events = play(world, 90);
    expect(events.some((e) => e.type === 'post')).toBe(true);
    expect(goals(events)).toEqual([]);
  });

  it('does not count a shot from behind the net', () => {
    const world = worldWithPuck(goalLineX(t) + t.net.depth + 2, 0, -25, 0);
    expect(goals(play(world, 120))).toEqual([]);
    expect(world.goals).toBe(0);
  });

  it('does not count a shot that goes wide', () => {
    const world = worldWithPuck(15, t.net.mouthWidth / 2 + 1.5, 25, 0);
    expect(goals(play(world, 240))).toEqual([]);
  });

  it('counts one goal only, then resets puck and skater after the pause', () => {
    const world = worldWithPuck(15, 0, 20, 0);
    play(world, 60);
    expect(world.phase).toBe('goal');
    const later = play(world, Math.ceil(t.game.goalPauseSeconds * STEPS_PER_SECOND) + 2);
    expect(goals(later)).toEqual([]);
    expect(world.goals).toBe(1);
    expect(world.phase).toBe('play');
    expect(world.puck.pos).toEqual({ x: 0, y: 0 });
    expect(world.puck.carried).toBe(false);
    expect(world.skater.pos).toEqual({ x: t.game.skaterStartX, y: 0 });
  });
});
