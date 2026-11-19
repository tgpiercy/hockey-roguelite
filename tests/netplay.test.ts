import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import online from '../src/data/online.json';
import { codeIn, packCode, unpackCode } from '../src/game/joinCode';
import { cutSure, GuestSeat, HostSeat, joinSure, readSure, type Wire } from '../src/game/netplay';
import { packWorld } from '../src/sim/snapshot';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent } from '../src/sim/types';
import { createGame } from '../src/sim/world';
import { uniformTeam } from './harness/harness';

const t = cloneTuning();
const inputAt = (n: number, k: number): InputFrame => ({ ...NO_INPUT, moveX: Math.sin(n / (40 + k)), moveY: Math.cos(n / (55 - k)), shoot: n % (90 + k) < 30, pass: n % 130 < 4, check: n % (70 - k) < 10, sprint: n % 50 < 20 });

/** Two ends of a line that holds every message for a few frames, loses some of the fast ones, and cuts the sure ones into pieces as the real line does. */
function pair(delay: number, loss: number, seed: string): { a: Wire; b: Wire; tick: () => void; sureSent: () => number } {
  const rng = createRng(seed);
  let now = 0;
  let sure = 0;
  const queue: { at: number; run: () => void }[] = [];
  const end = (): Wire => ({ onFast: null, onSure: null, onClosed: null, sendFast: () => undefined, sendSure: () => undefined, close: () => undefined });
  const a = end();
  const b = end();
  const join = (from: Wire, to: Wire): void => {
    const whole = joinSure();
    from.sendFast = (data) => {
      if (rng.next() < loss) return;
      const copy = data.slice();
      queue.push({ at: now + delay, run: () => to.onFast?.(copy) });
    };
    from.sendSure = (text) => {
      sure += 1;
      for (const piece of cutSure(text)) {
        queue.push({
          at: now + delay,
          run: () => {
            const done = whole(piece);
            if (done !== null) to.onSure?.(done);
          },
        });
      }
    };
  };
  join(a, b);
  join(b, a);
  return {
    a,
    b,
    sureSent: () => sure,
    tick: () => {
      now += 1;
      for (let i = 0; i < queue.length; ) {
        if ((queue[i] as { at: number }).at <= now) (queue.splice(i, 1)[0] as { run: () => void }).run();
        else i += 1;
      }
    },
  };
}

function play(delay: number, loss: number, seed: string, frames: number) {
  const world = createGame({ ...t, period: { ...t.period, seconds: 25 } }, seed, { teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5], second: 1, overtimeLimit: 20 });
  const tuning = { ...t, period: { ...t.period, seconds: 25 } };
  const line = pair(delay, loss, seed);
  const host = new HostSeat(world, tuning, line.a);
  const guest = new GuestSeat(packWorld(world), tuning, line.b);
  line.b.onSure = (text) => {
    const m = readSure(text);
    if (m?.k === 'full') guest.full(m);
  };
  const hostEvents: SimEvent[] = [];
  const guestEvents: SimEvent[] = [];
  let worstDrawnJump = 0;
  let worstRawJump = 0;
  for (let n = 0; n < frames; n++) {
    line.tick();
    if (host.sure.phase !== 'final') hostEvents.push(...host.advance(1, inputAt(n, 0)));
    if (guest.sure.phase !== 'final') {
      // Where the other person's skater is drawn, before and after this frame's corrections and step.
      const id = guest.world.human?.controlled ?? 0;
      const before = { x: (guest.world.players[id]?.pos.x ?? 0) + guest.offset(id).x, y: (guest.world.players[id]?.pos.y ?? 0) + guest.offset(id).y };
      const rawBefore = { ...(guest.world.players[id]?.pos ?? { x: 0, y: 0 }) };
      const phase = guest.world.phase;
      guestEvents.push(...guest.advance(1, inputAt(n, 9)));
      guest.ease(1 / 60);
      const now = guest.world.players[id];
      if (now && guest.world.human?.controlled === id && phase === 'play' && guest.world.phase === 'play') {
        worstDrawnJump = Math.max(worstDrawnJump, Math.hypot(now.pos.x + guest.offset(id).x - before.x, now.pos.y + guest.offset(id).y - before.y));
        worstRawJump = Math.max(worstRawJump, Math.hypot(now.pos.x - rawBefore.x, now.pos.y - rawBefore.y));
      }
    }
  }
  return { host, guest, hostEvents, guestEvents, worstDrawnJump, worstRawJump, line };
}

