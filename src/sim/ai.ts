import data from '../data/ai.json';
import { checkKind, closingSpeed } from './check';
import { STEP_SECONDS, STEPS_PER_SECOND } from './clock';
import { leadPoint } from './pass';
import { goalLineX } from './rink';
import { benchDoor } from './lines';
import { attackDir, availableSkaters, carrierOf, dist, distToSegment, goalieOf, otherTeam, ownNet, skatersOf, targetNet, humansOn, humanOf } from './team';
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
  /** How readily, each time he thinks, he dekes a defender who is on him. */
  dekeChance: number;
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
    dekeChance: at(l.dekeChance),
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
    wantDeke: false,
    checkSteps: 0,
    passTo: null,
    plant: false,
  };
}

/** How a team's AI likes to attack: multipliers on how readily it passes and shoots from distance, and how readily it dumps the puck in. */
export interface Style {
  name: string;
  describe: string;
  pass: number;
  longShot: number;
  dump: number;
}

const NO_STYLE: Style = { name: '', describe: '', pass: 1, longShot: 1, dump: 0 };

/** The style a team's AI skaters play, or no leaning at all. */
export function styleOf(world: World, team: 0 | 1): Style {
  // A team told how to attack plays that way, whatever its own leaning.
  const attack = world.teams[team].tactics?.attack;
  if (attack === 'crash') return data.tactics.crashStyle as Style;
  if (attack === 'cycle') return data.tactics.cycleStyle as Style;
  if (attack === 'rush') return (data.styles as Record<string, Style>).rush ?? NO_STYLE;
  const id = world.teams[team].style;
  return (id !== null ? (data.styles as Record<string, Style>)[id] : undefined) ?? NO_STYLE;
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
  // In front of the net, at the post away from the puck: the back door for a one-timer.
  if (post === 'netFront') return { x: net.x - dir * P.netFrontDepth, y: Math.abs(puck.y) > 1 ? (puck.y > 0 ? -1 : 1) * P.farPostY : 0 };
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
  const style = styleOf(world, p.team);
  m.plant = false;
  m.passTo = null;
  // A defender on him and able to check: sometimes he dekes.
  m.wantDeke = pressured && p.dekeCooldown <= 0 && p.stamina >= t.deke.staminaCost && nearestOpp.checkCooldown <= 0 && world.rng.chance(lv.dekeChance);

  // An empty net: shoot from anywhere up the ice with a clear line to it.
  if (inFront && dir * puck.x > 0 && range <= P.emptyNetRange && goalieOf(world, otherTeam(p.team)) === null && laneClear(world, p.team, puck, net)) {
    aimAt(m, puck, net, lv.aimErrorDegrees, world);
    m.shootSteps = 2;
    return;
  }

  // Shoot: in range, in front of the net, with a clear look (or after holding it too long).
  if (inFront && range <= lv.shootRange) {
    const goalie = goalieOf(world, otherTeam(p.team));
    const side = goalie ? (goalie.pos.y > 0 ? -1 : 1) : world.rng.chance(0.5) ? 1 : -1;
    const corner: Vec = { x: net.x, y: side * (t.net.mouthWidth / 2 - P.cornerInset) };
    if (laneClear(world, p.team, puck, corner) || m.carryTime > P.maxCarrySeconds) {
      aimAt(m, puck, corner, lv.aimErrorDegrees, world);
      // A pass just received is fired first-touch: it counts as fully wound up anyway.
      // The marksman always winds up fully: that is the shot that cannot be saved.
      const windUp = p.oneTimer > 0 ? 0 : p.fx.unstoppableCharged > 0 ? t.shot.chargeTime + 0.05 : lv.shotCharge * world.rng.next() * t.shot.chargeTime;
      m.shootSteps = 2 + Math.round(windUp * STEPS_PER_SECOND);
      return;
    }
  }

  // A shot from distance: inside the zone, beyond normal range, with a clear lane. Not every look is taken.
  if (inFront && inZone(p.team, puck.x) && range > lv.shootRange && range <= lv.longShotRange && world.rng.chance(Math.min(1, lv.longShotChance * style.longShot))) {
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
  // Give and go: the human passed to him and asked for it back, so he returns it as soon as the lane is clear.
  const go = humansOn(world, p.team).map((h) => h.giveGo).find((g) => g !== null && g.receiver === p.id) ?? null;
  if (go && go.receiver === p.id) {
    const passer = world.players[go.passer];
    if (passer && passer.onIce) {
      const lead = leadPoint(puck, passer, t.pass.speed);
      if (laneClear(world, p.team, puck, lead)) {
        aimAt(m, puck, lead, 0, world);
        m.passSteps = 2;
        m.passTo = passer.id;
        return;
      }
    }
  }

  // Dump and chase: under pressure short of the zone, he fires it into the far corner and his team goes after it.
  if (style.dump > 0 && pressured && !inZone(p.team, puck.x) && dir * puck.x > P.dumpFromX && world.rng.chance(style.dump)) {
    const side = nearestOpp.pos.y > p.pos.y ? -1 : 1;
    aimAt(m, puck, { x: net.x, y: side * (t.rink.width / 2 - P.dumpCornerInset) }, 0, world);
    m.shootSteps = 2;
    return;
  }

  if (world.rng.chance(Math.min(1, lv.passAwareness * style.pass))) {
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

  // When a person carries it up the ice, his first helper does not wait for the zone: he goes to the front of
  // the net at once, hard, to be there for the rebound or the one-timer. (Crash sends both; the other tactics have their own ideas.)
  const attack = world.teams[p.team].tactics?.attack ?? 'balanced';
  if (carrier && attack === 'balanced' && humanOf(world, carrier.id) !== null && helpers[0]?.id === p.id && dir * ref.x > P.netRunFromX) {
    const front = postSpot('netFront', p.team, ref, t);
    goTo(p.ai, front.x, front.y, !inZone(p.team, p.pos.x));
    return;
  }

  // In the attacking zone the team spreads out: net-front, a wing and the point, not a crowd at the crease.
  if (inZone(p.team, ref.x)) {
    const post = postsFor(p.team, ref, helpers).get(p.id);
    if (post) {
      // Crash the net: both helpers go to the front of it, one at each post; nobody takes the point.
      const crash = world.teams[p.team].tactics?.attack === 'crash';
      let spot = postSpot(crash ? 'netFront' : post, p.team, ref, t);
      if (crash && helpers[1]?.id === p.id) spot = { x: spot.x, y: spot.y === 0 ? P.farPostY : -spot.y };
      // Get open: if a defender is on the spot, or stands in the lane from the puck, slide to one side where the pass is on.
      const opponents = skatersOf(world, otherTeam(p.team));
      const covered = (s: Vec): boolean => !laneClear(world, p.team, ref, s) || opponents.some((o) => dist(o.pos, s) < P.openRadius);
      if (covered(spot)) {
        const limit = t.rink.width / 2 - 1.5;
        for (const shift of [P.getOpenShift, -P.getOpenShift]) {
          const alt = { x: spot.x, y: Math.max(-limit, Math.min(limit, spot.y + shift)) };
          if (!covered(alt)) {
            spot = alt;
            break;
          }
        }
      }
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
  // A carrier close in front of the net is the danger: the presser comes hard and checks more readily.
  const danger = dist(carrier.pos, net) < P.slotDangerRadius;
  if (presser?.id === p.id) {
    m.follow = 'carrier';
    m.sprint = danger || dist(p.pos, carrier.pos) > P.pressureRadius;
    m.wantCheck = world.rng.chance(Math.min(1, lv.checkEagerness * (danger ? P.slotCheckBoost : 1)));
    // Man-to-man: the man on the puck never lets him settle.
    if (world.teams[p.team].tactics?.defence === 'man') {
      m.sprint = true;
      m.wantCheck = world.rng.chance(Math.max(lv.checkEagerness, data.tactics.manCheck));
    }
    return;
  }
  // The skater a person controls is always the nearest to the puck, so on a person's team the nearest man is
  // the person. He cannot be counted on to be there: once the carrier is over centre and the person is not
  // right on him, the nearest AI team-mate goes to the carrier as well, exactly as a presser would.
  let second: Player | null = null;
  // On a person's team, with the carrier over the line set for it, the man furthest back holds the lane to the net
  // first (he is chosen below, before anyone goes to the carrier): a rush should meet somebody.
  const guardEarly = humansOn(world, p.team).length > 0 && dir * carrier.pos.x < P.guardFromX;
  const defence = world.teams[p.team].tactics?.defence ?? 'balanced';
  const away = dist(carrier.pos, net) || 1;
  const k = Math.min(P.guardDepth, away * 0.6) / away;
  const guardSpot: Vec = { x: net.x + (carrier.pos.x - net.x) * k, y: net.y + (carrier.pos.y - net.y) * k };
  const lastMan = guardEarly && defence !== 'man' ? nearestTo(mates.filter((s) => s.id !== presser?.id), guardSpot) : null;
  if (lastMan?.id === p.id) {
    goTo(m, guardSpot.x, guardSpot.y, dist(p.pos, guardSpot) > P.pressureRadius);
    m.wantCheck = world.rng.chance(lv.checkEagerness);
    return;
  }
  if (presser && humanOf(world, presser.id) !== null && dir * carrier.pos.x < P.matePressFromX && dist(presser.pos, carrier.pos) > P.matePressGap) {
    second = nearestTo(mates.filter((s) => s.id !== presser.id && s.id !== lastMan?.id), carrier.pos);
    if (second?.id === p.id) {
      m.follow = 'carrier';
      m.sprint = danger || dist(p.pos, carrier.pos) > P.pressureRadius;
      m.wantCheck = world.rng.chance(Math.min(1, lv.checkEagerness * (danger ? P.slotCheckBoost : 1)));
      return;
    }
  }
  const free = mates.filter((s) => s.id !== presser?.id && s.id !== second?.id && s.id !== lastMan?.id);
  // Collapse: everyone but the presser packs the slot in front of the net.
  if (defence === 'collapse' && inZone(carrier.team, carrier.pos.x)) {
    goTo(m, slot.x, slot.y);
    m.wantCheck = world.rng.chance(lv.checkEagerness);
    return;
  }
  // With the puck in our zone, one of the others guards the slot: he stands between the carrier and the net.
  // (Man-to-man leaves the slot unguarded: everyone takes a man.)
  if (inZone(carrier.team, carrier.pos.x) && defence !== 'man' && !lastMan) {
    const spot = guardSpot;
    const guard = nearestTo(free, spot);
    if (guard?.id === p.id) {
      goTo(m, spot.x, spot.y);
      m.wantCheck = world.rng.chance(lv.checkEagerness);
      return;
    }
    if (guard) free.splice(free.indexOf(guard), 1);
  }
  // The others each take a man, the most dangerous first going to the nearest free defender, from the goal side.
  const threats = skatersOf(world, carrier.team)
    .filter((o) => o.id !== carrier.id)
    .sort((x, y) => dist(x.pos, net) - dist(y.pos, net) || x.id - y.id);
  for (const threat of threats) {
    const marker = nearestTo(free, threat.pos);
    if (!marker) break;
    if (marker.id === p.id) {
      // Man-to-man stands tight on his man, in the passing lane; otherwise a step back toward the net.
      const side = defence === 'man' ? data.tactics.manCoverGoalSide : P.coverGoalSide;
      goTo(m, threat.pos.x + (net.x - threat.pos.x) * side, threat.pos.y + (net.y - threat.pos.y) * side);
      return;
    }
    free.splice(free.indexOf(marker), 1);
  }
  goTo(m, slot.x, slot.y);
}

/** Reconsiders: picks the state and what to do in it. */
export function think(world: World, p: Player, t: Tuning, level: AiLevel): void {
  // The AI skaters on a team a person plays on go for the check more readily: the person cannot be everywhere.
  const lv = humansOn(world, p.team).length > 0 ? { ...level, checkEagerness: Math.min(1, level.checkEagerness * data.mateCheckBoost) } : level;
  const m = p.ai;
  m.state = chooseState(world, p, t);
  m.wantCheck = false;
  m.sprint = false;
  // A boss trick, the full press: with the other team carrying in its own end, he goes straight for the carrier.
  const pressed = carrierOf(world);
  if (p.fx.fullPress > 0 && pressed && pressed.team !== p.team && pressed.role === 'skater' && attackDir(p.team) * pressed.pos.x > 0 && (m.state === 'defend' || m.state === 'backcheck')) {
    m.follow = 'carrier';
    m.sprint = true;
    m.wantCheck = world.rng.chance(lv.checkEagerness);
    return;
  }
  // Forecheck, as the team is told: with the other team carrying in its own end, they may sit back at the blue line.
  const forecheck = world.teams[p.team].tactics?.forecheck ?? 'balanced';
  if (forecheck === 'sit' && pressed && pressed.team !== p.team && pressed.role === 'skater' && attackDir(p.team) * pressed.pos.x > 0 && (m.state === 'defend' || m.state === 'backcheck')) {
    goTo(m, -attackDir(p.team) * P.zoneLineX, spread(world, p) * P.retreatY);
    return;
  }
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
  if (m.wantDeke && hasPuck) {
    input.switchPlayer = true;
    m.wantDeke = false;
  }

  // Checking: the button is held for a planned number of steps and let go on the last, which throws it.
  if (m.checkSteps > 0) {
    m.checkSteps -= 1;
    input.check = m.checkSteps > 0;
  } else if (m.wantCheck && p.checkCooldown <= 0) {
    const carrier = carrierOf(world);
    if (carrier && carrier.team !== p.team && carrier.role === 'skater') {
      // Closing on him: wind up a body check, starting early enough that the button comes up just as he gets there.
      const closing = closingSpeed(p, carrier);
      const holdSteps = Math.ceil(t.check.bodyHoldSeconds * STEPS_PER_SECOND) + 1;
      const reach = t.check.bodyRange * P.bodyCheckAim + closing * (holdSteps / STEPS_PER_SECOND);
      if (closing >= t.check.minClosingSpeed && dist(p.pos, carrier.pos) <= reach) {
        m.checkSteps = holdSteps;
        input.check = true;
      } else if (checkKind(p, carrier, world, t, false) === 'poke') {
        // A tap: down this step, up the next.
        m.checkSteps = 1;
        input.check = true;
      }
    }
  }
  return input;
}
