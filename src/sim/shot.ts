import type { Rng } from '../core/rng';
import type { Tuning } from './tuning';
import type { InputFrame, Puck, Skater, SkaterParams } from './types';

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** How full the charge is, 0 (a tap) to 1 (fully wound up). */
export function chargeFraction(heldSeconds: number, t: Tuning): number {
  if (heldSeconds <= t.shot.tapTime) return 0;
  const span = Math.max(1e-6, t.shot.chargeTime - t.shot.tapTime);
  return Math.min(1, (heldSeconds - t.shot.tapTime) / span);
}

/** Puck speed for a shot held this long by a skater with this shot power (0 to 1). */
export function shotSpeed(heldSeconds: number, shotPower: number, t: Tuning): number {
  const base = lerp(t.shot.wristSpeed, t.shot.maxSpeed, chargeFraction(heldSeconds, t));
  return base * lerp(t.shot.powerFloor, 1, shotPower);
}

/** The most a shot can stray from its aim, in radians, for a skater with this accuracy (0 to 1). */
export function shotSpread(accuracy: number, t: Tuning): number {
  return (lerp(t.shot.maxSpreadDegrees, t.shot.minSpreadDegrees, accuracy) * Math.PI) / 180;
}

/**
 * Tracks the shoot button for a skater. With the puck, holding builds charge and letting go shoots:
 * the puck is given its velocity and the shot's speed is returned (the caller releases the puck).
 * Returns null if no shot left the stick.
 */
export function stepShooting(
  s: Skater,
  hasPuck: boolean,
  puck: Puck,
  input: Pick<InputFrame, 'moveX' | 'moveY' | 'shoot'>,
  params: SkaterParams,
  t: Tuning,
  rng: Rng,
  dt: number,
  /** Optional aim assist: takes the direction the stick asks for and returns the direction to shoot in. */
  assist?: (aim: number) => number,
): number | null {
  const wasHeld = s.shootHeld;
  s.shootHeld = input.shoot;

  if (!hasPuck) {
    s.charge = 0;
    return null;
  }
  if (input.shoot) {
    s.charge += dt;
    return null;
  }
  if (!wasHeld) return null;

  // Released: aim along the stick, or straight ahead if the stick is centred.
  const tilt = Math.hypot(input.moveX, input.moveY);
  const asked = tilt > 0 ? Math.atan2(input.moveY, input.moveX) : s.facing;
  const aim = assist ? assist(asked) : asked;
  const angle = aim + rng.range(-1, 1) * shotSpread(params.accuracy, t);
  // A one-timer counts as fully wound up however briefly the button was held.
  const oneTimer = params.oneTimer ?? 1;
  const held = params.oneTimer !== undefined ? Math.max(s.charge, t.shot.chargeTime) : s.charge;
  const full = chargeFraction(held, t) >= 1;
  const speed = shotSpeed(held, params.shotPower, t) * (full ? (params.chargedShotScale ?? 1) : 1) * oneTimer;

  puck.vel.x = Math.cos(angle) * speed + s.vel.x * t.shot.skaterSpeedShare;
  puck.vel.y = Math.sin(angle) * speed + s.vel.y * t.shot.skaterSpeedShare;
  s.charge = 0;
  return speed;
}
