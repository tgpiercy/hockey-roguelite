import online from '../data/online.json';
import { packWorld, unpackWorld, type PackedWorld } from './snapshot';
import type { Tuning } from './tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from './types';
import { step } from './world';

/**
 * Two devices in one game (docs/ONLINE.md, way B). Nothing here knows what carries the messages.
 *
 * The host runs the game and its word is final. The guest keeps two worlds: `confirmed`, which follows
 * the host's by running the same steps with the inputs the host says it used, and `predicted`, which is
 * `confirmed` run on ahead with the guest's own controls, so his skater moves at once. Each word from
 * the host moves `confirmed` on and `predicted` is made again from it.
 *
 * Two phones may not agree on the arithmetic to the last digit, so each word also carries where every
 * player and the puck are, written over the guest's own figures, and a few facts that cannot be a little
 * wrong (the random generator, the score, who has the puck). If those differ the guest asks for the
 * whole game again.
 *
 * "The input for tick n" is the one used by the step that takes the world's tick from n to n + 1.
 */

const BUTTONS = ['sprint', 'shoot', 'pass', 'check', 'switchPlayer', 'lineChange', 'powerupA', 'powerupB'] as const;
/** Bytes one input takes on the wire. */
export const INPUT_BYTES = 4;
const PHASES = ['play', 'goal', 'faceoff', 'break', 'final'] as const;

function writeInput(view: DataView, at: number, f: InputFrame): void {
  const stick = (v: number): number => Math.max(-127, Math.min(127, Math.round(v * 127)));
  let bits = 0;
  BUTTONS.forEach((name, i) => {
    if (f[name]) bits |= 1 << i;
  });
  view.setInt8(at, stick(f.moveX));
  view.setInt8(at + 1, stick(f.moveY));
  view.setUint8(at + 2, bits);
  view.setUint8(at + 3, f.pullGoalie ? 1 : 0);
}

function readInput(view: DataView, at: number): InputFrame {
  const bits = view.getUint8(at + 2);
  const f: InputFrame = { ...NO_INPUT, moveX: view.getInt8(at) / 127, moveY: view.getInt8(at + 1) / 127, pullGoalie: view.getUint8(at + 3) === 1 };
  BUTTONS.forEach((name, i) => {
    f[name] = (bits & (1 << i)) !== 0;
  });
  return f;
}

/** An input as it comes out of the wire: the stick in 127 steps each way. Both sides step with this, never with the raw one. */
export function wireInput(f: InputFrame): InputFrame {
  const view = new DataView(new ArrayBuffer(INPUT_BYTES));
  writeInput(view, 0, f);
  return readInput(view, 0);
}

/** A copy of a world that shares nothing with it, made the way the wire would carry it: as text. */
export function throughText(world: World): World {
  return unpackWorld(JSON.parse(JSON.stringify(packWorld(world))) as PackedWorld);
}

/** What the host sends: the usual short word, or the whole game. */
export type HostMessage = { kind: 'delta'; data: Uint8Array } | { kind: 'full'; tick: number; guestLatest: number; world: PackedWorld };

/** The facts that cannot be a little wrong. */
function facts(world: World): number[] {
  return [...world.rng.state(), world.score[0], world.score[1], PHASES.indexOf(world.phase), world.period, world.puck.carrier ?? -1, world.human?.controlled ?? -1, world.human2?.controlled ?? -1];
}

const FACTS = 11;
const PLAYER_BYTES = 1 + 5 * 8;

export class OnlineHost {
  private readonly waiting = new Map<number, InputFrame>();
  private lastGuest: InputFrame = NO_INPUT;
  private lastGuestTick = -1;
  /** The newest tick the guest's input has been received for. */
  private guestLatest = -1;
  private readonly used: { tick: number; host: InputFrame; guest: InputFrame }[] = [];
  private sendFull = false;
  private askServed = 0;

  constructor(
    readonly world: World,
    private readonly t: Tuning,
  ) {}

  /** The guest's controls arriving: flags, which asking this is, the newest tick, how many, then the inputs, oldest first. */
  receive(data: Uint8Array): void {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const ask = view.getUint8(1);
    if ((view.getUint8(0) & 1) === 1 && ask !== this.askServed) {
      this.askServed = ask;
      this.sendFull = true;
    }
    const newest = view.getUint32(2, true);
    const count = view.getUint8(6);
    for (let i = 0; i < count; i++) {
      const tick = newest - count + 1 + i;
      const input = readInput(view, 7 + i * INPUT_BYTES);
      if (tick > this.guestLatest) this.guestLatest = tick;
      if (tick >= this.world.tick) this.waiting.set(tick, input);
      else if (tick > this.lastGuestTick) {
        // Too late for its own step, but it is still the newest thing he is known to have asked for.
        this.lastGuest = input;
        this.lastGuestTick = tick;
      }
    }
  }

