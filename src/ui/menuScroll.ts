import controls from '../data/controls.json';

/**
 * How far the right stick scrolls in a stretch of time, in pixels: nothing inside its dead zone, then faster
 * the further it is pushed, up to the full speed. Down the stick is down the page.
 */
export function scrollPixels(axis: number, seconds: number): number {
  const { deadzone, pixelsPerSecond } = controls.menuScroll;
  const push = Math.abs(axis);
  if (push <= deadzone || seconds <= 0) return 0;
  return Math.sign(axis) * ((Math.min(1, push) - deadzone) / (1 - deadzone)) * pixelsPerSecond * seconds;
}

/**
 * How far the right stick is pushed up or down, from -1 to 1. On a controller the browser recognises
 * (`standard`) it is one known axis. On any other, controllers do not agree on which axis it is (a phone may
 * list the triggers among the axes, and some rest at -1), so each axis it could be is read against where it
 * rested when the controller was first seen (`rest`), and the one pushed furthest counts.
 */
export function lookPush(axes: readonly number[], rest: readonly number[], standard: boolean): number {
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  if (standard) return clamp(axes[controls.menuScroll.standardAxis] ?? 0);
  let best = 0;
  for (const index of controls.menuScroll.axes) {
    const value = axes[index];
    if (value === undefined) continue;
    const moved = clamp(value - (rest[index] ?? 0));
    if (Math.abs(moved) > Math.abs(best)) best = moved;
  }
  return best;
}
