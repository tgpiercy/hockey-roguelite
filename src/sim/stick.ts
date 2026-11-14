export interface StickVector {
  x: number;
  y: number;
}

/**
 * Turns a raw stick reading into a clean direction and strength.
 * Readings inside the dead zone become zero; the rest is rescaled so strength
 * runs smoothly from 0 at the edge of the dead zone to 1 at full tilt.
 */
export function applyDeadzone(x: number, y: number, deadzone: number): StickVector {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone || magnitude === 0) return { x: 0, y: 0 };
  const strength = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return { x: (x / magnitude) * strength, y: (y / magnitude) * strength };
}
