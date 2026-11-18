import { createRng } from '../../src/core/rng';
import { OnlineGuest, OnlineHost, type HostMessage } from '../../src/sim/online';
import online from '../../src/data/online.json';
import { goalLineX } from '../../src/sim/rink';
import { packWorld } from '../../src/sim/snapshot';
import { cloneTuning, type Tuning } from '../../src/sim/tuning';
import { NO_INPUT, type InputFrame, type World } from '../../src/sim/types';
import { createGame, STEPS_PER_SECOND } from '../../src/sim/world';
import { createNaivePlayer } from './bot';
import { uniformTeam } from './harness';

/**
 * Step 0 of docs/ONLINE.md: a host and a guest in one process, joined by a wire that is not there.
 * Each message is held for the lag (and a little more, at random) and some are lost. Nothing is drawn.
 */

export interface WireOptions {
  /** One way, in milliseconds: a round trip is twice this. */
  lagMs: number;
  /** Up to this much more, at random, on each message. */
  jitterMs?: number;
  /** The share of messages that never arrive. */
  loss?: number;
  /** Seconds of the game to play. */
  seconds?: number;
  seed?: string;
  /** Stands in for a phone whose arithmetic differs: this much, at random, is added to every position on the guest's copy each step. */
  disagree?: number;
  /** Nothing gets through either way between these two moments, in seconds: the line dropping for a while. */
  blackout?: [number, number];
}

export interface OnlineReport {
  seconds: number;
  /** Bytes a second each way. */
  downBytes: number;
  upBytes: number;
  /** How far the guest's picture was from what the host's game turned out to be at the same tick, in metres. */
  own: { mean: number; p95: number };
  /** The skater the host's person controls: the one the guest can only guess at. */
  rival: { mean: number; p95: number };
  /** Everybody else on the ice. */
  others: { mean: number; p95: number };
  puck: { mean: number; p95: number };
  /** Jumps a person would see when the host's word arrived (more than `JUMP` metres), per minute. */
  ownJumps: number;
  rivalJumps: number;
  otherJumps: number;
  /** How big the biggest jump of any skater was when a word arrived: the usual one, and the 95th in a hundred, in metres. What smoothing the drawing would have to hide. */
  jumpSize: { mean: number; p95: number };
  puckJumps: number;
  /** The share of frames in which the guest's picture had the score or the stage of the game wrong. */
  wrongScore: number;
  wrongPhase: number;
  /** Times the whole game was sent, and how many of those the guest asked for. */
  fulls: number;
  asked: number;
  /** How far ahead of the host's word the guest's picture ran, in milliseconds: without running ahead (way A) every move of his would be this late. */
  leadMs: number;
  /** The share of steps for which the guest's input had not reached the host in time. */
  lateInputs: number;
  /** Steps the guest ran again each second, and the milliseconds a second it spent on corrections on this machine. */
  rerunSteps: number;
  correctionMs: number;
  /** The worst the host's figures had to move the guest's own copy, in metres. */
  worstPatch: number;
  /** Whether the two ended with the same score and clock. */
  agreed: boolean;
}

/** A jump smaller than this is not counted: about half a skater's width. */
const JUMP = 0.3;

