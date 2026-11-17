import { describe, expect, it } from 'vitest';
import look from '../src/data/rinkLook.json';
import portraitLook from '../src/data/portraitLook.json';
import portraits from '../src/data/portraits.json';
import { burstPoints, placed, popScale } from '../src/game/burst';
import { wordsFor } from '../src/game/floatWords';

describe('the burst behind a shouted word', () => {
  it('goes out and in by turns, twice as many points as spikes, all within its jitter of the circle', () => {
    const points = burstPoints('BIG HIT!', 11, 0.3, 0.1);
    expect(points).toHaveLength(22);
    points.forEach(([x, y], i) => {
      const r = Math.hypot(x, y);
      if (i % 2 === 0) expect(Math.abs(r - 1)).toBeLessThanOrEqual(0.1 + 1e-9);
      else expect(Math.abs(r - 0.7)).toBeLessThanOrEqual(0.05 + 1e-9);
    });
  });

  it('is the same for the same words and different for different ones', () => {
    expect(burstPoints('GOAL!', 17, 0.26, 0.1)).toEqual(burstPoints('GOAL!', 17, 0.26, 0.1));
    expect(burstPoints('GOAL!', 17, 0.26, 0.1)).not.toEqual(burstPoints('STOLEN!', 17, 0.26, 0.1));
  });

  it('is stretched, turned and moved to where the word is', () => {
    const [p] = placed([[1, 0]], 10, 20, 4, 2, 0);
    expect(p).toEqual({ x: 14, y: 20 });
    const [q] = placed([[1, 0]], 0, 0, 4, 2, 90);
    expect(q!.x).toBeCloseTo(0);
    expect(q!.y).toBeCloseTo(4);
  });

  it('a word lands growing from nothing, goes past its size and settles', () => {
    expect(popScale(0, 0.2, 0.3)).toBe(0);
    expect(popScale(0.14, 0.2, 0.3)).toBeGreaterThan(0.7);
    expect(Math.max(...[0.1, 0.12, 0.14, 0.16, 0.18].map((t) => popScale(t, 0.2, 0.3)))).toBeGreaterThan(1);
    expect(popScale(0.2, 0.2, 0.3)).toBe(1);
    expect(popScale(5, 0.2, 0.3)).toBe(1);
    expect(popScale(1, 0, 0.3)).toBe(1);
  });
});

describe('the look tables behind the comic drawing', () => {
  it('every shouted word has a colour for its burst, and every word says its kind', () => {
    for (const kind of Object.keys(look.floatWords.texts)) expect((look.floatWords.fills as Record<string, string>)[kind]).toMatch(/^#[0-9a-f]{6}$/i);
    const [word] = wordsFor([{ type: 'block', player: 3, shooter: 9 } as never]);
    expect(word).toEqual({ text: look.floatWords.texts.blocked, kind: 'blocked', player: 3 });
  });

  it('every face shape a portrait can have has a jaw to be drawn with, narrower at the chin than at the cheek', () => {
    for (const face of portraits.faces) {
      const shape = (portraitLook.faces as Record<string, { cheek: number; jaw: number; chin: number; chinY: number }>)[face];
      expect(shape, face).toBeDefined();
      expect(shape!.cheek).toBeGreaterThan(shape!.jaw);
      expect(shape!.jaw).toBeGreaterThan(shape!.chin);
    }
  });

  it('the figure is inked: a line round him heavier than the line round each piece, and a far side that is darker', () => {
    const F = look.figure;
    expect(F.ink.outline).toBeGreaterThan(F.ink.inner);
    expect(F.ink.shadeDark).toBeGreaterThan(0);
    expect(F.farDark).toBeGreaterThan(0);
    expect(F.farDark).toBeLessThan(0.5);
  });
});

describe('a skater who is slowing down glides', () => {
  it('his stride goes on while he holds his speed and waits while he loses it', async () => {
    const { Effects } = await import('../src/game/effects');
    const { createWorld } = await import('../src/sim/world');
    const { cloneTuning } = await import('../src/sim/tuning');
    const t = cloneTuning();
    const world = createWorld(t, 'glide');
    const fx = new Effects(false);
    const me = world.players[0]!;
    const dt = 1 / 60;
    const run = (speedAt: (i: number) => number, steps: number): void => {
      for (let i = 0; i < steps; i++) {
        me.vel.x = speedAt(i);
        me.vel.y = 0;
        fx.update(world, [], t, dt);
      }
    };
    run(() => 6, 30);
    expect(fx.gliding(me.id)).toBe(false);
    const before = fx.stride.get(me.id)!;
    run(() => 6, 30);
    expect(fx.stride.get(me.id)!).toBeGreaterThan(before);
    // Losing three metres a second each second: after a moment he is gliding, and his stride stops where it was.
    run((i) => 6 - (i + 1) * 3 * dt, 30);
    expect(fx.gliding(me.id)).toBe(true);
    const held = fx.stride.get(me.id)!;
    run((i) => 4.5 - (i + 1) * 3 * dt, 20);
    expect(fx.stride.get(me.id)!).toBe(held);
    // He pushes again: the stride goes on.
    run(() => 5, 5);
    expect(fx.gliding(me.id)).toBe(false);
    expect(fx.stride.get(me.id)!).toBeGreaterThan(held);
  });
});

describe('where a shouted word is put', () => {
  it('on the side of the player away from the puck, leaning up the screen', async () => {
    const { awayFrom } = await import('../src/game/burst');
    // The puck to his right: the word goes left, and upward.
    const left = awayFrom({ x: 10, y: 10 }, { x: 14, y: 10 }, 0.7);
    expect(left.x).toBeLessThan(0);
    expect(left.y).toBeLessThan(0);
    expect(Math.hypot(left.x, left.y)).toBeCloseTo(1);
    // The puck below him: straight up. The puck above him: down, but less than straight down would be.
    expect(awayFrom({ x: 10, y: 10 }, { x: 10, y: 14 }, 0.7)).toEqual({ x: 0, y: -1 });
    expect(awayFrom({ x: 10, y: 10 }, { x: 10, y: 6 }, 0.7).y).toBeGreaterThan(0);
    // The puck on his stick: straight up.
    expect(awayFrom({ x: 3, y: 3 }, { x: 3, y: 3 }, 0.7)).toEqual({ x: 0, y: -1 });
  });

  it('a burst covers a point under it, with room to spare, and not one clear of it', async () => {
    const { covers } = await import('../src/game/burst');
    expect(covers(100, 100, 40, 20, 1, { x: 120, y: 105 })).toBe(true);
    expect(covers(100, 100, 40, 20, 1, { x: 145, y: 100 })).toBe(false);
    expect(covers(100, 100, 40, 20, 1.5, { x: 145, y: 100 })).toBe(true);
    expect(covers(100, 100, 40, 20, 1.5, { x: 100, y: 135 })).toBe(false);
  });
});
