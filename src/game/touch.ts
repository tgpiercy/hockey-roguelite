import controls from '../data/controls.json';
import type { InputFrame } from '../sim/types';

/** The on-screen buttons, named after the game action each one does. */
export type TouchButton = 'shoot' | 'pass' | 'check' | 'switchPlayer' | 'sprint' | 'lineChange' | 'powerupA' | 'powerupB' | 'pullGoalie';

export const TOUCH_BUTTONS: TouchButton[] = ['shoot', 'pass', 'check', 'switchPlayer', 'sprint', 'lineChange', 'powerupA', 'powerupB', 'pullGoalie'];

/** What the on-screen controls are doing right now. The overlay writes it; the input reader reads it. */
export interface TouchState {
  /** True once the screen has been touched, which is when the controls appear. */
  used: boolean;
  /** The virtual stick, each axis -1 to 1. */
  moveX: number;
  moveY: number;
  /** Which buttons are held down. */
  down: Record<TouchButton, boolean>;
}

export function newTouchState(): TouchState {
  return {
    used: false,
    moveX: 0,
    moveY: 0,
    down: { shoot: false, pass: false, check: false, switchPlayer: false, sprint: false, lineChange: false, powerupA: false, powerupB: false, pullGoalie: false },
  };
}

/** The one touch state for the page. */
export const touchState: TouchState = newTouchState();

/** Lets go of everything: used when a game ends or the page loses focus. */
export function releaseTouch(state: TouchState): void {
  state.moveX = 0;
  state.moveY = 0;
  for (const button of TOUCH_BUTTONS) state.down[button] = false;
}

/**
 * Where a finger is on the virtual stick, as a direction and how far it is pushed.
 * `dx` and `dy` are pixels from the stick's centre; `radius` is how far the knob can travel.
 * A small dead zone in the middle keeps a resting thumb from skating; past the edge it is full tilt.
 */
export function stickFromTouch(dx: number, dy: number, radius: number): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  if (radius <= 0 || distance === 0) return { x: 0, y: 0 };
  const push = Math.min(1, distance / radius);
  if (push <= controls.touch.deadzone) return { x: 0, y: 0 };
  // Rescale so the stick starts from zero at the edge of the dead zone.
  const scaled = (push - controls.touch.deadzone) / (1 - controls.touch.deadzone);
  return { x: (dx / distance) * scaled, y: (dy / distance) * scaled };
}

/** The on-screen controls as game input: the same frame a controller or keyboard gives. */
export function touchFrame(state: TouchState): InputFrame {
  return {
    moveX: state.moveX,
    moveY: state.moveY,
    sprint: state.down.sprint,
    shoot: state.down.shoot,
    pass: state.down.pass,
    check: state.down.check,
    switchPlayer: state.down.switchPlayer,
    lineChange: state.down.lineChange,
    powerupA: state.down.powerupA,
    powerupB: state.down.powerupB,
    pullGoalie: state.down.pullGoalie,
  };
}

/** Two inputs as one: whichever stick is tilted further, and a button counts if either holds it. */
export function mergeFrames(a: InputFrame, b: InputFrame): InputFrame {
  const useB = Math.hypot(b.moveX, b.moveY) > Math.hypot(a.moveX, a.moveY);
  return {
    moveX: useB ? b.moveX : a.moveX,
    moveY: useB ? b.moveY : a.moveY,
    sprint: a.sprint || b.sprint,
    shoot: a.shoot || b.shoot,
    pass: a.pass || b.pass,
    check: a.check || b.check,
    switchPlayer: a.switchPlayer || b.switchPlayer,
    lineChange: a.lineChange || b.lineChange,
    powerupA: a.powerupA || b.powerupA,
    powerupB: a.powerupB || b.powerupB,
    pullGoalie: Boolean(a.pullGoalie) || Boolean(b.pullGoalie),
  };
}
