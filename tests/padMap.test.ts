import { describe, expect, it } from 'vitest';
import controls from '../src/data/controls.json';
import { assignSeats, inUse, pickPad, type GamepadSnapshot } from '../src/game/gamepad';
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

describe('which controller the game listens to', () => {
  /** Something a phone lists as a controller that is not one: no standard layout, nothing ever pressed. */
  const ghost = (): GamepadSnapshot => ({ ...pad(), id: 'fingerprint reader', mapping: '' });

  it('a button down or the stick pushed over counts as in use; a resting trigger axis does not', () => {
    expect(inUse(pad())).toBe(false);
    expect(inUse(pad([4]))).toBe(true);
    expect(inUse(pad([], [0.9, 0, 0, 0, -1, -1]))).toBe(true);
  });

  it('with nothing connected there is no controller', () => {
    expect(pickPad([], null)).toBeNull();
    expect(pickPad([], 2)).toBeNull();
  });

  it('prefers the standard layout over something listed ahead of it', () => {
    expect(pickPad([{ index: 0, pad: ghost() }, { index: 1, pad: pad() }], null)?.index).toBe(1);
  });

  it('moves to the controller that is being used, and then stays with it', () => {
    const idle = [{ index: 0, pad: ghost() }, { index: 1, pad: { ...pad(), mapping: '' } }];
    expect(pickPad(idle, null)?.index).toBe(0);
    const pressed = [{ index: 0, pad: ghost() }, { index: 1, pad: { ...pad([0]), mapping: '' } }];
    expect(pickPad(pressed, 0)?.index).toBe(1);
    expect(pickPad(idle, 1)?.index).toBe(1);
  });

  it('does not leave a controller in use for another that is also in use', () => {
    expect(pickPad([{ index: 0, pad: pad([1]) }, { index: 1, pad: pad([2]) }], 1)?.index).toBe(1);
  });

  it('falls back when the one it had is unplugged', () => {
    expect(pickPad([{ index: 0, pad: pad() }], 3)?.index).toBe(0);
  });
});

describe('two players, two controllers', () => {
  const seen = (index: number, pressed: number[] = []) => ({ index, pad: pad(pressed) });

  it('the first controller used is player one; a second joins when it is used and joining is open', () => {
    let seats = assignSeats([seen(0, [0]), seen(1)], { first: null, second: null }, true);
    expect(seats).toEqual({ first: 0, second: null });
    seats = assignSeats([seen(0), seen(1, [2])], seats, true);
    expect(seats).toEqual({ first: 0, second: 1 });
  });

  it('with joining closed a second controller does not join: it takes over as the one in use, as before', () => {
    const seats = assignSeats([seen(0), seen(1, [2])], { first: 0, second: null }, false);
    expect(seats).toEqual({ first: 1, second: null });
  });

  it('once both are seated neither can take the seat of the other, whoever is pressing', () => {
    const both = { first: 0, second: 1 };
    expect(assignSeats([seen(0), seen(1, [1, 2, 3])], both, true)).toEqual(both);
    expect(assignSeats([seen(0, [0]), seen(1)], both, false)).toEqual(both);
  });

  it('unplugging player two empties his seat; unplugging player one moves player two up', () => {
    expect(assignSeats([seen(0)], { first: 0, second: 1 }, true)).toEqual({ first: 0, second: null });
    expect(assignSeats([seen(1)], { first: 0, second: 1 }, true)).toEqual({ first: 1, second: null });
    expect(assignSeats([], { first: 0, second: 1 }, true)).toEqual({ first: null, second: null });
  });

  it('a device nobody touches never joins', () => {
    const seats = assignSeats([seen(0, [0]), seen(1)], { first: 0, second: null }, true);
    expect(seats.second).toBeNull();
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
