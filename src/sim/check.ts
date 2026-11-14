import { energyScale } from './lines';
import { spinEscape } from './talents';
import { wrapAngle } from './skater';
import { carrierOf, dist, loosePuck } from './team';
import type { Tuning } from './tuning';
import type { InputFrame, Player, SimEvent, World } from './types';

/** How fast the checker is closing on the target, along the line between them. */
export function closingSpeed(checker: Player, target: Player): number {
  const dx = target.pos.x - checker.pos.x;
  const dy = target.pos.y - checker.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  return ((checker.vel.x - target.vel.x) * dx + (checker.vel.y - target.vel.y) * dy) / d;
}

/** Which kind of check this would be right now, or null if the carrier is out of reach. */
export function checkKind(checker: Player, carrier: Player, world: World, t: Tuning): 'body' | 'poke' | null {
  if (dist(checker.pos, carrier.pos) <= t.check.bodyRange && closingSpeed(checker, carrier) >= t.check.minClosingSpeed) {
    return 'body';
  }
  const puck = world.puck.pos;
  const toPuck = Math.atan2(puck.y - checker.pos.y, puck.x - checker.pos.x);
  const inCone = Math.abs(wrapAngle(toPuck - checker.facing)) <= (t.check.pokeConeDegrees * Math.PI) / 360;
  return dist(checker.pos, puck) <= t.check.pokeRange && inCone ? 'poke' : null;
}

/**
 * Handles the check button. Close to the puck carrier and closing on him: a body check, which
 * knocks the puck loose and staggers him. Otherwise, with the puck in reach of the stick: a poke check.
 * The checker's checking against the carrier's puck control shifts the odds.
 */
export function stepChecking(world: World, p: Player, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  const pressed = input.check && !p.checkHeld;
  p.checkHeld = input.check;
  if (!pressed || p.checkCooldown > 0 || world.puck.carrier === p.id) return;
  p.checkCooldown = t.check.cooldownSeconds;

  const carrier = carrierOf(world);
  if (!carrier || carrier.team === p.team || carrier.role !== 'skater') return;
  const kind = checkKind(p, carrier, world, t);
  if (!kind) return;

  const strength = p.fx.checkStrength * energyScale(p, t.energy.minCheckScale, t);
  const swing = (strength - carrier.fx.puckSecurity) * t.check.ratingSwing;
  const base = kind === 'body' ? t.check.bodyBaseChance : t.check.pokeBaseChance;
  const rolled = world.rng.chance(base + swing);
  // Some gear makes a body check at high closing speed a big hit, which always frees the puck.
  const bigHit = kind === 'body' && p.fx.bigHitKnock > 0 && closingSpeed(p, carrier) >= t.check.bigHitClosingSpeed;
  // A deke in progress slips the check. A spin move turns one that would have worked into one that does not.
  const success = (rolled || bigHit) && carrier.deke <= 0 && !spinEscape(carrier, events);
  // Thrown while closing fast, a body check that lands puts him on the ice.
  const big = kind === 'body' && success && closingSpeed(p, carrier) >= t.check.bigHitClosingSpeed;

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
      carrier.stagger = big ? t.check.knockdownSeconds : t.check.staggerSeconds;
      carrier.knockedDown = big;
      p.stats.hits += 1;
    }
  }
  events.push({ type: 'check', player: p.id, target: carrier.id, kind, success, ...(big ? { big } : {}) });
}
