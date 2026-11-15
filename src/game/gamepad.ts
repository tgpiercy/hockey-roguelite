import controls from '../data/controls.json';

export interface ButtonReading {
  pressed: boolean;
  value: number;
}

export interface GamepadSnapshot {
  id: string;
  /** "standard" when the browser recognises the usual Xbox layout. */
  mapping: string;
  buttons: ButtonReading[];
  axes: number[];
}

/** A connected controller and the slot the browser has it in. */
export interface SeenPad {
  index: number;
  pad: GamepadSnapshot;
}

/** True if someone is using this controller right now: a button down, or a stick pushed well over. */
export function inUse(pad: GamepadSnapshot): boolean {
  if (pad.buttons.some((b) => b.pressed || b.value >= controls.padSetup.buttonHeld)) return true;
  const sticks = [controls.axes.moveX, controls.axes.moveY];
  return sticks.some((axis) => Math.abs(pad.axes[axis] ?? 0) >= controls.padSetup.axisHeld);
}

/**
 * Which controller the game listens to. Phones often list things that are not controllers (a fingerprint
 * reader, a remote) ahead of the real one, so the first in the list is not good enough: the game stays with
 * the one it had while that is connected, and moves to another only when that other is being used and the
 * current one is not. With nothing to go on, it prefers one with the standard layout.
 */
export function pickPad(pads: SeenPad[], current: number | null): SeenPad | null {
  if (pads.length === 0) return null;
  const mine = pads.find((p) => p.index === current);
  if (mine && inUse(mine.pad)) return mine;
  const busy = pads.find((p) => inUse(p.pad));
  if (busy) return busy;
  return mine ?? pads.find((p) => p.pad.mapping === 'standard') ?? pads[0]!;
}

let current: number | null = null;

/** Every connected controller, as the browser lists them. */
export function seenPads(): SeenPad[] {
  if (typeof navigator.getGamepads !== 'function') return [];
  const seen: SeenPad[] = [];
  let list: ReturnType<typeof navigator.getGamepads>;
  try {
    list = navigator.getGamepads();
  } catch {
    // Some browsers throw when the page is not allowed to read controllers.
    return [];
  }
  for (const pad of list) {
    if (!pad || !pad.connected) continue;
    seen.push({
      index: pad.index,
      pad: {
        id: pad.id,
        mapping: pad.mapping,
        buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
        axes: Array.from(pad.axes),
      },
    });
  }
  return seen;
}

/** Reads the controller in use, or null when there is none yet. */
export function readGamepad(): GamepadSnapshot | null {
  const picked = pickPad(seenPads(), current);
  current = picked ? picked.index : null;
  return picked ? picked.pad : null;
}
