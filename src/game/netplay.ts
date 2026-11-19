import online from '../data/online.json';
import { OnlineGuest, OnlineHost, type HostMessage } from '../sim/online';
import type { PackedWorld } from '../sim/snapshot';
import type { SureMessage, Wire } from './wire';
import type { Tuning } from '../sim/tuning';
import type { InputFrame, SimEvent, World } from '../sim/types';

/**
 * A game across two devices, one layer above `src/sim/online.ts`: who sends what, and when.
 * Nothing here touches the page; what carries the messages is a `Wire` (`wire.ts`).
 */
export { cutSure, joinSure, readSure, type SureMessage, type Wire } from './wire';

/** Shown and sounded only when the host's own game says so; everything else is taken from the guest's picture at once. */
const SURE = new Set<SimEvent['type']>(['goal', 'period', 'final', 'shootout', 'mascot', 'fire', 'powerup', 'pull']);

/** One device's place in the game. The scene steps and draws through it. */
export interface Seat {
  readonly role: 'host' | 'guest';
  /** The game to draw. */
  readonly world: World;
  /** The game as the host has it: the score and the final horn are read from this. */
  readonly sure: World;
  /** Runs this many steps on these controls, sends what is due, and returns what happened. */
  advance(steps: number, input: InputFrame): SimEvent[];
  /** Something outside a step changed the game (the host's tactics): the other device is sent all of it. */
  touched(): void;
  /** True while nothing has come from the other device for long enough that the picture has stopped. */
  readonly stalled: boolean;
  /** How far each player and the puck are drawn from where they are, while a correction is eased in. */
  ease(seconds: number): void;
  /** Moves everyone by the easing (1) and back (-1), around a draw. */
  shift(sign: 1 | -1): void;
}

export class HostSeat implements Seat {
  readonly role = 'host';
  readonly host: OnlineHost;
  private since = 0;
  private saidFinal = false;

  constructor(
    world: World,
    t: Tuning,
    private readonly wire: Wire,
  ) {
    this.host = new OnlineHost(world, t);
    wire.onFast = (data) => {
      try {
        this.host.receive(data);
      } catch {
        // A message cut short: the next one says the same again.
      }
    };
  }

  get world(): World {
    return this.host.world;
  }

  get sure(): World {
    return this.host.world;
  }

  get stalled(): boolean {
    return false;
  }

  advance(steps: number, input: InputFrame): SimEvent[] {
    const events: SimEvent[] = [];
    for (let i = 0; i < steps; i++) {
      events.push(...this.host.step(input));
      this.since += 1;
      if (this.since >= online.sendEverySteps) this.send();
    }
    // The last word of all must not be one that can be lost.
    if (this.world.phase === 'final' && !this.saidFinal) {
      this.saidFinal = true;
      this.touched();
      this.send();
    }
    return events;
  }

  /** Something outside a step changed the game: the guest is sent all of it. */
  touched(): void {
    this.host.resend();
  }

  private send(): void {
    this.since = 0;
    const m = this.host.message();
    if (m.kind === 'delta') this.wire.sendFast(m.data);
    else this.wire.sendSure(JSON.stringify({ k: 'full', tick: m.tick, guestLatest: m.guestLatest, world: m.world } satisfies SureMessage));
  }

  ease(): void {}

  shift(): void {}
}

export class GuestSeat implements Seat {
  readonly role = 'guest';
  readonly guest: OnlineGuest;
  private readonly inbox: HostMessage[] = [];
  /** By player id; the puck is -1. */
  private readonly offsets = new Map<number, { x: number; y: number }>();

  constructor(
    start: PackedWorld,
    t: Tuning,
    private readonly wire: Wire,
  ) {
    this.guest = new OnlineGuest(start, t);
    wire.onFast = (data) => this.inbox.push({ kind: 'delta', data });
  }

  /** The whole game, come by the sure line. */
  full(m: Extract<SureMessage, { k: 'full' }>): void {
    this.inbox.push({ kind: 'full', tick: m.tick, guestLatest: m.guestLatest, world: m.world });
  }

  get world(): World {
    return this.guest.predicted;
  }

  get sure(): World {
    return this.guest.confirmed;
  }

  get stalled(): boolean {
    return this.guest.stalled;
  }

  advance(steps: number, input: InputFrame): SimEvent[] {
    const events: SimEvent[] = [];
    for (const m of this.inbox.splice(0)) {
      const score = [...this.guest.confirmed.score];
      let c;
      try {
        c = this.guest.receive(m);
      } catch {
        continue;
      }
      if (!c) continue;
      events.push(...c.events.filter((e) => SURE.has(e.type)));
      // A goal that went by inside a whole game sent: it is still a goal.
      if (c.full) {
        for (const team of [0, 1] as const) {
          if (this.guest.confirmed.score[team] > (score[team] as number)) events.push({ type: 'goal', side: team === 0 ? 1 : -1, team, scorer: null, assists: [] });
        }
      }
      this.noteJump(c.was, this.guest.predicted, c.full);
    }
    for (let i = 0; i < steps; i++) {
      events.push(...this.guest.frame(input).filter((e) => !SURE.has(e.type)));
      this.wire.sendFast(this.guest.outgoing());
    }
    return events;
  }

  /** The picture was replaced: whoever moved is drawn where he was, and let slide to where he is. */
  private noteJump(was: World, now: World, full: boolean): void {
    if (full || was.phase !== now.phase) {
      this.offsets.clear();
      return;
    }
    const note = (id: number, a: { x: number; y: number }, b: { x: number; y: number }): void => {
      const o = this.offsets.get(id) ?? { x: 0, y: 0 };
      o.x += a.x - b.x;
      o.y += a.y - b.y;
      if (Math.hypot(o.x, o.y) > online.easeMaxMetres) this.offsets.delete(id);
      else this.offsets.set(id, o);
    };
    for (const p of now.players) {
      const old = was.players[p.id];
      if (old && old.onIce && p.onIce) note(p.id, old.pos, p.pos);
      else this.offsets.delete(p.id);
    }
    // A puck on a stick goes where the stick goes.
    if (now.puck.carrier === null && was.puck.carrier === null) note(-1, was.puck.pos, now.puck.pos);
    else this.offsets.delete(-1);
  }

  ease(seconds: number): void {
    const keep = Math.pow(0.5, (seconds * 1000) / online.easeHalfLifeMs);
    for (const [id, o] of this.offsets) {
      o.x *= keep;
      o.y *= keep;
      if (Math.abs(o.x) + Math.abs(o.y) < 0.002) this.offsets.delete(id);
    }
  }

  touched(): void {}

  /** How far this player (or the puck, -1) is drawn from where he is now. */
  offset(id: number): { x: number; y: number } {
    return this.offsets.get(id) ?? { x: 0, y: 0 };
  }

  shift(sign: 1 | -1): void {
    const world = this.guest.predicted;
    for (const [id, o] of this.offsets) {
      const pos = id === -1 ? world.puck.pos : world.players[id]?.pos;
      if (!pos) continue;
      pos.x += sign * o.x;
      pos.y += sign * o.y;
    }
    const carrier = world.puck.carrier === null ? undefined : this.offsets.get(world.puck.carrier);
    if (carrier) {
      world.puck.pos.x += sign * carrier.x;
      world.puck.pos.y += sign * carrier.y;
    }
  }
}
