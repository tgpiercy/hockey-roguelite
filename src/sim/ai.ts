import data from '../data/ai.json';
import { checkKind } from './check';
import { STEP_SECONDS, STEPS_PER_SECOND } from './clock';
import { leadPoint } from './pass';
import { goalLineX } from './rink';
import { benchDoor } from './lines';
import { attackDir, availableSkaters, carrierOf, dist, distToSegment, goalieOf, otherTeam, ownNet, skatersOf, targetNet } from './team';
import type { Tuning } from './tuning';
import { NO_INPUT, type AiMemory, type AiState, type InputFrame, type Player, type Vec, type World } from './types';

const P = data.positions;

/** How sharp an AI team is, from 0 (easy) to 1 (hard). Changes thinking, never physics. */
export interface AiLevel {
  reactionSeconds: number;
  aimErrorDegrees: number;
  passAwareness: number;
  checkEagerness: number;
  shotCharge: number;
  shootRange: number;
  /** How long after a faceoff drop the centre goes for the puck. */
  faceoffSeconds: number;
  /** From how far out he will try a shot from distance, how readily each time he thinks, and how much he winds up. */
  longShotRange: number;
  longShotChance: number;
  longShotCharge: number;
}

export function aiLevel(level: number): AiLevel {
  const k = Math.max(0, Math.min(1, level));
  const at = (pair: number[]): number => (pair[0] as number) + ((pair[1] as number) - (pair[0] as number)) * k;
  const l = data.levels;
  return {
    reactionSeconds: at(l.reactionSeconds),
    aimErrorDegrees: at(l.aimErrorDegrees),
    passAwareness: at(l.passAwareness),
    checkEagerness: at(l.checkEagerness),
    shotCharge: at(l.shotCharge),
    shootRange: at(l.shootRange),
    faceoffSeconds: at(l.faceoffSeconds),
    longShotRange: at(l.longShotRange),
    longShotChance: at(l.longShotChance),
    longShotCharge: at(l.longShotCharge),
  };
}

export function createAiMemory(): AiMemory {
  return {
    state: 'support',
    thinkIn: 0,
    follow: 'point',
    targetX: 0,
    targetY: 0,
    sprint: false,
    shootSteps: 0,
    passSteps: 0,
    aimX: 1,
    aimY: 0,
    wantCheck: false,
    carryTime: 0,
    plant: false,
  };
}

/** This skater's place among his team's skaters (0, 1, 2...), spread evenly around zero: -1, 0, 1 for three. */
function spread(world: World, p: Player): number {
  const mates = skatersOf(world, p.team);
  return mates.findIndex((m) => m.id === p.id) - (mates.length - 1) / 2;
}

