import { describe, expect, it } from 'vitest';
import { OnlineGuest, OnlineHost, throughText, wireInput } from '../src/sim/online';
import { packWorld } from '../src/sim/snapshot';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame } from '../src/sim/types';
import { createGame, step } from '../src/sim/world';
import { uniformTeam } from './harness/harness';
import { measureOnline } from './harness/online';

const t = cloneTuning();
const inputAt = (n: number, k: number): InputFrame => ({ ...NO_INPUT, moveX: Math.sin(n / (40 + k)), moveY: Math.cos(n / (55 - k)), shoot: n % (90 + k) < 30, pass: n % 130 < 4, check: n % (70 - k) < 10, switchPlayer: n % 200 < 3, sprint: n % 50 < 20 });
const versus = (seed: string) => createGame(t, seed, { teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5], second: 1, overtimeLimit: 60 });

describe('an input on the wire', () => {
  it('comes out as it would a second time, with every button kept', () => {
    for (let n = 0; n < 400; n++) {
      const once = wireInput({ ...inputAt(n, 3), lineChange: n % 7 === 0, powerupA: n % 11 === 0, powerupB: n % 13 === 0, pullGoalie: n % 17 === 0 });
      expect(wireInput(once)).toEqual(once);
      expect(once.shoot).toBe(n % 93 < 30);
      expect(once.pullGoalie).toBe(n % 17 === 0);
      expect(Math.abs(once.moveX - Math.sin(n / 43))).toBeLessThan(1 / 127);
    }
  });
});

describe('a game sent as text', () => {
  it('goes on exactly as the one it was copied from', () => {
    const live = versus('text');
    for (let n = 0; n < 2000; n++) step(live, wireInput(inputAt(n, 0)), t, wireInput(inputAt(n, 9)));
    const copy = throughText(live);
    for (let n = 2000; n < 5000; n++) {
      const a = step(live, wireInput(inputAt(n, 0)), t, wireInput(inputAt(n, 9)));
      expect(step(copy, wireInput(inputAt(n, 0)), t, wireInput(inputAt(n, 9)))).toEqual(a);
    }
    expect(JSON.stringify(packWorld(copy))).toBe(JSON.stringify(packWorld(live)));
  });
});

describe('a host and a guest with nothing between them', () => {
  it("keeps the guest's copy the same as the host's game to the last figure", () => {
    const world = versus('direct');
    const host = new OnlineHost(world, t);
    const guest = new OnlineGuest(packWorld(world), t);
    for (let n = 0; n < 3000; n++) {
      host.receive(guest.outgoing());
      host.step(inputAt(n, 0));
      guest.receive(host.message());
      guest.frame(inputAt(n, 9));
    }
    expect(guest.confirmed.tick).toBe(world.tick);
    expect(JSON.stringify(packWorld(guest.confirmed))).toBe(JSON.stringify(packWorld(world)));
    // And his picture is ahead of it, not behind.
    expect(guest.predicted.tick).toBeGreaterThan(world.tick);
  });
});

describe('a host and a guest on a slow, lossy wire', () => {
  it('ends agreed, with the guest drawing his own skater where it really is', () => {
    const r = measureOnline({ lagMs: 50, jitterMs: 15, loss: 0.02, seconds: 60, seed: 'wire-a' });
    expect(r.agreed).toBe(true);
    expect(r.own.mean).toBeLessThan(0.05);
    expect(r.lateInputs).toBeLessThan(0.03);
    expect(r.asked).toBe(0);
    // The picture runs ahead by about the round trip: that is the delay it spares him.
    expect(r.leadMs).toBeGreaterThan(100);
    expect(r.leadMs).toBeLessThan(300);
  });

  it('gets worse with the lag, not with the loss alone', () => {
    const near = measureOnline({ lagMs: 25, loss: 0.01, seconds: 60, seed: 'wire-b' });
    const far = measureOnline({ lagMs: 100, loss: 0.01, seconds: 60, seed: 'wire-b' });
    expect(far.rival.mean).toBeGreaterThan(near.rival.mean);
    expect(far.agreed && near.agreed).toBe(true);
  });

  it('stays together when the two phones do not agree on the arithmetic', () => {
    const r = measureOnline({ lagMs: 50, jitterMs: 15, loss: 0.02, seconds: 60, seed: 'wire-c', disagree: 1e-6 });
    expect(r.agreed).toBe(true);
    expect(r.worstPatch).toBeGreaterThan(0);
    expect(r.own.mean).toBeLessThan(0.05);
  });

  it('asks for the whole game after the line drops, and carries on', () => {
    const r = measureOnline({ lagMs: 50, loss: 0.02, seconds: 40, seed: 'wire-d', blackout: [10, 12] });
    expect(r.asked).toBeGreaterThan(0);
    expect(r.agreed).toBe(true);
  });

  it('works the same for two on one team', () => {
    const r = measureOnline({ lagMs: 50, jitterMs: 15, loss: 0.02, seconds: 40, seed: 'wire-e' }, 0);
    expect(r.agreed).toBe(true);
    expect(r.own.mean).toBeLessThan(0.05);
  });
});