  /** One step of the game. The guest's input for this tick is used if it has come; if not, his last one stands. */
  step(input: InputFrame): SimEvent[] {
    const world = this.world;
    const tick = world.tick;
    const mine = wireInput(input);
    const his = this.waiting.get(tick);
    if (his) {
      this.lastGuest = his;
      this.lastGuestTick = tick;
      this.waiting.delete(tick);
    }
    const before = world.phase;
    const events = step(world, mine, this.t, this.lastGuest);
    if (world.tick === tick) return events;
    this.used.push({ tick, host: mine, guest: this.lastGuest });
    if (this.used.length > online.hostInputsSent) this.used.shift();
    // A faceoff is a pause anyway: the whole game is sent then, in case the two have come apart unnoticed.
    if (world.phase === 'faceoff' && before !== 'faceoff') this.sendFull = true;
    return events;
  }

  /** The word to send now. */
  message(): HostMessage {
    const world = this.world;
    if (this.sendFull) {
      this.sendFull = false;
      return { kind: 'full', tick: world.tick, guestLatest: this.guestLatest, world: JSON.parse(JSON.stringify(packWorld(world))) as PackedWorld };
    }
    const n = this.used.length;
    const size = 10 + n * 2 * INPUT_BYTES + FACTS * 4 + 1 + world.players.length * PLAYER_BYTES + 4 * 8;
    const data = new Uint8Array(size);
    const view = new DataView(data.buffer);
    let at = 0;
    view.setUint8(at, 1);
    view.setUint32(at + 1, world.tick, true);
    view.setInt32(at + 5, this.guestLatest, true);
    view.setUint8(at + 9, n);
    at += 10;
    for (const u of this.used) {
      writeInput(view, at, u.host);
      writeInput(view, at + INPUT_BYTES, u.guest);
      at += 2 * INPUT_BYTES;
    }
    for (const f of facts(world)) {
      view.setInt32(at, f | 0, true);
      at += 4;
    }
    view.setUint8(at, world.players.length);
    at += 1;
    for (const p of world.players) {
      view.setUint8(at, p.onIce ? 1 : 0);
      for (const [i, v] of [p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.facing].entries()) view.setFloat64(at + 1 + i * 8, v, true);
      at += PLAYER_BYTES;
    }
    for (const [i, v] of [world.puck.pos.x, world.puck.pos.y, world.puck.vel.x, world.puck.vel.y].entries()) view.setFloat64(at + i * 8, v, true);
    return { kind: 'delta', data };
  }
}

/** What a word from the host did to the guest's picture. */
export interface Correction {
  /** The whole game was taken, not a short word. */
  full: boolean;
  /** Steps run again to bring the picture back up to now. */
  rerun: number;
  /** How far the host's figures moved the guest's own copy of the game, in metres at the worst player (0 when the two agreed). */
  patched: number;
  /** The picture's tick was moved, to keep the right lead over the host. */
  moved: number;
  /** The picture before, when it was for the same tick as the picture after: what the person sees jump. */
  before: World | null;
}

export class OnlineGuest {
  /** The host's game, as far as its word has come. */
  confirmed: World;
  /** The picture: `confirmed` run ahead on the guest's own controls. */
  predicted: World;
  private readonly own = new Map<number, InputFrame>();
  private lastOwn: InputFrame = NO_INPUT;
  private hostGuess: InputFrame = NO_INPUT;
  private asking = false;
  private ask = 0;
  private askedAt = 0;
  private wait = 0;
  private adjustedAt = -1;
  /** For measuring only: called on the guest's copy after each of its steps, to stand in for a phone whose arithmetic differs. */
  disturb: ((world: World) => void) | null = null;

  constructor(
    start: PackedWorld,
    private readonly t: Tuning,
  ) {
    this.confirmed = unpackWorld(JSON.parse(JSON.stringify(start)) as PackedWorld);
    this.predicted = throughText(this.confirmed);
  }

  /** One frame of the guest's game: usually one step, none while it is letting the host catch up. */
  frame(input: InputFrame): SimEvent[] {
    if (this.wait > 0) {
      this.wait -= 1;
      return [];
    }
    const tick = this.predicted.tick;
    const mine = wireInput(input);
    this.own.set(tick, mine);
    this.lastOwn = mine;
    return step(this.predicted, this.hostGuess, this.t, mine);
  }

  /** The guest's controls for the last few ticks, to send every frame: sent several times over, so a lost one costs nothing. */
  outgoing(): Uint8Array {
    const newest = this.predicted.tick - 1;
    const ticks: number[] = [];
    for (let tick = Math.max(0, newest - online.guestInputsSent + 1); tick <= newest; tick++) if (this.own.has(tick)) ticks.push(tick);
    // Only an unbroken run ending at the newest can be sent: the ticks are not written, only the last of them.
    while (ticks.length > 1 && ticks.some((tick, i) => i > 0 && tick !== (ticks[i - 1] as number) + 1)) ticks.shift();
    const data = new Uint8Array(7 + ticks.length * INPUT_BYTES);
    const view = new DataView(data.buffer);
    if (this.asking && this.predicted.tick - this.askedAt >= online.askAgainSteps) this.askAgain();
    view.setUint8(0, this.asking ? 1 : 0);
    view.setUint8(1, this.ask);
    view.setUint32(2, Math.max(0, newest), true);
    view.setUint8(6, newest < 0 ? 0 : ticks.length);
    ticks.forEach((tick, i) => writeInput(view, 7 + i * INPUT_BYTES, this.own.get(tick) as InputFrame));
    return data;
  }

