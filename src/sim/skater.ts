import { hitBoards, hitNets } from './rink';
import type { Tuning } from './tuning';
import type { InputFrame, Skater } from './types';

/** Wraps an angle to the range -PI to PI. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function createSkater(x: number, y: number): Skater {
  return {
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing: 0,
    hand: 1,
    stamina: 1,
    sprintLocked: false,
    sprinting: false,
    restTime: 0,
    charge: 0,
    shootHeld: false,
  };
}

/** Scales from a player's ratings. All 1 means the plain physics values. */
export interface SkaterScales {
  topSpeedScale: number;
  accelerationScale: number;
  drainScale: number;
  recoverScale: number;
}

const PLAIN: SkaterScales = { topSpeedScale: 1, accelerationScale: 1, drainScale: 1, recoverScale: 1 };

function stepStamina(s: Skater, wantsSprint: boolean, t: Tuning, dt: number, scales: SkaterScales): void {
  s.sprinting = wantsSprint && !s.sprintLocked && s.stamina > 0;
  if (s.sprinting) {
    s.stamina = Math.max(0, s.stamina - t.stamina.drainPerSecond * scales.drainScale * dt);
    s.restTime = 0;
    if (s.stamina === 0) s.sprintLocked = true;
    return;
  }
  s.restTime += dt;
  if (s.restTime >= t.stamina.recoverDelay) {
    s.stamina = Math.min(1, s.stamina + t.stamina.recoverPerSecond * scales.recoverScale * dt);
  }
  if (s.sprintLocked && s.stamina >= t.stamina.lockoutUntil) s.sprintLocked = false;
}

/** Advances one skater by dt seconds: stamina, momentum skating, then collisions. */
export function stepSkater(
  s: Skater,
  input: Pick<InputFrame, 'moveX' | 'moveY' | 'sprint'>,
  t: Tuning,
  dt: number,
  scales: SkaterScales = PLAIN,
): void {
  const k = t.skater;
  const tilt = Math.min(1, Math.hypot(input.moveX, input.moveY));

  stepStamina(s, input.sprint && tilt > 0, t, dt, scales);

  const top = k.topSpeed * scales.topSpeedScale * (s.sprinting ? k.sprintSpeedBoost : 1);
  const accel = k.acceleration * scales.accelerationScale * (s.sprinting ? k.sprintAccelBoost : 1);
  let speed = Math.hypot(s.vel.x, s.vel.y);

  if (tilt > 0) {
    const want = Math.atan2(input.moveY, input.moveX);
    let heading = speed > 1e-3 ? Math.atan2(s.vel.y, s.vel.x) : want;

    // The faster the skater is going, the slower the direction of travel can swing round.
    const speedFraction = Math.min(1, speed / (k.topSpeed * scales.topSpeedScale));
    const turnRate = k.turnRateSlow + (k.turnRateFast - k.turnRateSlow) * speedFraction;
    const off = wrapAngle(want - heading);
    const turn = clamp(off, -turnRate * dt, turnRate * dt);
    heading += turn;

    // Push along the stick: forward of travel speeds up, against travel brakes.
    const along = Math.cos(off - turn);
    const target = top * tilt;
    if (along < 0) {
      speed = Math.max(0, speed + k.brakeDecel * tilt * along * dt);
    } else if (speed <= target) {
      speed = Math.min(target, speed + accel * tilt * along * dt);
    } else {
      speed = Math.max(target, speed - (speed - target) * Math.min(1, k.overspeedDrag * dt));
    }

    s.vel.x = Math.cos(heading) * speed;
    s.vel.y = Math.sin(heading) * speed;

    const faceOff = wrapAngle(want - s.facing);
    s.facing = wrapAngle(s.facing + clamp(faceOff, -k.facingTurnRate * dt, k.facingTurnRate * dt));
  } else if (speed > 0) {
    // Stick released: glide.
    const kept = Math.max(0, 1 - k.glideDrag * dt);
    s.vel.x *= kept;
    s.vel.y *= kept;
  }

  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  hitBoards(s.pos, s.vel, k.radius, k.wallBounce, t);
  hitNets(s.pos, s.vel, k.radius, k.wallBounce, k.wallBounce, t);
}