/** The script, for whichever seat: chases the puck, carries it at the other net and shoots, and throws a check now and then. */
function seatPlayer(t: Tuning, seat: 1 | 2): (world: World) => InputFrame {
  if (seat === 1) return createNaivePlayer(t);
  let shootSteps = 0;
  return (world: World): InputFrame => {
    const input: InputFrame = { ...NO_INPUT };
    if (world.phase === 'faceoff') {
      const f = world.faceoff;
      input.pass = f !== null && f.dropped && f.sinceDrop >= 0.25 && f.sinceDrop < 0.35;
      return input;
    }
    const human = world.human2;
    const me = human ? world.players[human.controlled] : undefined;
    if (!human || !me || world.phase !== 'play') return input;
    const side = human.team === 0 ? 1 : -1;
    const mine = world.puck.carrier === me.id;
    const targetX = mine ? side * goalLineX(t) : world.puck.pos.x;
    const targetY = mine ? (me.pos.y > 0 ? 1 : -1) * (t.net.mouthWidth / 2 - 0.3) : world.puck.pos.y;
    const dx = targetX - me.pos.x;
    const dy = targetY - me.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    input.moveX = dx / d;
    input.moveY = dy / d;
    input.sprint = !mine && d > 6;
    input.check = !mine && world.puck.carrier !== null && d < 2 && world.tick % 40 < 14;
    if (mine && Math.abs(side * goalLineX(t) - me.pos.x) < 10) {
      shootSteps += 1;
      input.shoot = shootSteps < 20;
      if (shootSteps >= 20) shootSteps = 0;
    } else shootSteps = 0;
    return input;
  };
}

interface Frame {
  xy: Float64Array;
  own: number;
  rival: number;
  onIce: boolean[];
  score: number;
  phase: string;
}

function frameOf(world: World): Frame {
  const xy = new Float64Array(world.players.length * 2 + 2);
  world.players.forEach((p, i) => {
    xy[i * 2] = p.pos.x;
    xy[i * 2 + 1] = p.pos.y;
  });
  xy[world.players.length * 2] = world.puck.pos.x;
  xy[world.players.length * 2 + 1] = world.puck.pos.y;
  return { xy, own: world.human2?.controlled ?? -1, rival: world.human?.controlled ?? -1, onIce: world.players.map((p) => p.onIce), score: world.score[0] * 100 + world.score[1], phase: world.phase };
}

const dist = (a: Float64Array, b: Float64Array, i: number): number => Math.hypot((a[i * 2] as number) - (b[i * 2] as number), (a[i * 2 + 1] as number) - (b[i * 2 + 1] as number));