  private askAgain(): void {
    this.asking = true;
    this.ask = (this.ask % 255) + 1;
    this.askedAt = this.predicted.tick;
  }

  /** True while the guest is waiting for the whole game to be sent again. */
  get wantsFull(): boolean {
    return this.asking;
  }

  /** A word from the host. Returns what it did, or null if it was old news or could not be used. */
  receive(message: HostMessage): Correction | null {
    const was = this.predicted;
    let patched = 0;
    let guestLatest: number;
    let hostTick: number;
    if (message.kind === 'full') {
      if (message.tick < this.confirmed.tick) return null;
      this.confirmed = unpackWorld(JSON.parse(JSON.stringify(message.world)) as PackedWorld);
      this.asking = false;
      guestLatest = message.guestLatest;
      hostTick = message.tick;
    } else {
      const view = new DataView(message.data.buffer, message.data.byteOffset, message.data.byteLength);
      hostTick = view.getUint32(1, true);
      guestLatest = view.getInt32(5, true);
      const n = view.getUint8(9);
      if (hostTick <= this.confirmed.tick) return null;
      const first = hostTick - n;
      if (this.confirmed.tick < first) {
        // Words were lost and the inputs between are gone: only the whole game will do.
        if (!this.asking) this.askAgain();
        return null;
      }
      let at = 10;
      for (let tick = first; tick < hostTick; tick++, at += 2 * INPUT_BYTES) {
        if (tick < this.confirmed.tick) continue;
        const host = readInput(view, at);
        step(this.confirmed, host, this.t, readInput(view, at + INPUT_BYTES));
        this.disturb?.(this.confirmed);
        this.hostGuess = host;
      }
      const mine = facts(this.confirmed);
      let same = this.confirmed.tick === hostTick;
      for (let i = 0; i < FACTS; i++, at += 4) if (view.getInt32(at, true) !== ((mine[i] as number) | 0)) same = false;
      if (!same && !this.asking) this.askAgain();
      const players = view.getUint8(at);
      at += 1;
      for (let i = 0; i < players; i++, at += PLAYER_BYTES) {
        const p = this.confirmed.players[i];
        if (!p) continue;
        const x = view.getFloat64(at + 1, true);
        const y = view.getFloat64(at + 9, true);
        patched = Math.max(patched, Math.hypot(x - p.pos.x, y - p.pos.y));
        p.pos.x = x;
        p.pos.y = y;
        p.vel.x = view.getFloat64(at + 17, true);
        p.vel.y = view.getFloat64(at + 25, true);
        p.facing = view.getFloat64(at + 33, true);
      }
      const puck = this.confirmed.puck;
      puck.pos.x = view.getFloat64(at, true);
      puck.pos.y = view.getFloat64(at + 8, true);
      puck.vel.x = view.getFloat64(at + 16, true);
      puck.vel.y = view.getFloat64(at + 24, true);
    }

    // How far ahead of the host to run: far enough that each input is there a little before its step.
    let goal = Math.max(was.tick, this.confirmed.tick);
    if (guestLatest >= 0 && guestLatest >= this.adjustedAt) {
      const margin = guestLatest - hostTick + 1;
      if (margin < online.targetMargin) {
        goal += Math.min(online.maxCatchUp, online.targetMargin - margin);
        this.adjustedAt = goal;
      } else if (margin > online.targetMargin + online.marginSlack && this.wait === 0) {
        this.wait = Math.min(online.maxCatchUp, margin - online.targetMargin - online.marginSlack);
        this.adjustedAt = goal + 1;
      }
    }

    // The picture again: the host's game run on with the guest's own controls and the host's last known ones.
    const next = throughText(this.confirmed);
    let rerun = 0;
    while (next.tick < goal && next.phase !== 'final') {
      const tick = next.tick;
      let mine = this.own.get(tick);
      if (!mine) {
        mine = this.lastOwn;
        this.own.set(tick, mine);
      }
      step(next, this.hostGuess, this.t, mine);
      rerun += 1;
    }
    for (const tick of this.own.keys()) if (tick < this.confirmed.tick - online.guestInputsSent) this.own.delete(tick);
    this.predicted = next;
    return { full: message.kind === 'full', rerun, patched, moved: next.tick - was.tick, before: next.tick === was.tick ? was : null };
  }
}