describe('two seats on a line', () => {
  it('ends with the same score on both devices, the last word sent the sure way', () => {
    const r = play(4, 0.05, 'seats-a', 60 * 60 * 3);
    expect(r.host.sure.phase).toBe('final');
    expect(r.guest.sure.phase).toBe('final');
    expect(r.guest.sure.score).toEqual(r.host.sure.score);
    expect(r.line.sureSent()).toBeGreaterThan(0);
  });

  it("shows the guest each goal once, on the host's word", () => {
    const goals = (events: SimEvent[]): string[] => events.filter((e) => e.type === 'goal').map((e) => (e.type === 'goal' ? String(e.team) : ''));
    let total = 0;
    let r = play(6, 0.1, 'seats-b0', 60 * 60 * 3);
    for (let k = 0; k < 6; k++) {
      r = play(6, 0.1, `seats-b${k}`, 60 * 60 * 3);
      expect(goals(r.guestEvents)).toEqual(goals(r.hostEvents));
      total += goals(r.hostEvents).length;
    }
    expect(total).toBeGreaterThan(0);
    // And he still hears the shots and passes of his own picture at once.
    expect(r.guestEvents.some((e) => e.type === 'shot')).toBe(true);
  });

  it('eases a correction in: nobody is drawn jumping as far as the picture was moved', () => {
    const r = play(6, 0.05, 'seats-c', 60 * 60);
    expect(r.worstRawJump).toBeGreaterThan(0.3);
    expect(r.worstDrawnJump).toBeLessThan(r.worstRawJump * 0.6);
  });

  it('lets a correction go in a fraction of a second', () => {
    const world = createGame(t, 'ease', { teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5], second: 1 });
    const guest = new GuestSeat(packWorld(world), t, pair(0, 0, 'ease').b);
    const seat = guest as unknown as { offsets: Map<number, { x: number; y: number }> };
    seat.offsets.set(3, { x: 1, y: 0 });
    for (let n = 0; n < Math.round((online.easeHalfLifeMs / 1000) * 60); n++) guest.ease(1 / 60);
    expect(guest.offset(3).x).toBeCloseTo(0.5, 1);
    for (let n = 0; n < 60; n++) guest.ease(1 / 60);
    expect(guest.offset(3).x).toBe(0);
    // Drawing with the easing and taking it off again leaves the game untouched.
    seat.offsets.set(3, { x: 0.4, y: -0.2 });
    const before = JSON.stringify(packWorld(guest.world));
    guest.shift(1);
    expect(JSON.stringify(packWorld(guest.world))).not.toBe(before);
    guest.shift(-1);
    expect(guest.world.players[3]?.pos.x).toBeCloseTo(JSON.parse(before).players[3].pos.x, 9);
  });
});

describe('a guest whose host has gone quiet', () => {
  it('stops the picture a little ahead, and does not run on by itself', () => {
    const world = createGame(t, 'quiet', { teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5], second: 1 });
    const guest = new GuestSeat(packWorld(world), t, pair(0, 0, 'quiet').b);
    for (let n = 0; n < 600; n++) guest.advance(1, inputAt(n, 9));
    expect(guest.stalled).toBe(true);
    expect(guest.world.tick - guest.sure.tick).toBe(online.maxLeadSteps);
  });
});

describe('a sure message in pieces', () => {
  it('comes back whole, whatever its length', () => {
    for (const length of [0, 1, online.sureChunk - 1, online.sureChunk, online.sureChunk + 1, online.sureChunk * 4 + 17]) {
      const text = Array.from({ length }, (_, i) => String.fromCharCode(48 + (i % 60))).join('');
      const whole = joinSure();
      const out = cutSure(text).map((piece) => whole(piece));
      expect(out[out.length - 1]).toBe(text);
      expect(out.slice(0, -1).every((x) => x === null)).toBe(true);
    }
  });

  it('is not taken for a message when it is not one', () => {
    expect(readSure('not json')).toBeNull();
    expect(readSure('{"x":1}')).toBeNull();
    expect(readSure('{"k":"ready"}')).toEqual({ k: 'ready' });
  });
});

describe('a code passed by hand', () => {
  const sdp = 'v=0\r\no=- 46117317 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:1 1 udp 2113937151 192.168.1.20 54400 typ host\r\na=ice-ufrag:abcd\r\na=fingerprint:sha-256 AA:BB:CC\r\n';

  it('gives back the text it was made from', async () => {
    const code = await packCode(sdp);
    expect(code).toMatch(/^[zr][A-Za-z0-9_-]+$/);
    expect(await unpackCode(code)).toBe(sdp);
  });

  it('is found inside a link, and with the spaces a message adds', async () => {
    const code = await packCode(sdp);
    expect(codeIn(`https://example.test/game/?join=${code}`)).toBe(code);
    expect(await unpackCode(`  ${code.slice(0, 20)}\n${code.slice(20)} `)).toBe(sdp);
  });

  it('refuses what is not a code', async () => {
    expect(await unpackCode('hello there')).toBeNull();
    expect(await unpackCode('')).toBeNull();
  });
});
