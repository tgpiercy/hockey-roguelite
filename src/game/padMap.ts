import controls from '../data/controls.json';
import type { GamepadSnapshot } from './gamepad';

/** Everything the game asks a controller button for. */
export type PadAction =
  | 'pass'
  | 'check'
  | 'shoot'
  | 'switchPlayer'
  | 'sprint'
  | 'lineChange'
  | 'powerupA'
  | 'powerupB'
  | 'menu'
  | 'pullGoalie'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight';

/** In the order the setup screen asks for them. */
export const PAD_ACTIONS: PadAction[] = ['pass', 'check', 'shoot', 'switchPlayer', 'sprint', 'lineChange', 'powerupA', 'powerupB', 'menu', 'pullGoalie', 'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'];

/** What does an action: a button, or an axis pushed one way (some controllers send triggers and the d-pad as axes). */
export type Binding = { kind: 'button'; index: number } | { kind: 'axis'; index: number; sign: 1 | -1 };

export type PadMap = Record<PadAction, Binding>;

const button = (index: number): Binding => ({ kind: 'button', index });

/** The usual Xbox layout, as the browser's "standard" mapping numbers it. */
export function defaultPadMap(): PadMap {
  const b = controls.buttons;
  return {
    pass: button(b.pass),
    check: button(b.check),
    shoot: button(b.shoot),
    switchPlayer: button(b.switchPlayer),
    sprint: button(b.sprint),
    lineChange: button(b.lineChange),
    powerupA: button(b.powerupA),
    powerupB: button(b.powerupB),
    menu: button(b.menu),
    pullGoalie: button(b.view),
    dpadUp: button(b.dpadUp),
    dpadDown: button(b.dpadDown),
    dpadLeft: button(b.dpadLeft),
    dpadRight: button(b.dpadRight),
  };
}

/** True while whatever is bound is held: a button pressed (or squeezed past the trigger point), or an axis pushed its way. */
export function bindingDown(pad: GamepadSnapshot | null, binding: Binding, threshold: number = controls.triggerThreshold): boolean {
  if (!pad) return false;
  if (binding.kind === 'button') {
    const b = pad.buttons[binding.index];
    return b !== undefined && (b.pressed || b.value >= threshold);
  }
  return (pad.axes[binding.index] ?? 0) * binding.sign >= controls.padSetup.axisHeld;
}

export function sameBinding(a: Binding, b: Binding): boolean {
  return a.kind === b.kind && a.index === b.index && (a.kind === 'button' || a.sign === (b as { sign: number }).sign);
}

/**
 * What was newly pressed since `baseline`: the first button that is down now and was not then, or the first
 * axis (other than the left stick) that has moved far from where it rested. Null if nothing has.
 */
export function detectPress(baseline: GamepadSnapshot, now: GamepadSnapshot): Binding | null {
  for (let i = 0; i < now.buttons.length; i++) {
    const before = baseline.buttons[i];
    const after = now.buttons[i];
    const was = before !== undefined && (before.pressed || before.value >= controls.padSetup.buttonHeld);
    if (after && !was && (after.pressed || after.value >= controls.padSetup.buttonHeld)) return button(i);
  }
  for (let i = 0; i < now.axes.length; i++) {
    if (i === controls.axes.moveX || i === controls.axes.moveY) continue;
    const moved = (now.axes[i] ?? 0) - (baseline.axes[i] ?? 0);
    if (Math.abs(moved) >= controls.padSetup.axisMoved) return { kind: 'axis', index: i, sign: moved > 0 ? 1 : -1 };
  }
  return null;
}

/** True if nothing that `detectPress` would notice is being held: used to wait for a release between steps. */
export function atRest(baseline: GamepadSnapshot, now: GamepadSnapshot): boolean {
  return detectPress(baseline, now) === null && now.buttons.every((b, i) => !(b.pressed || b.value >= controls.padSetup.buttonHeld) || baseline.buttons[i]?.pressed === true);
}

/** A binding as a few words: "button 3", "axis 5 +". */
export function describeBinding(binding: Binding): string {
  return binding.kind === 'button' ? `button ${binding.index}` : `axis ${binding.index} ${binding.sign > 0 ? '+' : '-'}`;
}

function validBinding(value: unknown): value is Binding {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.index !== 'number' || !Number.isInteger(v.index) || v.index < 0 || v.index > 63) return false;
  return v.kind === 'button' || (v.kind === 'axis' && (v.sign === 1 || v.sign === -1));
}

/** Reads a stored layout. Anything missing or broken falls back to the standard binding for that action; null if nothing usable is stored. */
export function parsePadMap(raw: string | null): PadMap | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const stored = value as Record<string, unknown>;
    const map = defaultPadMap();
    let any = false;
    for (const action of PAD_ACTIONS) {
      const binding = stored[action];
      if (validBinding(binding)) {
        map[action] = binding.kind === 'button' ? { kind: 'button', index: binding.index } : { kind: 'axis', index: binding.index, sign: binding.sign };
        any = true;
      }
    }
    return any ? map : null;
  } catch {
    return null;
  }
}

const KEY = 'hockey-padmap';
let cached: PadMap | undefined;
let custom = false;

/** The layout in use on this device: the player's own if he has set one up, otherwise the standard one. */
export function padMap(): PadMap {
  if (cached) return cached;
  let stored: PadMap | null = null;
  try {
    stored = parsePadMap(localStorage.getItem(KEY));
  } catch {
    stored = null;
  }
  custom = stored !== null;
  cached = stored ?? defaultPadMap();
  return cached;
}

/** True if the player has set up his own layout on this device. */
export function hasCustomPadMap(): boolean {
  padMap();
  return custom;
}

/** Stores the player's layout on this device and starts using it at once; null goes back to the standard one. */
export function savePadMap(map: PadMap | null): void {
  cached = map ?? defaultPadMap();
  custom = map !== null;
  try {
    if (map) localStorage.setItem(KEY, JSON.stringify(map));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage is unavailable: the layout lasts until the page is closed.
  }
}
