import type { ShootoutRules, ShootoutState } from './shootout';
import type { Modifier } from './modifiers';
import type { MascotVisit } from './mascot';
import type { Tactics } from './tactics';
import type { Rng } from '../core/rng';
import type { Boost, PowerupSpec } from './modifiers';
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
  lineChange: boolean;
  /** The two powerup buttons (LT and RB). */
  powerupA: boolean;
  powerupB: boolean;
  /** Pull the goalie for an extra skater, or send him back: only late in a game the team is losing. */
  pullGoalie?: boolean;
}

export const NO_INPUT: InputFrame = {
  moveX: 0,
  moveY: 0,
  sprint: false,
  shoot: false,
  pass: false,
  check: false,
  switchPlayer: false,
  lineChange: false,
  powerupA: false,
  powerupB: false,
  pullGoalie: false,
};

/** Per-skater shooting abilities, 0 to 1. */
export interface SkaterParams {
  shotPower: number;
  accuracy: number;
  /** Speed scale for a fully charged shot. Left out means 1. */
  chargedShotScale?: number;
  /** Given when this shot is a one-timer: it counts as fully charged and its speed is scaled by this. */
  oneTimer?: number;
  /** Scales how far the shot can stray from its aim: under 1 for the human's assisted shots. Left out means 1. */
  spreadScale?: number;
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
  /** True when it has decided to deke on its next step. */
  wantDeke: boolean;
  /** Steps left holding the check button: it is let go on the last one. */
  checkSteps: number;
  /** The teammate its next pass must go to, whoever else is in that direction; null to choose as usual. */
  passTo: number | null;
  /** True while winding up a shot from distance: he plants his feet instead of skating in as he charges. */
  plant: boolean;
}

export interface GoalieState {
  fx: GoalieEffects;
  /** His abilities before any running boost. */
  baseFx: GoalieEffects;
  /** Recent puck positions, newest last: the goalie reacts to an old one. */
  seen: { pos: Vec; vel: Vec; loose: boolean }[];
  /** Seconds left holding a frozen puck. */
  hold: number;
  /** Seconds during which the puck passes through him (just after he plays it). */
  ignorePuck: number;
  /** Automatic saves he has left this period, and the period that count belongs to. */
  autoSavesLeft: number;
  autoSavePeriod: number;
  /** Seconds left stuck where he is after biting on a shot fake. */
  bitten: number;
}

/** What a player did in the game. Later phases award XP and milestones from these. */
export interface PlayerStats {
  goals: number;
  assists: number;
  shots: number;
  /** Body checks that landed. */
  hits: number;
  /** Opponents' shots that deflected off his body. */
  blocks: number;
  /** Seconds on the ice while the clock ran. */
  timeOnIce: number;
  /** Goalies only. */
  saves: number;
  goalsAgainst: number;
}

export interface Player extends Skater {
  id: number;
  /** Team 0 defends the left net and attacks right; team 1 the reverse. */
  team: 0 | 1;
  role: 'skater' | 'goalie';
  /** Forward, defenceman or goalie. For skaters it only nudges where the AI sends them. */
  position: 'F' | 'D' | 'G';
  /** His abilities right now: ratings, the team's lasting modifiers, and any running boost. */
  fx: SkaterEffects;
  /** His abilities before any running boost. */
  baseFx: SkaterEffects;
  goalie: GoalieState | null;
  ai: AiMemory;
  passCharge: number;
  passHeld: boolean;
  checkHeld: boolean;
  /** Seconds the check button has been held: long enough makes it a body check on release. */
  checkCharge: number;
  /** The fastest he has closed on the puck carrier while holding the check button: what makes the hit count. */
  checkClosing: number;
  /** Seconds until this player can check again. */
  checkCooldown: number;
  /** Seconds left knocked off balance: no control. */
  stagger: number;
  /** Seconds until this player can collect the puck again. */
  pickupLock: number;
  /** False while sitting on the bench. */
  onIce: boolean;
  /** Which of the team's two lines he is on (goalies: 0), and his place in it: 0 is the centre. */
  line: 0 | 1;
  slot: number;
  /** Shift energy, 0 (spent) to 1 (fresh). Falls on the ice, refills on the bench. */
  energy: number;
  /** True while heading to the bench on a line change. */
  leaving: boolean;
  /** Seconds left in which a shot counts as a one-timer: set when he receives a pass meant for him. */
  oneTimer: number;
  /** True if shoot was already held when the pass arrived: the shot goes first-touch, on the next step. */
  oneTimerArmed: boolean;
  /** Seconds left in a deke: a check thrown at him now misses. */
  deke: number;
  /** Seconds until he can deke again, and whether the button is still down from last time. */
  dekeCooldown: number;
  dekeHeld: boolean;
  /** True while flat on the ice after a big hit (his stagger is then the time until he is up). */
  knockedDown: boolean;
  /** Seconds of burst speed left (a boss trick). */
  burst: number;
  /** Seconds left of the pump after a shot fake, and seconds until he can fake again. */
  fake: number;
  fakeCooldown: number;
  /** True while the pass button is still down from the fake: it must not also pass. */
  fakePass: boolean;
  /** His own modifiers that only count some of the time, the ones in force now, and his own timed boosts. See conditions.ts. */
  conditional: Modifier[];
  active: Modifier[];
  timed: { on: string; modifiers: Modifier[]; secondsLeft: number }[];
  /** Talent ids he carries (mascots do); see talents.ts. Empty for ordinary players. */
  talents: string[];
  /** Seconds until each talent can trigger again, by talent id. */
  talentCooldown: Record<string, number>;
  /** The period in which his rally cry was last used. */
  rallyPeriod: number;
  stats: PlayerStats;
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
  /** Players of one team who have had it in a row, oldest first: the last is the scorer, the ones before get assists. */
  touches: number[];
  /** Id of the player who shot it, until someone else plays it. A goalie stop only counts as a save on a shot. */
  shotBy: number | null;
  /** True for a flat pass that cannot be picked off in the lane. */
  threaded: boolean;
  /** True once a shot has been tipped by a teammate: it is only tipped once. */
  tipped: boolean;
  /** True for a shot no goalie can stop (a boss trick). */
  unstoppable: boolean;
}

