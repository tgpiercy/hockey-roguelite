import data from '../data/hints.json';
import { attackDir, availableSkaters, carrierOf, dist, distToSegment, humanOf, otherTeam, ownNet, targetNet } from '../sim/team';
import type { Tuning } from '../sim/tuning';
import type { Human, SimEvent, World } from '../sim/types';

/** A move the game can remind the player of. */
export type HintId = keyof typeof data.hints;

/** In the order they are preferred when two have been done equally often. */
export const HINT_IDS = Object.keys(data.hints) as HintId[];

/** How many times each move has been done on this device. */
export type HintCounts = Record<string, number>;

export function hintText(id: HintId): string {
  return data.hints[id];
}

/** True once a move has been done often enough that its hint is no longer shown. */
export function retired(id: HintId, done: HintCounts): boolean {
  return (done[id] ?? 0) >= data.retireAfter;
}

/** Every move that is on for the human's skater right now. */
export function hintsThatApply(world: World, t: Tuning, human: Human | null = world.human): HintId[] {
  if (!human || world.phase !== 'play') return [];
  const me = world.players[human.controlled];
  if (!me || !me.onIce || me.stagger > 0) return [];
  const puck = world.puck;
  const mates = availableSkaters(world, me.team).filter((p) => p.id !== me.id);
  const opponents = availableSkaters(world, otherTeam(me.team));
  const out: HintId[] = [];
  // Listed in the order of HINT_IDS, which is the order of preference.

  if (puck.carrier === null) {
    if (puck.passTarget === me.id && puck.lastTeam === me.team && !me.shootHeld) out.push('oneTimer');
    return out;
  }
  const carrier = carrierOf(world);
  if (!carrier || carrier.role !== 'skater') return out;

  if (carrier.id === me.id) {
    const net = targetNet(me.team, t);
    if (me.charge <= 0 && dist(me.pos, net) <= data.shootRange) out.push('shoot');
    // A team-mate nearer the net than he is: the pass is on.
    if (mates.some((m) => dist(m.pos, net) < dist(me.pos, net))) out.push('pass');
    if (me.charge > 0 && dist(me.pos, targetNet(me.team, t)) <= t.fake.range) out.push('fake');
    if (opponents.some((o) => dist(o.pos, me.pos) <= data.dekeRange)) out.push('deke');
    if (mates.some((m) => opponents.some((o) => distToSegment(o.pos, puck.pos, m.pos) <= data.laneWidth))) out.push('saucer');
    if (attackDir(me.team) * me.pos.x > 0 && mates.some((m) => dist(m.pos, me.pos) <= data.giveGoRange)) out.push('giveGo');
    return out;
  }
  if (carrier.team === me.team) return out;

  const gap = dist(me.pos, carrier.pos);
  // Somebody of his is clearly nearer the carrier than the skater he has.
  // (Never a co-op partner's skater: each keeps his own.)
  if (mates.some((m) => humanOf(world, m.id) === null && dist(m.pos, carrier.pos) + data.switchGap < gap)) out.push('switchTo');
  if (carrier.charge > 0 && gap >= t.block.minCarrierDistance && distToSegment(me.pos, carrier.pos, ownNet(me.team, t)) <= data.blockLane) out.push('block');
  if (dist(me.pos, puck.pos) <= t.check.pokeRange * data.pokeNear) out.push('poke');
  if (gap <= data.hitNear) out.push('bodyCheck');
  return out;
}

/**
 * The hint to show now, or null: of the moves that are on and not yet retired, the one done least often
 * (so the player is told about what he has not tried), in list order between equals.
 */
export function hintFor(world: World, t: Tuning, done: HintCounts, human: Human | null = world.human): HintId | null {
  let best: HintId | null = null;
  for (const id of hintsThatApply(world, t, human)) {
    if (retired(id, done)) continue;
    if (best === null || (done[id] ?? 0) < (done[best] ?? 0)) best = id;
  }
  return best;
}

/**
 * The move an event shows the player has just done, or null. `controlled` is the skater he was
 * controlling before the step the event came from, so a teammate's move does not count as his.
 * (A give and go has no event: the scene counts it when `world.human.giveGo` comes on. Nor has a switch:
 * the scene counts one when the skater he controls changes with the button down.)
 */
export function hintDone(e: SimEvent, controlled: number): HintId | null {
  switch (e.type) {
    case 'shot':
      return e.player !== controlled ? null : e.oneTimer ? 'oneTimer' : 'shoot';
    case 'fake':
      return e.player === controlled ? 'fake' : null;
    case 'block':
      return e.player === controlled ? 'block' : null;
    case 'deke':
      return e.player === controlled ? 'deke' : null;
    case 'pass':
      return e.player !== controlled ? null : e.saucer ? 'saucer' : e.target !== null ? 'pass' : null;
    case 'check':
      return e.player !== controlled ? null : e.kind === 'body' ? 'bodyCheck' : 'poke';
    default:
      return null;
  }
}

export const HINT_TIMING = { minSeconds: data.minSeconds, gapSeconds: data.gapSeconds, retireAfter: data.retireAfter };

/** Words for a move of the person's that came to nothing, and why: a check from too far or from behind, a one-timer let go late. */
export const FAIL_WORDS = data.fail;

/**
 * Watches for a shot that would have been a one-timer had shoot been held sooner: a pass taken, then a plain
 * shot by the same skater within a moment. Kept by the scene, one for each game.
 */
export class FailWatch {
  private took = new Map<number, number>();

  /** The words to raise for this batch of events, each with the player they rise from. `seconds` is the game's own time. */
  note(events: readonly SimEvent[], controlled: number, seconds: number): { text: string; player: number }[] {
    const out: { text: string; player: number }[] = [];
    for (const e of events) {
      if (e.type === 'pickup') {
        if (e.pass) this.took.set(e.player, seconds);
        else this.took.delete(e.player);
      } else if (e.type === 'shot') {
        const at = this.took.get(e.player);
        this.took.delete(e.player);
        if (e.player === controlled && !e.oneTimer && at !== undefined && seconds - at <= data.lateSeconds) out.push({ text: FAIL_WORDS.late, player: e.player });
      } else if (e.type === 'whiff') {
        if (e.player === controlled && e.metres <= data.whiffNear) out.push({ text: e.turned ? FAIL_WORDS.turned : FAIL_WORDS.far, player: e.player });
      } else if (e.type === 'check' && e.player === controlled && !e.success && e.miss) {
        out.push({ text: e.miss === 'far' ? FAIL_WORDS.far : FAIL_WORDS.behind, player: e.player });
      }
    }
    return out;
  }
}
