import { describe, expect, it } from 'vitest';
import controls from '../src/data/controls.json';
import { mergeFrames, newTouchState, releaseTouch, stickFromTouch, TOUCH_BUTTONS, touchFrame } from '../src/game/touch';
import { NO_INPUT } from '../src/sim/types';

describe('the on-screen stick', () => {
  it('is centred when untouched, and ignores a thumb resting near the middle', () => {
    expect(stickFromTouch(0, 0, 50)).toEqual({ x: 0, y: 0 });
    const inside = 50 * controls.touch.deadzone * 0.9;
    expect(stickFromTouch(inside, 0, 50)).toEqual({ x: 0, y: 0 });
    expect(stickFromTouch(10, 10, 0)).toEqual({ x: 0, y: 0 });
  });

  it('points the way the finger is pushed, and is full tilt at the edge and beyond', () => {
    const right = stickFromTouch(50, 0, 50);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
    const far = stickFromTouch(0, -400, 50);
    expect(far.x).toBeCloseTo(0);
    expect(far.y).toBeCloseTo(-1);
    const diagonal = stickFromTouch(100, 100, 50);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });

  it('builds smoothly from the edge of the dead zone to full tilt', () => {
    const pushes = [0.2, 0.4, 0.6, 0.8, 1].map((share) => stickFromTouch(50 * share, 0, 50).x);
    for (let i = 1; i < pushes.length; i++) expect(pushes[i]).toBeGreaterThan(pushes[i - 1]!);
    expect(pushes[0]).toBeGreaterThan(0);
    expect(pushes[0]).toBeLessThan(0.1);
  });
});

describe('on-screen controls as game input', () => {
  it('nothing touched gives no input', () => {
    expect(touchFrame(newTouchState())).toEqual(NO_INPUT);
  });

  it('each button holds the game action it is named for, and only that one', () => {
    for (const button of TOUCH_BUTTONS) {
      const state = newTouchState();
      state.down[button] = true;
      const frame = touchFrame(state);
      expect(frame[button]).toBe(true);
      for (const other of TOUCH_BUTTONS) if (other !== button) expect(frame[other]).toBe(false);
    }
  });

  it('a button stays held for as long as the finger is down, which is what charges a shot', () => {
    const state = newTouchState();
    state.down.shoot = true;
    expect([1, 2, 3].map(() => touchFrame(state).shoot)).toEqual([true, true, true]);
    state.down.shoot = false;
    expect(touchFrame(state).shoot).toBe(false);
  });

  it('the stick carries through', () => {
    const state = newTouchState();
    state.moveX = 0.5;
    state.moveY = -0.25;
    expect(touchFrame(state)).toMatchObject({ moveX: 0.5, moveY: -0.25 });
  });

  it('letting go of everything clears the stick and every button', () => {
    const state = newTouchState();
    state.moveX = 1;
    state.down.pass = true;
    state.down.sprint = true;
    releaseTouch(state);
    expect(touchFrame(state)).toEqual(NO_INPUT);
  });
});

describe('touch alongside a controller or keyboard', () => {
  it('a button counts if either holds it', () => {
    const merged = mergeFrames({ ...NO_INPUT, shoot: true }, { ...NO_INPUT, pass: true });
    expect(merged.shoot).toBe(true);
    expect(merged.pass).toBe(true);
    expect(merged.check).toBe(false);
  });

  it('the stick that is tilted further wins', () => {
    const pad = { ...NO_INPUT, moveX: 0.2, moveY: 0 };
    const touch = { ...NO_INPUT, moveX: 0, moveY: -0.9 };
    expect(mergeFrames(pad, touch)).toMatchObject({ moveX: 0, moveY: -0.9 });
    expect(mergeFrames(touch, pad)).toMatchObject({ moveX: 0, moveY: -0.9 });
    expect(mergeFrames(pad, NO_INPUT)).toMatchObject({ moveX: 0.2, moveY: 0 });
  });
});