function nearestTo(players: Player[], point: Vec): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of players) {
    const d = dist(p.pos, point);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * The state machine: which of the five jobs this skater should be doing right now.
 *
 * - attack: he has the puck
 * - support: a teammate has it (or it is loose up ice and a teammate is nearer)
 * - chase: the puck is loose and he is his team's nearest skater, or a pass is coming to him
 * - backcheck: the other team has it and he is caught up ice of the puck
 * - defend: the other team has it and he is goal-side, or it is loose in his own half and a teammate is chasing
 */
export function chooseState(world: World, p: Player, _t: Tuning): AiState {
  const puck = world.puck;
  const carrier = carrierOf(world);
  const dir = attackDir(p.team);

  if (carrier) {
    if (carrier.id === p.id) return 'attack';
    if (carrier.team === p.team) return 'support';
    if (carrier.role === 'goalie') return 'defend';
    return dir * (p.pos.x - puck.pos.x) > P.backcheckMargin ? 'backcheck' : 'defend';
  }

  if (puck.passTarget === p.id) return 'chase';
  const mates = availableSkaters(world, p.team);
  const passedToMate = mates.some((m) => m.id === puck.passTarget);
  if (!passedToMate && nearestTo(mates, puck.pos)?.id === p.id) return 'chase';
  return dir * puck.pos.x < 0 ? 'defend' : 'support';
}

/** True if this spot is inside the zone `team` attacks: past the blue line at the far end. */
export function inZone(team: 0 | 1, x: number): boolean {
  return attackDir(team) * x > P.zoneLineX;
}

/** The three places an attacking team holds in the zone. */
export type Post = 'netFront' | 'wing' | 'point';

/**
 * Where a post is for `team`, given where the puck is: net-front in the slot, the wing out wide on the side
 * away from the puck (or on `wingSide` if given), the point just inside the blue line, shading toward the puck.
 */
export function postSpot(post: Post, team: 0 | 1, puck: Vec, t: Tuning, wingSide?: 1 | -1): Vec {
  const dir = attackDir(team);
  const net = targetNet(team, t);
  if (post === 'netFront') return { x: net.x - dir * P.netFrontDepth, y: 0 };
  if (post === 'wing') return { x: net.x - dir * P.wingDepth, y: (wingSide ?? (puck.y > 0 ? -1 : 1)) * P.wingY };
  return { x: dir * (P.zoneLineX + P.pointInset), y: puck.y * P.pointFollowY };
}

/**
 * Which posts the two skaters without the puck take in the zone. A carrier out wide is the wing himself, so
 * the others go net-front and to the point; a carrier in the middle leaves the wing and the point.
 * The point goes to a defenceman if exactly one helper is one, otherwise to whoever is furthest back.
 */
export function postsFor(team: 0 | 1, carrier: Vec, helpers: readonly Player[]): Map<number, Post> {
  const out = new Map<number, Post>();
  const front: Post = Math.abs(carrier.y) > P.wideY ? 'netFront' : 'wing';
  const [a, b] = helpers;
  if (!a) return out;
  if (!b) {
    out.set(a.id, front);
    return out;
  }
  const dir = attackDir(team);
  const aIsD = a.position === 'D';
  const bIsD = b.position === 'D';
  const back = aIsD !== bIsD ? (aIsD ? a : b) : dir * a.pos.x < dir * b.pos.x || (a.pos.x === b.pos.x && a.id < b.id) ? a : b;
  out.set(back.id, 'point');
  out.set(back.id === a.id ? b.id : a.id, front);
  return out;
}

/** True if no opposing skater stands near the straight line from a to b. */
export function laneClear(world: World, team: 0 | 1, a: Vec, b: Vec): boolean {
  return skatersOf(world, otherTeam(team)).every((o) => distToSegment(o.pos, a, b) > P.laneClearance);
}

function aimAt(m: AiMemory, from: Vec, to: Vec, errorDegrees: number, world: World): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x) + (world.rng.range(-1, 1) * errorDegrees * Math.PI) / 180;
  m.aimX = Math.cos(angle);
  m.aimY = Math.sin(angle);
}

function goTo(m: AiMemory, x: number, y: number, sprint = false): void {
  m.follow = 'point';
  m.targetX = x;
  m.targetY = y;
  m.sprint = sprint;
}