export type SimEvent =
  | { type: 'goal'; side: -1 | 1; team: 0 | 1; scorer: number | null; assists: number[] }
  | { type: 'faceoff'; winner: 0 | 1 | null }
  | { type: 'period'; period: number }
  | { type: 'shootout'; team: 0 | 1; scored: boolean }
  | { type: 'mascot'; team: 0 | 1; player: number; arrived: boolean }
  | { type: 'final' }
  | { type: 'change'; team: 0 | 1; off: number; on: number }
  | { type: 'powerup'; team: 0 | 1; slot: number; id: string }
  | { type: 'talent'; player: number; id: string }
  | { type: 'shot'; speed: number; player: number; oneTimer?: boolean }
  | { type: 'deke'; player: number }
  /** A person threw a check with the carrier out of reach altogether: nothing happened. */
  | { type: 'whiff'; player: number; /** From his stick hand to the puck. */ metres: number; /** The puck was near enough: he was facing the wrong way. */ turned?: boolean }
  | { type: 'fake'; player: number }
  | { type: 'block'; player: number }
  | { type: 'tip'; player: number }
  | { type: 'fire'; team: 0 | 1 }
  | { type: 'pull'; team: 0 | 1; on: boolean }
  | { type: 'pass'; player: number; target: number | null; saucer: boolean }
  | { type: 'post' }
  | { type: 'pickup'; player: number; /** He was the one the pass was meant for. */ pass?: boolean }
  | { type: 'save'; goalie: number; frozen: boolean }
  | { type: 'check'; player: number; target: number; kind: 'body' | 'poke'; success: boolean; big?: boolean; /** The carrier's deke slipped it. */ evaded?: boolean; /** Why a person's own poke took nothing: the stick was short of the puck, or he reached from behind the carrier. */ miss?: 'far' | 'behind'; /** It caught him winding up a shot that could not have been saved. */ windUp?: boolean };

/** A person playing: his team, the skater he controls, and what his buttons were doing. */
export interface Human {
    team: 0 | 1;
    controlled: number;
    switchHeld: boolean;
    /** Whether pass was down on the previous step, to see a fresh press. */
    passHeld: boolean;
    /** Just after a pass: who passed and to whom, and how long a second press of pass still asks for it back. */
    giveGoOffer: { passer: number; receiver: number; left: number } | null;
    /** A give and go in progress: control stays with the passer while the receiver looks to return the puck. */
    giveGo: { passer: number; receiver: number; left: number } | null;
    /** True if control stays on his skater until he presses switch: it does not follow the puck to a team-mate. */
    hold?: boolean;
    /** Whether shoot was down on the previous step, whoever he controlled. */
    shootDown?: boolean;
    /** Seconds left in which a shoot button let go just before a pass arrived still counts when it does. */
    earlyShoot?: number;
}