function summary(values: number[]): { mean: number; p95: number } {
  if (values.length === 0) return { mean: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { mean: values.reduce((s, v) => s + v, 0) / values.length, p95: sorted[Math.floor(sorted.length * 0.95)] as number };
}

/** Plays a versus game across the made-up wire and says how it went. `second` 0 makes it co-op instead. */
export function measureOnline(options: WireOptions, second: 0 | 1 = 1): OnlineReport {
  const t = cloneTuning();
  const seed = options.seed ?? 'online';
  const rng = createRng(`${seed}/wire`);
  const drift = createRng(`${seed}/drift`);
  const steps = Math.round((options.seconds ?? 120) * STEPS_PER_SECOND);
  const world = createGame(t, seed, { teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5], second, overtimeLimit: 60 });
  const host = new OnlineHost(world, t);
  const guest = new OnlineGuest(packWorld(world), t);
  if (options.disagree) {
    const by = options.disagree;
    guest.disturb = (w) => {
      for (const p of w.players) {
        p.pos.x += drift.range(-by, by);
        p.pos.y += drift.range(-by, by);
      }
    };
  }
  const hostPlayer = seatPlayer(t, 1);
  const guestPlayer = seatPlayer(t, 2);

  const lagSteps = (): number => ((options.lagMs + rng.range(0, options.jitterMs ?? 0)) / 1000) * STEPS_PER_SECOND;
  let clock = 0;
  const lost = (): boolean => rng.chance(options.loss ?? 0) || (options.blackout !== undefined && clock >= options.blackout[0] * STEPS_PER_SECOND && clock < options.blackout[1] * STEPS_PER_SECOND);
  const down: { at: number; message: HostMessage }[] = [];
  const up: { at: number; data: Uint8Array }[] = [];
  let downBytes = 0;
  let upBytes = 0;

  const truth = new Map<number, Frame>();
  const shown = new Map<number, Frame>();
  const jumps = { own: 0, rival: 0, other: 0, puck: 0 };
  const sizes: number[] = [];
  let fulls = 0;
  let asked = 0;
  let late = 0;
  let hostSteps = 0;
  let lead = 0;
  let frames = 0;
  let rerun = 0;
  let spent = 0;
  let worstPatch = 0;
  let played = 0;

  for (let now = 0; now < steps && world.phase !== 'final'; now++) {
    played = now + 1;
    clock = now;
    // The host: take what has arrived, play a step, and send its word every few steps.
    for (let i = up.length - 1; i >= 0; i--) {
      if ((up[i] as { at: number }).at > now) continue;
      host.receive((up[i] as { data: Uint8Array }).data);
      up.splice(i, 1);
    }
    const tick = world.tick;
    const waiting = (host as unknown as { waiting: Map<number, InputFrame> }).waiting.has(tick);
    host.step(hostPlayer(world));
    if (world.tick !== tick) {
      hostSteps += 1;
      if (!waiting) late += 1;
      truth.set(world.tick, frameOf(world));
    }
    if (now % online.sendEverySteps === 0) {
      const wanted = guest.wantsFull;
      const message = host.message();
      const size = message.kind === 'full' ? JSON.stringify(message.world).length + 9 : message.data.length;
      downBytes += size;
      if (message.kind === 'full') {
        fulls += 1;
        if (wanted) asked += 1;
      }
      if (!lost()) down.push({ at: now + lagSteps(), message });
    }

    // The guest: take what has arrived, play a frame, and send its controls.
    down.sort((a, b) => a.at - b.at);
    while (down.length > 0 && (down[0] as { at: number }).at <= now) {
      const { message } = down.shift() as { message: HostMessage };
      const started = performance.now();
      const fix = guest.receive(message);
      spent += performance.now() - started;
      if (!fix) continue;
      rerun += fix.rerun;
      worstPatch = Math.max(worstPatch, fix.patched);
      if (fix.before && !fix.full) {
        const a = frameOf(fix.before);
        const b = frameOf(guest.predicted);
        const n = guest.predicted.players.length;
        let other = false;
        let biggest = 0;
        for (let i = 0; i < n; i++) {
          if (!b.onIce[i]) continue;
          biggest = Math.max(biggest, dist(a.xy, b.xy, i));
          if (dist(a.xy, b.xy, i) <= JUMP) continue;
          if (i === b.own) jumps.own += 1;
          else if (i === b.rival) jumps.rival += 1;
          else other = true;
        }
        sizes.push(biggest);
        if (other) jumps.other += 1;
        if (dist(a.xy, b.xy, n) > JUMP) jumps.puck += 1;
      }
    }
    guest.frame(guestPlayer(guest.predicted));
    if (!shown.has(guest.predicted.tick)) shown.set(guest.predicted.tick, frameOf(guest.predicted));
    lead += guest.predicted.tick - guest.confirmed.tick;
    frames += 1;
    const data = guest.outgoing();
    upBytes += data.length;
    if (!lost()) up.push({ at: now + lagSteps(), data });
  }

  const own: number[] = [];
  const rival: number[] = [];
  const others: number[] = [];
  const puck: number[] = [];
  let wrongScore = 0;
  let wrongPhase = 0;
  let compared = 0;
  for (const [tick, picture] of shown) {
    const real = truth.get(tick);
    if (!real) continue;
    compared += 1;
    if (real.score !== picture.score) wrongScore += 1;
    if (real.phase !== picture.phase) wrongPhase += 1;
    const n = real.onIce.length;
    for (let i = 0; i < n; i++) {
      if (!real.onIce[i] || !picture.onIce[i]) continue;
      (i === picture.own ? own : i === real.rival ? rival : others).push(dist(real.xy, picture.xy, i));
    }
    puck.push(dist(real.xy, picture.xy, n));
  }
  const seconds = played / STEPS_PER_SECOND;
  const minutes = seconds / 60;
  // Let the last words arrive, so the two can be compared at rest.
  for (const { message } of down) guest.receive(message);
  for (let i = 0; i < 3; i++) {
    host.receive(guest.outgoing());
    guest.receive(host.message());
  }
  return {
    seconds,
    downBytes: downBytes / seconds,
    upBytes: upBytes / seconds,
    own: summary(own),
    rival: summary(rival),
    others: summary(others),
    puck: summary(puck),
    ownJumps: jumps.own / minutes,
    rivalJumps: jumps.rival / minutes,
    otherJumps: jumps.other / minutes,
    jumpSize: summary(sizes),
    puckJumps: jumps.puck / minutes,
    wrongScore: compared ? wrongScore / compared : 0,
    wrongPhase: compared ? wrongPhase / compared : 0,
    fulls,
    asked,
    leadMs: (lead / Math.max(1, frames) / STEPS_PER_SECOND) * 1000,
    lateInputs: late / Math.max(1, hostSteps),
    rerunSteps: rerun / seconds,
    correctionMs: spent / seconds,
    worstPatch,
    agreed: guest.confirmed.tick === world.tick && guest.confirmed.score[0] === world.score[0] && guest.confirmed.score[1] === world.score[1] && guest.confirmed.clock === world.clock,
  };
}