function planAttack(world: World, p: Player, t: Tuning, lv: AiLevel): void {
  const m = p.ai;
  const dir = attackDir(p.team);
  const net = targetNet(p.team, t);
  const puck = world.puck.pos;
  const opponents = skatersOf(world, otherTeam(p.team));
  const mates = availableSkaters(world, p.team).filter((s) => s.id !== p.id);
  const nearestOpp = nearestTo(opponents, p.pos);
  const pressured = nearestOpp !== null && dist(nearestOpp.pos, p.pos) < P.pressureRadius;
  const range = dist(puck, net);
  const inFront = dir * (net.x - puck.x) > 1;
  m.plant = false;

  // Shoot: in range, in front of the net, with a clear look (or after holding it too long).
  if (inFront && range <= lv.shootRange) {
    const goalie = goalieOf(world, otherTeam(p.team));
    const side = goalie ? (goalie.pos.y > 0 ? -1 : 1) : world.rng.chance(0.5) ? 1 : -1;
    const corner: Vec = { x: net.x, y: side * (t.net.mouthWidth / 2 - P.cornerInset) };
    if (laneClear(world, p.team, puck, corner) || m.carryTime > P.maxCarrySeconds) {
      aimAt(m, puck, corner, lv.aimErrorDegrees, world);
      const windUp = lv.shotCharge * world.rng.next() * t.shot.chargeTime;
      m.shootSteps = 2 + Math.round(windUp * STEPS_PER_SECOND);
      return;
    }
  }

  // A shot from distance: inside the zone, beyond normal range, with a clear lane. Not every look is taken.
  if (inFront && inZone(p.team, puck.x) && range > lv.shootRange && range <= lv.longShotRange && world.rng.chance(lv.longShotChance)) {
    const goalie = goalieOf(world, otherTeam(p.team));
    const side = goalie ? (goalie.pos.y > 0 ? -1 : 1) : world.rng.chance(0.5) ? 1 : -1;
    const corner: Vec = { x: net.x, y: side * (t.net.mouthWidth / 2 - P.cornerInset) };
    if (laneClear(world, p.team, puck, corner)) {
      aimAt(m, puck, corner, lv.aimErrorDegrees, world);
      m.shootSteps = 2 + Math.round(lv.longShotCharge * t.shot.chargeTime * STEPS_PER_SECOND);
      m.plant = true;
      return;
    }
  }

  // Pass: to an open teammate, if he is in a better spot or the carrier is under pressure.
  // Among open teammates, the one nearest the net is preferred.
  if (world.rng.chance(lv.passAwareness)) {
    const open = mates
      .filter((mate) => opponents.every((o) => dist(o.pos, mate.pos) > P.openRadius))
      .sort((x, y) => dist(x.pos, net) - dist(y.pos, net) || x.id - y.id);
    const mate = open[0];
    if (mate && (pressured || dist(mate.pos, net) + P.betterSpotMargin < range)) {
      const lead = leadPoint(puck, mate, t.pass.speed);
      const clear = laneClear(world, p.team, puck, lead);
      aimAt(m, puck, lead, 0, world);
      // Blocked lane: hold long enough for a saucer pass.
      m.passSteps = clear ? 2 : Math.ceil(t.pass.saucerHoldTime * STEPS_PER_SECOND) + 2;
      return;
    }
  }

  // Carry: head for the slot, swinging wide of a defender who is in the way. With a teammate already in
  // front of the net he holds up further out instead of crowding him, until he has held the puck too long.
  const front = postSpot('netFront', p.team, puck, t);
  const filled = mates.some((mate) => dist(mate.pos, front) < P.postFilledRadius);
  const holdUp = filled && inZone(p.team, puck.x) && m.carryTime <= P.maxCarrySeconds;
  const slotX = net.x - dir * (holdUp ? P.holdDepth : P.slotDistance);
  const halfWidth = holdUp ? P.wingY : P.slotHalfWidth;
  let y = Math.max(-halfWidth, Math.min(halfWidth, p.pos.y));
  if (nearestOpp && dist(nearestOpp.pos, p.pos) < P.avoidRadius && dir * (nearestOpp.pos.x - p.pos.x) > 0) {
    y += (p.pos.y >= nearestOpp.pos.y ? 1 : -1) * P.avoidShift;
  }
  goTo(m, slotX, y, range > lv.shootRange * 1.5);
}

