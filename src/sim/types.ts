import type { Rng } from '../core/rng';

export interface Vec {
  x: number;
  y: number;
}

/** What the player is asking for this step. The stick is already dead-zoned, length 0 to 1. */
export interface InputFrame {
  moveX: number;
  moveY: number;
  sprint: boolean;
  shoot: boolean;
}

/** Per-skater abilities, 0 to 1. Player ratings will drive these later. */
export interface SkaterParams {
  shotPower: number;
  accuracy: number;
}

export interface Skater {
  pos: Vec;
  vel: Vec;
  /** Direction the skater faces, in radians. Y points down the screen. */
  facing: number;
  /** 1 on the right of the facing direction, -1 on the left: the side the puck is carried on. */
  hand: 1 | -1;
  /** 0 (empty) to 1 (full). */
  stamina: number;
  /** True after running dry, until stamina recovers past the lockout level. */
  sprintLocked: boolean;
  sprinting: boolean;
  /** Seconds since the last sprint step. */
  restTime: number;
  /** Seconds the shoot button has been held with the puck. */
  charge: number;
  /** Whether shoot was held on the previous step. */
  shootHeld: boolean;
}

export interface Puck {
  pos: Vec;
  vel: Vec;
  carried: boolean;
  /** Seconds until the puck can be picked up again after a shot. */
  pickupCooldown: number;
}

export type SimEvent =
  | { type: 'goal'; side: -1 | 1 }
  | { type: 'shot'; speed: number }
  | { type: 'post' }
  | { type: 'pickup' };

export interface World {
  tick: number;
  skater: Skater;
  puck: Puck;
  goals: number;
  /** "goal" is the short pause after a goal, before the reset. */
  phase: 'play' | 'goal';
  phaseTime: number;
  rng: Rng;
}

export const NO_INPUT: InputFrame = { moveX: 0, moveY: 0, sprint: false, shoot: false };
