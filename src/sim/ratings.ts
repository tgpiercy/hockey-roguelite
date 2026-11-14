import table from '../data/ratings.json';

/** Skater ratings, each 0 to 100. */
export interface SkaterRatings {
  shooting: number;
  passing: number;
  speed: number;
  checking: number;
  puckControl: number;
  stamina: number;
}

/** Goalie ratings, each 0 to 100. */
export interface GoalieRatings {
  reflexes: number;
  positioning: number;
  reboundControl: number;
  stamina: number;
}

/** What a skater's ratings do on the ice. A skater rated 70 gets the plain physics values. */
export interface SkaterEffects {
  topSpeedScale: number;
  accelerationScale: number;
  shotPower: number;
  accuracy: number;
  passSpeedScale: number;
  passSpreadDegrees: number;
  checkStrength: number;
  puckSecurity: number;
  handleSpeedScale: number;
  drainScale: number;
  recoverScale: number;
}

/** What a goalie's ratings do on the ice. */
export interface GoalieEffects {
  /** Delay before the goalie reacts to where the puck is. */
  reactionSeconds: number;
  /** How fast the goalie moves across the crease. */
  lateralSpeed: number;
  /** How much net the goalie's body covers. */
  coverRadius: number;
  /** How far out from the goal line the goalie plays. */
  depth: number;
  /** Shots slower than this are frozen; faster ones rebound. */
  freezeSpeed: number;
  /** Share of a shot's speed left in the rebound. */
  reboundKeep: number;
}

export const defaultSkaterRatings: SkaterRatings = table.defaults.skater;
export const defaultGoalieRatings: GoalieRatings = table.defaults.goalie;

/** The effect of a rating: a straight line from its value at 0 to its value at 100. */
function at(pair: number[], rating: number): number {
  const k = Math.max(0, Math.min(100, rating)) / 100;
  return (pair[0] as number) + ((pair[1] as number) - (pair[0] as number)) * k;
}

export function skaterEffects(r: SkaterRatings): SkaterEffects {
  const s = table.skater;
  return {
    topSpeedScale: at(s.speed.topSpeedScale, r.speed),
    accelerationScale: at(s.speed.accelerationScale, r.speed),
    shotPower: at(s.shooting.shotPower, r.shooting),
    accuracy: at(s.shooting.accuracy, r.shooting),
    passSpeedScale: at(s.passing.passSpeedScale, r.passing),
    passSpreadDegrees: at(s.passing.passSpreadDegrees, r.passing),
    checkStrength: at(s.checking.checkStrength, r.checking),
    puckSecurity: at(s.puckControl.puckSecurity, r.puckControl),
    handleSpeedScale: at(s.puckControl.handleSpeedScale, r.puckControl),
    drainScale: at(s.stamina.drainScale, r.stamina),
    recoverScale: at(s.stamina.recoverScale, r.stamina),
  };
}

export function goalieEffects(r: GoalieRatings): GoalieEffects {
  const g = table.goalie;
  return {
    reactionSeconds: at(g.reflexes.reactionSeconds, r.reflexes),
    lateralSpeed: at(g.reflexes.lateralSpeed, r.reflexes),
    coverRadius: at(g.positioning.coverRadius, r.positioning),
    depth: at(g.positioning.depth, r.positioning),
    freezeSpeed: at(g.reboundControl.freezeSpeed, r.reboundControl),
    reboundKeep: at(g.reboundControl.reboundKeep, r.reboundControl),
  };
}
