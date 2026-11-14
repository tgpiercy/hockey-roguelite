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

/** Reads the first connected controller, or null when there is none yet. */
export function readGamepad(): GamepadSnapshot | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue;
    return {
      id: pad.id,
      mapping: pad.mapping,
      buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
      axes: Array.from(pad.axes),
    };
  }
  return null;
}
