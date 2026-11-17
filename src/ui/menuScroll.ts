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
