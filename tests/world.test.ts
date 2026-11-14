import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { cloneTuning } from '../src/sim/tuning';
import type { InputFrame, World } from '../src/sim/types';
import { createWorld, step } from '../src/sim/world';

const t = cloneTuning();
const STEPS = 60 * 60;

const snapshot = (w: World): string =>
  JSON.stringify({ tick: w.tick, skater: w.skater, puck: w.puck, goals: w.goals, phase: w.phase, phaseTime: w.phaseTime });

/**
 * Plays a busy, repeatable game: a simple bot chases the loose puck, then skates a random way
 * with it, sometimes sprinting, holding shoot for a while and letting go.
 */
const playThrough = (seed: string): { history: string[]; shots: number; world: World } => {
  const world = createWorld(t, seed);
  const bot = createRng('bot');
  const history: string[] = [];
  let shots = 0;
  let carryAngle = 0;
  let sprint = false;
  for (let i = 0; i < STEPS; i++) {
    if (i % 30 === 0) {
      carryAngle = bot.range(0, Math.PI * 2);
      sprint = bot.chance(0.4);
    }
    let frame: InputFrame;
    if (world.puck.carried) {
      frame = { moveX: Math.cos(carryAngle), moveY: Math.sin(carryAngle), sprint, shoot: i % 45 < 30 };
    } else {
      const dx = world.puck.pos.x - world.skater.pos.x;
      const dy = world.puck.pos.y - world.skater.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      frame = { moveX: dx / d, moveY: dy / d, sprint, shoot: false };
    }
    shots += step(world, frame, t).filter((e) => e.type === 'shot').length;
    history.push(snapshot(world));
  }
  return { history, shots, world };
};

describe('world', () => {
  it('same seed and same inputs give exactly the same game, step for step', () => {
    const a = playThrough('replay');
    const b = playThrough('replay');
    expect(a.history).toEqual(b.history);
    expect(a.shots).toBeGreaterThan(5);
  });

  it('a different seed changes where shots go', () => {
    const a = playThrough('replay');
    const b = playThrough('another');
    expect(a.history[STEPS - 1]).not.toEqual(b.history[STEPS - 1]);
  });

  it('keeps every number finite over a long busy game', () => {
    const { world } = playThrough('finite');
    const values = [world.skater.pos, world.skater.vel, world.puck.pos, world.puck.vel].flatMap((v) => [v.x, v.y]);
    for (const value of values) expect(Number.isFinite(value)).toBe(true);
  });
});
