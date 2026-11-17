import { describe, expect, it } from 'vitest';
import controls from '../src/data/controls.json';
import mapLook from '../src/data/mapLook.json';
import { putOnIce } from '../src/sim/lines';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT } from '../src/sim/types';
import { createWorld, step } from '../src/sim/world';
import { lookPush, scrollPixels } from '../src/ui/menuScroll';
import { ID, player } from './helpers';

const t = cloneTuning();

describe('a player knocked down is not left lying', () => {
  it('put back on the ice at a faceoff or a change, he is on his feet', () => {
    const world = createWorld(t, 'down', { human: false });
    const p = player(world, ID.home1);
    p.stagger = t.check.knockdownSeconds;
    p.knockedDown = true;
    putOnIce(p, 0, 0, 0);
    expect(p.stagger).toBe(0);
    expect(p.knockedDown).toBe(false);
  });

  it('left to it, he gets up when the knock wears off', () => {
    const world = createWorld(t, 'down-2', { human: false });
    const p = player(world, ID.home1);
    p.stagger = 0.2;
    p.knockedDown = true;
    for (let i = 0; i < 30; i++) step(world, NO_INPUT, t);
    expect(p.knockedDown).toBe(false);
  });
});

describe('the right stick scrolls a menu', () => {
  const { deadzone, pixelsPerSecond } = controls.menuScroll;

  it('nothing inside the dead zone, full speed at full push, down for down and up for up', () => {
    expect(scrollPixels(0, 1)).toBe(0);
    expect(scrollPixels(deadzone, 1)).toBe(0);
    expect(scrollPixels(-deadzone * 0.9, 1)).toBe(0);
    expect(scrollPixels(1, 1)).toBeCloseTo(pixelsPerSecond);
    expect(scrollPixels(-1, 0.5)).toBeCloseTo(-pixelsPerSecond / 2);
    expect(scrollPixels(0.6, 1)).toBeGreaterThan(0);
    expect(scrollPixels(0.6, 1)).toBeLessThan(scrollPixels(1, 1));
    expect(scrollPixels(1, 0)).toBe(0);
  });

  it('is read on whichever axis the controller sends it, never one that moves the menu', () => {
    for (const axis of controls.menuScroll.axes) {
      expect(axis).not.toBe(controls.axes.moveX);
      expect(axis).not.toBe(controls.axes.moveY);
    }
    // The standard layout: left stick, right stick.
    expect(lookPush([0, 0, 0, 0.8], [], true)).toBeCloseTo(0.8);
    expect(lookPush([0, 0, 0, -0.5], [], true)).toBeCloseTo(-0.5);
    expect(lookPush([0, 0, 0.9, 0], [], true)).toBe(0);
    // A phone that lists a trigger between the sticks, resting at -1: the stick is on a later axis.
    const rest = [0, 0, -1, 0, 0, -1];
    expect(lookPush([0, 0, -1, 0, 0.7, -1], rest, false)).toBeCloseTo(0.7);
    expect(lookPush([0, 0, -1, 0, 0, -1], rest, false)).toBe(0);
    // The left stick alone scrolls nothing.
    expect(lookPush([1, -1, 0, 0], [0, 0, 0, 0], false)).toBe(0);
    expect(lookPush([0.3, 0.2], [0, 0], true)).toBe(0);
  });
});

describe('the rewards arrive in order on one screen', () => {
  it('money, then XP, then the pack', () => {
    const at = mapLook.rewards.arriveMs;
    expect(at.money).toBeGreaterThan(0);
    expect(at.xp).toBeGreaterThan(at.money);
    expect(at.pack).toBeGreaterThan(at.xp + at.bar);
  });
});
