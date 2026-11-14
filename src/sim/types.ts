import type { Rng } from '../core/rng';
import type { GoalieEffects, SkaterEffects } from './ratings';

export interface Vec {
  x: number;
  y: number;
}

/**
 * What one player is asking for this step. A controller and the AI both produce this.
 * The stick is already dead-zoned, length 0 to 1.
 */
export interface InputFrame {
  moveX: number;
  moveY: number;
  sprint: boolean;
  shoot: boolean;
  pass: boolean;
  check: boolean;
  switchPlayer: boolean;
}

export const NO_INPUT: InputFrame = {
  moveX: 0,
  moveY: 0,
  sprint: false,
  shoot: false,
  pass: false,
  check: false,
  switchPlayer: false,
};

/** Per-skater shooting abilities, 0 to 1. */
export interface SkaterParams {
  shotPower: number;
  accuracy: number;
}

/** The moving body of a player. */
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

export type AiState = 'attack' | 'support' | 'chase' | 'defend' | 'backcheck';

/** What an AI skater has decided, kept between its thinking moments. */
export interface AiMemory {
  state: AiState;
  /** Seconds until it next reconsiders. */
  thinkIn: number;
  /** What it is skating toward: a fixed point, the puck, or the puck carrier. */
  follow: 'point' | 'puck' | 'carrier';
  targetX: number;
  targetY: number;
  sprint: boolean;
  /** Steps left in a planned shot or pass: the button is held, then released on the last one. */
  shootSteps: number;
  passSteps: number;
  /** Direction the stick will point when the shot or pass is released. */
  aimX: number;
  aimY: number;
  /** Whether it will throw a check when it gets in range. */
  wantCheck: boolean;
  /** Seconds it has carried the puck in the attacking half. */
  carryTime: number;
}

export interface GoalieState {
  fx: GoalieEffects;
  /** Recent puck positions, newest last: the goalie reacts to an old one. */
  seen: { pos: Vec; vel: Vec; loose: boolean }[];
  /** Seconds left holding a frozen puck. */
  hold: number;
  /** Seconds during which the puck passes through him (just after he plays it). */
  ignorePuck: number;
}

export interface Player extends Skater {
  id: number;
  /** Team 0 defends the left net and attacks right; team 1 the reverse. */
  team: 0 | 1;
  role: 'skater' | 'goalie';
  fx: SkaterEffects;
  goalie: GoalieState | null;
  ai: AiMemory;
  passCharge: number;
  passHeld: boolean;
  checkHeld: boolean;
  /** Seconds until this player can check again. */
  checkCooldown: number;
  /** Seconds left knocked off balance: no control. */
  stagger: number;
  /** Seconds until this player can collect the puck again. */
  pickupLock: number;
}

export interface Puck {
  pos: Vec;
  vel: Vec;
  /** Id of the player carrying it, or null when loose. */
  carrier: number | null;
  /** Seconds left in the air (saucer pass): nobody can touch it. */
  air: number;
  /** Id of the player a pass is meant for, or null. */
  passTarget: number | null;
  /** The team that last had it. */
  lastTeam: 0 | 1 | null;
}

export type SimEvent =
  | { type: 'goal'; side: -1 | 1; team: 0 | 1 }
  | { type: 'shot'; speed: number; player: number }
  | { type: 'pass'; player: number; target: number | null; saucer: boolean }
  | { type: 'post' }
  | { type: 'pickup'; player: number }
  | { type: 'save'; goalie: number; frozen: boolean }
  | { type: 'check'; player: number; target: number; kind: 'body' | 'poke'; success: boolean };

export interface World {
  tick: number;
  players: Player[];
  puck: Puck;
  /** Goals for team 0 and team 1. */
  score: [number, number];
  /** "goal" is the short pause after a goal, before the reset. */
  phase: 'play' | 'goal';
  phaseTime: number;
  rng: Rng;
  /** The human's team and the skater being controlled, or null for an all-AI game. */
  human: { team: 0 | 1; controlled: number; switchHeld: boolean } | null;
  /** AI level per team, 0 (easy) to 1 (hard). Null means "take it from the tuning". */
  levels: [number | null, number | null];
  lineup: 'full' | 'solo';
}