function planSupport(world: World, p: Player, t: Tuning): void {
  const dir = attackDir(p.team);
  const carrier = carrierOf(world);

  // Own goalie has it: spread across the ice for the outlet pass.
  if (carrier && carrier.role === 'goalie') {
    goTo(p.ai, ownNet(p.team, t).x + dir * P.outletX, spread(world, p) * P.outletY);
    return;
  }
  const ref = carrier ? carrier.pos : world.puck.pos;
  // Forwards are first in line to go ahead; a defenceman takes the trailing spot.
  const helpers = availableSkaters(world, p.team)
    .filter((s) => s.id !== carrier?.id)
    .sort((a, b) => Number(a.position === 'D') - Number(b.position === 'D') || a.id - b.id);
  const maxX = goalLineX(t) - P.slotDistance * 0.5;
  const clampX = (x: number): number => Math.max(-maxX, Math.min(maxX, x));

  // In the attacking zone the team spreads out: net-front, a wing and the point, not a crowd at the crease.
  if (inZone(p.team, ref.x)) {
    const post = postsFor(p.team, ref, helpers).get(p.id);
    if (post) {
      const spot = postSpot(post, p.team, ref, t);
      goTo(p.ai, spot.x, spot.y);
      return;
    }
  }

  // The first helper goes ahead into the far lane; any other trails behind the play as the safety valve.
  if (helpers[0]?.id === p.id || helpers.length === 1) {
    const lane = Math.abs(ref.y) < 1 ? (p.pos.y >= 0 ? 1 : -1) : ref.y > 0 ? -1 : 1;
    goTo(p.ai, clampX(ref.x + dir * P.supportAhead), lane * P.supportLaneY);
    return;
  }
  goTo(p.ai, clampX(ref.x - dir * P.trailBehind), ref.y * 0.3);
}

function planDefend(world: World, p: Player, t: Tuning, lv: AiLevel): void {
  const m = p.ai;
  const dir = attackDir(p.team);
  const net = ownNet(p.team, t);
  const carrier = carrierOf(world);
  const mates = availableSkaters(world, p.team);
  const slot: Vec = { x: net.x + dir * P.defendSlotDepth, y: world.puck.pos.y * 0.3 + spread(world, p) * P.slotSpacing };

  // Their goalie has it: fall back to the neutral zone, spread across the ice.
  if (carrier && carrier.role === 'goalie') {
    goTo(m, -dir * P.retreatX, spread(world, p) * P.retreatY);
    return;
  }
  // Loose puck in our half and a teammate is on it: hold the slot.
  if (!carrier) {
    goTo(m, slot.x, slot.y);
    return;
  }
  // Nearest defender pressures the carrier.
  const presser = nearestTo(mates, carrier.pos);
  if (presser?.id === p.id) {
    m.follow = 'carrier';
    m.sprint = dist(p.pos, carrier.pos) > P.pressureRadius;
    m.wantCheck = world.rng.chance(lv.checkEagerness);
    return;
  }
  // The others each take a man, the most dangerous first going to the nearest free defender, from the goal side.
  const free = mates.filter((s) => s.id !== presser?.id);
  const threats = skatersOf(world, carrier.team)
    .filter((o) => o.id !== carrier.id)
    .sort((x, y) => dist(x.pos, net) - dist(y.pos, net) || x.id - y.id);
  for (const threat of threats) {
    const marker = nearestTo(free, threat.pos);
    if (!marker) break;
    if (marker.id === p.id) {
      goTo(m, threat.pos.x + (net.x - threat.pos.x) * P.coverGoalSide, threat.pos.y + (net.y - threat.pos.y) * P.coverGoalSide);
      return;
    }
    free.splice(free.indexOf(marker), 1);
  }
  goTo(m, slot.x, slot.y);
}

/** Reconsiders: picks the state and what to do in it. */
export function think(world: World, p: Player, t: Tuning, lv: AiLevel): void {
  const m = p.ai;
  m.state = chooseState(world, p, t);
  m.wantCheck = false;
  m.sprint = false;
  switch (m.state) {
    case 'attack':
      planAttack(world, p, t, lv);
      break;
    case 'support':
      planSupport(world, p, t);
      break;
    case 'chase':
      m.follow = 'puck';
      m.sprint = true;
      break;
    case 'backcheck': {
      const net = ownNet(p.team, t);
      goTo(m, net.x + attackDir(p.team) * P.defendSlotDepth, world.puck.pos.y * 0.5 + spread(world, p) * P.slotSpacing, true);
      break;
    }
    case 'defend':
      planDefend(world, p, t, lv);
      break;
  }
}

