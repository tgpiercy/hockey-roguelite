import { describe, expect, it } from 'vitest';
import controls from '../src/data/controls.json';
import type { GamepadSnapshot } from '../src/game/gamepad';
import { bindingDown, defaultPadMap, describeBinding, detectPress, PAD_ACTIONS, parsePadMap, sameBinding, type Binding } from '../src/game/padMap';

/** A controller with nothing pressed: 17 buttons and 6 axes, the last two resting at -1 like triggers sent as axes. */
const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0, -1, -1]): GamepadSnapshot => ({
  id: 'test',
  mapping: 'standard',
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  axes,
});

describe('controller layout', () => {
  it('the standard layout is the usual Xbox numbering, with an entry for every action', () => {
    const map = defaultPadMap();
    expect(Object.keys(map).sort()).toEqual([...PAD_ACTIONS].sort());
    expect(map.pass).toEqual({ kind: 'button', index: controls.buttons.pass });
    expect(map.shoot).toEqual({ kind: 'button', index: controls.buttons.shoot });
    expect(map.pullGoalie).toEqual({ kind: 'button', index: controls.buttons.view });
    // No two actions share a button.
    const indices = PAD_ACTIONS.map((action) => describeBinding(map[action]));
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('a button counts as held when pressed or squeezed past the trigger point', () => {
    const shoot: Binding = { kind: 'button', index: 2 };
    expect(bindingDown(pad([2]), shoot)).toBe(true);
    expect(bindingDown(pad([3]), shoot)).toBe(false);
    expect(bindingDown(null, shoot)).toBe(false);
    const half = pad();
    half.buttons[2] = { pressed: false, value: controls.triggerThreshold + 0.05 };
    expect(bindingDown(half, shoot)).toBe(true);
  });

  it('an axis counts as held when pushed its way: a trigger sent as an axis, or a d-pad sent as a hat', () => {
    const trigger: Binding = { kind: 'axis', index: 5, sign: 1 };
    expect(bindingDown(pad([], [0, 0, 0, 0, -1, -1]), trigger)).toBe(false);
    expect(bindingDown(pad([], [0, 0, 0, 0, -1, 0.9]), trigger)).toBe(true);
    const up: Binding = { kind: 'axis', index: 4, sign: -1 };
    expect(bindingDown(pad([], [0, 0, 0, 0, -1, 0]), up)).toBe(true);
    expect(bindingDown(pad([], [0, 0, 0, 0, 1, 0]), up)).toBe(false);
  });
});

describe('finding out which button was pressed', () => {
  it('reports the button that went down since the resting reading', () => {
    expect(detectPress(pad(), pad([3]))).toEqual({ kind: 'button', index: 3 });
    expect(detectPress(pad(), pad())).toBeNull();
  });

  it('ignores a button that was already down when the step began', () => {
    expect(detectPress(pad([3]), pad([3]))).toBeNull();
    expect(detectPress(pad([3]), pad([3, 1]))).toEqual({ kind: 'button', index: 1 });
  });

  it('reports an axis that has moved far from rest, with the way it moved', () => {
    expect(detectPress(pad(), pad([], [0, 0, 0, 0, -1, 0.8]))).toEqual({ kind: 'axis', index: 5, sign: 1 });
    expect(detectPress(pad([], [0, 0, 0, 0, 0, 0]), pad([], [0, 0, 0, 0, -1, 0]))).toEqual({ kind: 'axis', index: 4, sign: -1 });
    // A little drift is not a press.
    expect(detectPress(pad(), pad([], [0, 0, 0.2, 0, -1, -0.8]))).toBeNull();
  });

  it('never takes the left stick for a button', () => {
    expect(detectPress(pad(), pad([], [1, -1, 0, 0, -1, -1]))).toBeNull();
  });

  it('tells bindings apart', () => {
    expect(sameBinding({ kind: 'button', index: 2 }, { kind: 'button', index: 2 })).toBe(true);
    expect(sameBinding({ kind: 'button', index: 2 }, { kind: 'button', index: 3 })).toBe(false);
    expect(sameBinding({ kind: 'axis', index: 5, sign: 1 }, { kind: 'axis', index: 5, sign: -1 })).toBe(false);
    expect(sameBinding({ kind: 'axis', index: 5, sign: 1 }, { kind: 'button', index: 5 })).toBe(false);
  });
});

describe('a stored layout', () => {
  it('comes back as it was saved', () => {
    const map = { ...defaultPadMap(), shoot: { kind: 'button', index: 3 } as Binding, switchPlayer: { kind: 'button', index: 2 } as Binding, sprint: { kind: 'axis', index: 5, sign: 1 } as Binding };
    expect(parsePadMap(JSON.stringify(map))).toEqual(map);
  });

  it('keeps the standard binding for anything missing or broken', () => {
    const parsed = parsePadMap(JSON.stringify({ shoot: { kind: 'button', index: 3 }, pass: { kind: 'button', index: -4 }, check: 'B', sprint: { kind: 'axis', index: 5, sign: 2 } }));
    expect(parsed?.shoot).toEqual({ kind: 'button', index: 3 });
    expect(parsed?.pass).toEqual(defaultPadMap().pass);
    expect(parsed?.check).toEqual(defaultPadMap().check);
    expect(parsed?.sprint).toEqual(defaultPadMap().sprint);
  });

  it('nothing stored, or nothing usable, means the standard layout is used', () => {
    expect(parsePadMap(null)).toBeNull();
    expect(parsePadMap('not json')).toBeNull();
    expect(parsePadMap('42')).toBeNull();
    expect(parsePadMap('{}')).toBeNull();
  });
});
