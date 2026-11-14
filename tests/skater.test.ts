import { describe, expect, it } from 'vitest';
import { createSkater, stepSkater } from '../src/sim/skater';
import { cloneTuning } from '../src/sim/tuning';
import type { InputFrame, Skater } from '../src/sim/types';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/world';

const t = cloneTuning();

const input = (moveX: number, moveY: number, sprint = false): InputFrame => ({ moveX, moveY, sprint, shoot: false });
const speedOf = (s: Skater): number => Math.hypot(s.vel.x, s.vel.y);
const run = (s: Skater, frame: InputFrame, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) stepSkater(s, frame, t, STEP_SECONDS);
};

describe('skating', () => {
  it('accelerates to top speed and holds it', () => {
    const s = createSkater(-20, 0);
    run(s, input(1, 0), 0.1);
    expect(speedOf(s)).toBeGreaterThan(0);
    expect(speedOf(s)).toBeLessThan(t.skater.topSpeed);
    run(s, input(1, 0), 1.5);
    expect(speedOf(s)).toBeCloseTo(t.skater.topSpeed, 5);
  });

  it('a half-tilted stick gives half speed', () => {
    const s = createSkater(-20, 0);
    run(s, input(0.5, 0), 2);
    expect(speedOf(s)).toBeCloseTo(t.skater.topSpeed * 0.5, 5);
  });

  it('glides when the stick is released: slows, but keeps moving', () => {
    const s = createSkater(-20, 0);
    run(s, input(1, 0), 1);
    run(s, input(0, 0), 0.5);
    expect(speedOf(s)).toBeLessThan(t.skater.topSpeed);
    expect(speedOf(s)).toBeGreaterThan(t.skater.topSpeed * 0.3);
    expect(s.vel.x).toBeGreaterThan(0);
  });

  it('pulling the stick back stops faster than gliding', () => {
    const glide = createSkater(-20, 0);
    const brake = createSkater(-20, 0);
    run(glide, input(1, 0), 1);
    run(brake, input(1, 0), 1);
    run(glide, input(0, 0), 0.2);
    run(brake, input(-1, 0), 0.2);
    expect(speedOf(brake)).toBeLessThan(speedOf(glide));
  });

  it('turns wider at speed than from slow', () => {
    // Travelling along +x, then the stick goes straight down: how far does x overshoot before the turn completes?
    const overshoot = (startSpeed: number): number => {
      const s = createSkater(-20, -8);
      s.vel = { x: startSpeed, y: 0 };
      const startX = s.pos.x;
      let maxX = startX;
      for (let i = 0; i < 90; i++) {
        stepSkater(s, input(0, 1), t, STEP_SECONDS);
        maxX = Math.max(maxX, s.pos.x);
      }
      return maxX - startX;
    };
    expect(overshoot(t.skater.topSpeed)).toBeGreaterThan(overshoot(t.skater.topSpeed * 0.3) * 2);
  });

  it('stops at the boards', () => {
    const s = createSkater(0, 0);
    run(s, input(0, 1), 5);
    expect(s.pos.y).toBeCloseTo(t.rink.width / 2 - t.skater.radius, 5);
  });
});

describe('sprint and stamina', () => {
  it('sprinting is faster than skating', () => {
    const s = createSkater(-20, 0);
    run(s, input(1, 0, true), 1.5);
    expect(speedOf(s)).toBeCloseTo(t.skater.topSpeed * t.skater.sprintSpeedBoost, 5);
    expect(s.sprinting).toBe(true);
  });

  it('drains while sprinting, at the tuned rate', () => {
    const s = createSkater(-20, 0);
    run(s, input(1, 0, true), 1);
    expect(s.stamina).toBeCloseTo(1 - t.stamina.drainPerSecond, 5);
  });

  it('does not drain when sprint is held with the stick centred, or when just skating', () => {
    const standing = createSkater(0, 0);
    run(standing, input(0, 0, true), 1);
    expect(standing.stamina).toBe(1);
    const skating = createSkater(-20, 0);
    run(skating, input(1, 0), 1);
    expect(skating.stamina).toBe(1);
  });

  it('recovers after a short rest', () => {
    const s = createSkater(-20, 0);
    run(s, input(1, 0, true), 1);
    const low = s.stamina;
    run(s, input(0, 0), t.stamina.recoverDelay * 0.5);
    expect(s.stamina).toBeCloseTo(low, 5);
    run(s, input(0, 0), t.stamina.recoverDelay + 1);
    expect(s.stamina).toBeGreaterThan(low);
    run(s, input(0, 0), 1 / t.stamina.recoverPerSecond + 1);
    expect(s.stamina).toBe(1);
  });

  it('locks sprint out when empty until it recovers past the lockout level', () => {
    const s = createSkater(0, 0);
    // Skate in a circle so the boards are never reached.
    const total = Math.round((1 / t.stamina.drainPerSecond + 0.5) * STEPS_PER_SECOND);
    for (let i = 0; i < total; i++) {
      const a = i * 0.05;
      stepSkater(s, input(Math.cos(a), Math.sin(a), true), t, STEP_SECONDS);
    }
    expect(s.stamina).toBe(0);
    expect(s.sprintLocked).toBe(true);
    expect(s.sprinting).toBe(false);

    run(s, input(0, 0), t.stamina.recoverDelay + (t.stamina.lockoutUntil / t.stamina.recoverPerSecond) * 0.5);
    expect(s.sprintLocked).toBe(true);
    run(s, input(0, 0), (t.stamina.lockoutUntil / t.stamina.recoverPerSecond) * 0.5 + 0.2);
    expect(s.sprintLocked).toBe(false);
    stepSkater(s, input(1, 0, true), t, STEP_SECONDS);
    expect(s.sprinting).toBe(true);
  });
});