/** Where the skater is heading this step. Puck and carrier are tracked live; points are fixed until the next think. */
function steerTarget(world: World, p: Player): Vec {
  const m = p.ai;
  if (m.follow === 'puck') {
    const puck = world.puck;
    return { x: puck.pos.x + puck.vel.x * P.puckLeadSeconds, y: puck.pos.y + puck.vel.y * P.puckLeadSeconds };
  }
  if (m.follow === 'carrier') {
    const carrier = carrierOf(world);
    if (carrier) return carrier.pos;
  }
  return { x: m.targetX, y: m.targetY };
}

/** One step of AI for a skater: thinks when its reaction time is up, then produces controller-style input. */
export function aiInput(world: World, p: Player, t: Tuning, lv: AiLevel): InputFrame {
  const m = p.ai;
  const hasPuck = world.puck.carrier === p.id;
  const input: InputFrame = { ...NO_INPUT };

  // Line change: without the puck, just get to the bench door.
  if (p.leaving && !hasPuck) {
    const door = benchDoor(p.team, t);
    const dx = door.x - p.pos.x;
    const dy = door.y - p.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    input.moveX = dx / d;
    input.moveY = dy / d;
    m.shootSteps = 0;
    m.passSteps = 0;
    m.thinkIn = 0;
    return input;
  }

  m.carryTime = hasPuck && attackDir(p.team) * p.pos.x > 0 ? m.carryTime + STEP_SECONDS : 0;
  if (!hasPuck) {
    m.shootSteps = 0;
    m.passSteps = 0;
  }

  // A shot or pass in progress is carried through: hold the button, then let go while aiming.
  if (m.shootSteps > 0 || m.passSteps > 0) {
    // A planted shooter barely tilts the stick: enough to aim, not enough to skate.
    const tilt = m.shootSteps > 0 && m.plant ? P.plantTilt : 1;
    input.moveX = m.aimX * tilt;
    input.moveY = m.aimY * tilt;
    if (m.shootSteps > 0) {
      m.shootSteps -= 1;
      input.shoot = m.shootSteps > 0;
    } else {
      m.passSteps -= 1;
      input.pass = m.passSteps > 0;
    }
    return input;
  }

  m.thinkIn -= STEP_SECONDS;
  const stateNow = chooseState(world, p, t);
  if (m.thinkIn <= 0 || (stateNow !== m.state && (stateNow === 'attack' || stateNow === 'chase'))) {
    // Getting the puck, or it coming loose nearby, is reacted to at once; everything else waits for the next think.
    think(world, p, t, lv);
    m.thinkIn = lv.reactionSeconds;
    if (m.shootSteps > 0 || m.passSteps > 0) {
      const tilt = m.shootSteps > 0 && m.plant ? P.plantTilt : 1;
      input.moveX = m.aimX * tilt;
      input.moveY = m.aimY * tilt;
      input.shoot = m.shootSteps > 0;
      input.pass = m.passSteps > 0;
      return input;
    }
  }

  const target = steerTarget(world, p);
  const dx = target.x - p.pos.x;
  const dy = target.y - p.pos.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.05) {
    const tilt = Math.min(1, d / P.arriveRadius);
    input.moveX = (dx / d) * tilt;
    input.moveY = (dy / d) * tilt;
  }
  input.sprint = m.sprint && p.stamina > P.sprintStamina && !p.sprintLocked;

  if (m.wantCheck && p.checkCooldown <= 0) {
    const carrier = carrierOf(world);
    if (carrier && carrier.team !== p.team && carrier.role === 'skater' && checkKind(p, carrier, world, t)) {
      input.check = true;
    }
  }
  return input;
}