export interface World {
  tick: number;
  players: Player[];
  puck: Puck;
  /** Goals for team 0 and team 1. */
  score: [number, number];
  /**
   * "goal" is the short pause after a goal. The rest only happen with game rules:
   * "faceoff" (lined up, waiting for the draw), "break" (between periods), "final" (game over).
   */
  phase: 'play' | 'goal' | 'faceoff' | 'break' | 'final';
  phaseTime: number;
  rng: Rng;
  /** The first human: his team and the skater he controls, or null for an all-AI game. */
  human: Human | null;
  /** A second human, on the same team (co-op) or the other one (versus), or null. */
  human2: Human | null;
  /** AI level per team, 0 (easy) to 1 (hard). Null means "take it from the tuning". */
  levels: [number | null, number | null];
  lineup: 'full' | 'solo';
  /** "scrimmage": endless play, no clock, faceoffs or line changes. "game": the full rules. "shootout": turns against the goalie (shootout.ts). */
  rules: 'scrimmage' | 'game' | 'shootout';
  /** Rules a rink changes for this game. Empty for the usual game. */
  match: MatchRules;
  /** The shootout in progress, when that is what is being played. */
  shootout: ShootoutState | null;
  /** 1 to 3, then 4 for overtime. */
  period: number;
  /** Seconds left in the period; in overtime, seconds played. */
  clock: number;
  overtime: boolean;
  /** Overtime ends in a tie after this many seconds; 0 means it runs until someone scores. */
  overtimeLimit: number;
  /** The score at the end of each period played so far. */
  periodScores: [number, number][];
  /** The last shot taken: who by, whether his path to the net was clear, and from how far. A goal reads it. */
  lastShot: { team: 0 | 1; clear: boolean; oneTimer: boolean; metres: number } | null;
  /** How each goal so far was scored, in order. */
  goalNotes: { team: 0 | 1; clear: boolean; oneTimer: boolean; metres: number | null }[];
  /** Seconds the horn has waited, at the end of a period, for a shot already on its way. */
  hornWait: number;
  faceoff: FaceoffState | null;
  teams: [TeamState, TeamState];
}

/** Rules that differ from the usual game: a rink (rinks.json) or a mode sets them. */
export interface MatchRules {
  /** No clock: the first team to this many goals wins. */
  firstTo?: number;
  /** The game is called off when a team leads by this many after a goal. */
  mercy?: number;
  /** One line each and no changes: the second line never comes on. */
  oneLine?: boolean;
  /** Not a game at all but a shootout. */
  shootout?: ShootoutRules;
  /** Not a game at all but a practice: endless play, no clock, no faceoffs, nothing to settle. */
  practice?: boolean;
}

export interface TeamState {
  /** The line that is on the ice, or coming on. */
  line: 0 | 1;
  /** Seconds until an automatic change can be called again. */
  changeCooldown: number;
  /** Whether the line-change button was held on the previous step. */
  changeHeld: boolean;
  /** The powerups loaded for this game, one per button. A used slot becomes null. */
  powerups: (PowerupSpec | null)[];
  /** Ids of the powerups used so far, in order. */
  powerupsUsed: string[];
  /** Whether each powerup button was held on the previous step. */
  powerupHeld: boolean[];
  /** Seconds of play until the powerup on each button can be used again (a recharging one only). */
  powerupWait: number[];
  /** Timed boosts that are running. */
  boosts: Boost[];
  /** The team's modifiers that only count some of the time (see conditions.ts), and the ones in force now. */
  conditional: Modifier[];
  active: Modifier[];
  /** How this team's AI skaters like to attack: a style id from ai.json, or null. */
  style: string | null;
  /** The line given longer shifts, or null for even shifts. */
  heavyLine: 0 | 1 | null;
  /** How this team's AI skaters are told to play, or null for no leaning. It may be changed during a game. */
  tactics: Tactics | null;
  /** Momentum, 0 to 1: full sets the team on fire. */
  heat: number;
  /** The period for which a hot start (a boss trick) has already been given. */
  heatedPeriod: number;
  /** The team's mascot for this game, if it has one: see mascot.ts. */
  mascot: MascotVisit | null;
  /** True while the goalie is off for an extra skater, and who that skater is. */
  pulled: boolean;
  extra: number | null;
  /** Whether the pull-goalie button was held on the previous step. */
  pullHeld: boolean;
}

export interface FaceoffState {
  /** Seconds until the puck drops. */
  dropIn: number;
  dropped: boolean;
  /** Seconds since the drop. */
  sinceDrop: number;
  /** Seconds each centre is locked out after the drop, for pressing early. */
  lock: [number, number];
  /** How long after the drop each AI centre will go for the puck. */
  aiDelay: [number, number];
  /** Whether each centre's draw button was held on the previous step. */
  held: [boolean, boolean];
}
