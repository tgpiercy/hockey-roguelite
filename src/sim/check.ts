import { STEP_SECONDS } from './clock';
import { energyScale } from './lines';
import { spinEscape } from './talents';
import { wrapAngle } from './skater';
import { carrierOf, dist, loosePuck, humanOf, humansOn } from './team';
import type { Tuning } from './tuning';
import type { InputFrame, Player, SimEvent, World } from './types';

/** How fast the checker is closing on the target, along the line between them. */
export function closingSpeed(checker: Player, target: Player): number {
  const dx = target.pos.x - checker.pos.x;
  const dy = target.pos.y - checker.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  return ((checker.vel.x - target.vel.x) * dx + (checker.vel.y - target.vel.y) * dy) / d;
}

/**
 * Which kind of check this would be right now, or null if the carrier is out of reach. A body check needs
 * the button to have been held (`charged`), the carrier within arm's reach and the checker closing on him.
 * Anything else is a poke, if the puck is within a stick's reach and in front.
 */
export function checkKind(checker: Player, carrier: Player, world: World, t: Tuning, charged = true, closing = closingSpeed(checker, carrier)): 'body' | 'poke' | null {
  const rules = checkRules(world, checker, t);
  if (charged && dist(checker.pos, carrier.pos) <= rules.bodyRange && closing >= rules.minClosingSpeed) {
    return 'body';
  }
  const puck = world.puck.pos;
  const toPuck = Math.atan2(puck.y - checker.pos.y, puck.x - checker.pos.x);
  const inCone = Math.abs(wrapAngle(toPuck - checker.facing)) <= (rules.pokeConeDegrees * Math.PI) / 360;
  return dist(checker.pos, puck) <= t.check.pokeRange && inCone ? 'poke' : null;
}

/**
 * True while a skater is down on one knee to block a shot: he has held the check button a while without
 * the puck, and the other team's carrier (if there is one) is too far away for the hold to be a hit.
 */
export function braced(world: World, p: Player, t: Tuning): boolean {
  // Braced by holding the button, or, for a club whose trick it is, simply by standing there.
  if (p.role !== 'skater' || p.stagger > 0 || world.puck.carrier === p.id || (p.checkCharge < t.block.braceAfterSeconds && p.fx.alwaysBraced <= 0)) return false;
  const carrier = carrierOf(world);
  return !carrier || carrier.team === p.team || dist(p.pos, carrier.pos) >= t.block.minCarrierDistance;
}

/** The limits a check is judged by. The skater the human controls gets easier ones: check assist, like aim assist. */
export interface CheckRules {
  /** How far round his front a poke reaches, in degrees. */
  pokeConeDegrees: number;
  /** How close the carrier must be, and how fast the checker must have closed on him, for a body check. */
  bodyRange: number;
  minClosingSpeed: number;
  /** How long the button must be held for a body check. */
  bodyHoldSeconds: number;
  /** Added to the chance a poke or a body check works. */
  pokeBonus: number;
  bodyBonus: number;
  /** The wait after a check that reached nobody. */
  missCooldownSeconds: number;
  /**
   * For the player's own skater a poke is settled by where he stands, not by a roll: it works from within
   * this reach of the puck, anywhere but behind the carrier (the arc, in degrees, round the way he is going).
   * Zero for the AI, whose pokes are rolled.
   */
  pokeSureReach: number;
  pokeFrontArcDegrees: number;
}

export function checkRules(world: World, p: Player, t: Tuning): CheckRules {
  const a = t.checkAssist;
  const helped = a.strength > 0 && humanOf(world, p.id) !== null;
  // The AI skaters on a team a person plays on get a share of it: better odds, and nothing else.
  const mate = !helped && a.strength > 0 && humansOn(world, p.team).length > 0;
  if (mate) {
    return { pokeConeDegrees: t.check.pokeConeDegrees, bodyRange: t.check.bodyRange, minClosingSpeed: t.check.minClosingSpeed, bodyHoldSeconds: t.check.bodyHoldSeconds, pokeBonus: a.matePokeBonus * a.strength, bodyBonus: a.mateBodyBonus * a.strength, missCooldownSeconds: t.check.cooldownSeconds, pokeSureReach: 0, pokeFrontArcDegrees: 0 };
  }
  return helped
    ? { pokeConeDegrees: a.pokeConeDegrees, bodyRange: a.bodyRange, minClosingSpeed: a.minClosingSpeed, bodyHoldSeconds: a.bodyHoldSeconds, pokeBonus: a.pokeChanceBonus, bodyBonus: a.bodyChanceBonus, missCooldownSeconds: a.missCooldownSeconds, pokeSureReach: a.pokeSureReach, pokeFrontArcDegrees: a.pokeFrontArcDegrees }
    : { pokeConeDegrees: t.check.pokeConeDegrees, bodyRange: t.check.bodyRange, minClosingSpeed: t.check.minClosingSpeed, bodyHoldSeconds: t.check.bodyHoldSeconds, pokeBonus: 0, bodyBonus: 0, missCooldownSeconds: t.check.cooldownSeconds, pokeSureReach: 0, pokeFrontArcDegrees: 0 };
}

/**
 * The player's own poke: it takes the puck if the stick is close enough and he is not reaching from behind
 * the carrier. A better checker against a worse puck-handler reaches a little further, and the other way about.
 * The same poke from the same spot always ends the same way.
 */