const m = (v: number): string => v.toFixed(2);
const pair = (v: { mean: number; p95: number }): string => `${m(v.mean)} (${m(v.p95)})`;

/** The table for docs/TUNING.md. */
export function onlineLines(seconds = 180): string[] {
  const rows: [string, WireOptions][] = [
    ['no lag', { lagMs: 0 }],
    ['50 ms round trip', { lagMs: 25, jitterMs: 8, loss: 0.01 }],
    ['100 ms round trip', { lagMs: 50, jitterMs: 15, loss: 0.02 }],
    ['200 ms round trip', { lagMs: 100, jitterMs: 30, loss: 0.03 }],
    ['200 ms, 10% lost', { lagMs: 100, jitterMs: 30, loss: 0.1 }],
    ['100 ms, phones disagree', { lagMs: 50, jitterMs: 15, loss: 0.02, disagree: 1e-9 }],
    ['100 ms, disagree a lot', { lagMs: 50, jitterMs: 15, loss: 0.02, disagree: 1e-4 }],
    ['100 ms, line drops 2 s', { lagMs: 50, jitterMs: 15, loss: 0.02, blackout: [20, 22] }],
  ];
  const out = [`Two devices on a made-up wire: versus, the script in both seats, ${seconds} seconds each. Distances in metres: the usual, and (the 95th in a hundred).`];
  for (const [name, wire] of rows) {
    const r = measureOnline({ ...wire, seconds, seed: 'online-table' });
    out.push(`  ${name}`);
    out.push(`    picture against the truth: own skater ${pair(r.own)}, their skater ${pair(r.rival)}, the rest ${pair(r.others)}, puck ${pair(r.puck)}`);
    out.push(`    jumps over ${JUMP} m a minute: own ${r.ownJumps.toFixed(1)}, their skater ${r.rivalJumps.toFixed(1)}, anyone else ${r.otherJumps.toFixed(1)}, puck ${r.puckJumps.toFixed(1)}; biggest skater jump per word ${pair(r.jumpSize)}`);
    out.push(`    score wrong ${(r.wrongScore * 100).toFixed(2)}% of frames, stage wrong ${(r.wrongPhase * 100).toFixed(2)}%; guest inputs late ${(r.lateInputs * 100).toFixed(1)}%; picture ${Math.round(r.leadMs)} ms ahead of the host's word`);
    out.push(`    sent: ${(r.downBytes / 1000).toFixed(1)} KB/s down, ${(r.upBytes / 1000).toFixed(1)} up; whole game sent ${r.fulls} times (${r.asked} asked for); ${Math.round(r.rerunSteps)} steps a second run again, ${r.correctionMs.toFixed(1)} ms a second; ended agreed: ${r.agreed ? 'yes' : 'NO'}`);
  }
  return out;
}