function surePoke(world: World, checker: Player, carrier: Player, rules: CheckRules, swing: number): boolean {
  const reach = rules.pokeSureReach * (1 + swing);
  if (dist(checker.pos, world.puck.pos) > reach) return false;
  const moving = Math.hypot(carrier.vel.x, carrier.vel.y) > 0.5;
  const heading = moving ? Math.atan2(carrier.vel.y, carrier.vel.x) : carrier.facing;
  const toChecker = Math.atan2(checker.pos.y - carrier.pos.y, checker.pos.x - carrier.pos.x);
  return Math.abs(wrapAngle(toChecker - heading)) <= (rules.pokeFrontArcDegrees * Math.PI) / 360;
}

/**
 * Tracks the check button. A tap is a poke check; holding it for a moment and letting go is a body check,
 * if the carrier is within reach by then (otherwise that too is a poke). Either is thrown as the button comes up.
 */
export function stepChecking(world: World, p: Player, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  const wasHeld = p.checkHeld;
  p.checkHeld = input.check;
  const target = carrierOf(world);
  const closingNow = target && target.team !== p.team ? closingSpeed(p, target) : 0;
  if (input.check) {
    p.checkCharge += STEP_SECONDS;
    // Remember how fast he came in: by the time the button comes up the two have usually bumped and stopped.
    p.checkClosing = Math.max(p.checkClosing, closingNow);
    return;
  }
  const held = p.checkCharge;
  const closing = Math.max(p.checkClosing, closingNow);
  p.checkCharge = 0;
  p.checkClosing = 0;
  if (!wasHeld) return;
  resolveCheck(world, p, held >= checkRules(world, p, t).bodyHoldSeconds, t, events, closing);
}

/**
 * Throws a check. `charged` says the button was held long enough for a body check, which knocks the puck
 * loose and staggers the carrier; otherwise, or out of arm's reach, it is a poke with the stick.
 * The checker's checking against the carrier's puck control shifts the odds.
 */
export function resolveCheck(world: World, p: Player, charged: boolean, t: Tuning, events: SimEvent[], closing?: number): void {
  if (p.checkCooldown > 0 || world.puck.carrier === p.id) return;
  p.checkCooldown = t.check.cooldownSeconds;

  const rules = checkRules(world, p, t);
  const carrier = carrierOf(world);
  // A check at nobody costs only the short wait (for the human; for the AI the two are the same).
  if (!carrier || carrier.team === p.team || carrier.role !== 'skater') {
    p.checkCooldown = rules.missCooldownSeconds;
    return;
  }
  const speed = closing ?? closingSpeed(p, carrier);
  const kind = checkKind(p, carrier, world, t, charged, speed);
  if (!kind) {
    p.checkCooldown = rules.missCooldownSeconds;
    return;
  }

  const strength = p.fx.checkStrength * energyScale(p, t.energy.minCheckScale, t);
  const swing = (strength - carrier.fx.puckSecurity) * t.check.ratingSwing;
  const base = kind === 'body' ? t.check.bodyBaseChance + rules.bodyBonus : t.check.pokeBaseChance + rules.pokeBonus;
  // (The roll is always made, so the game's random stream is the same whoever is checking.)
  const roll = world.rng.chance(base + swing);
  const rolled = kind === 'poke' && rules.pokeSureReach > 0 ? surePoke(world, p, carrier, rules, swing) : roll;
  // Some gear makes a body check at high closing speed a big hit, which always frees the puck.
  const bigHit = kind === 'body' && p.fx.bigHitKnock > 0 && speed >= t.check.bigHitClosingSpeed;
  // A deke in progress slips the check. A spin move turns one that would have worked into one that does not.
  // Caught winding up a shot that could not be saved: the check always takes the puck. (The answer to that trick.)
  const windUp = carrier.fx.unstoppableCharged > 0 && carrier.charge > 0;
  const evaded = carrier.deke > 0;
  const success = (rolled || bigHit || windUp) && !evaded && !spinEscape(carrier, events);
  // Thrown while closing fast, a body check that lands puts him on the ice.
  // (A sure-footed carrier is never put down, whoever hits him.)
  const big = kind === 'body' && success && carrier.fx.sureFooted <= 0 && (p.fx.alwaysKnockdown > 0 || speed >= t.check.bigHitClosingSpeed);

  if (kind === 'body') {
    p.vel.x *= t.check.checkerSpeedKeep;
    p.vel.y *= t.check.checkerSpeedKeep;
  }
  if (success) {
    // The puck squirts away from the checker, somewhere in a wide arc.
    const away = Math.atan2(carrier.pos.y - p.pos.y, carrier.pos.x - p.pos.x) + world.rng.range(-1, 1);
    loosePuck(world);
    world.puck.vel.x = carrier.vel.x * 0.5 + Math.cos(away) * t.check.knockSpeed;
    world.puck.vel.y = carrier.vel.y * 0.5 + Math.sin(away) * t.check.knockSpeed;
    carrier.pickupLock = t.check.pickupLockSeconds;
    carrier.charge = 0;
    carrier.passCharge = 0;
    if (kind === 'body') {
      carrier.stagger = (big ? t.check.knockdownSeconds : t.check.staggerSeconds) * (carrier.fx.sureFooted > 0 ? t.check.sureFootedStagger : 1);
      carrier.knockedDown = big;
      p.stats.hits += 1;
    }
  }
  events.push({ type: 'check', player: p.id, target: carrier.id, kind, success, ...(big ? { big } : {}), ...(evaded ? { evaded } : {}), ...(success && windUp ? { windUp } : {}) });
}
