import { describe, expect, it } from 'vitest';
import look from '../src/data/rinkLook.json';
import { ACTIONS, GOALIE_ACTIONS, STANDING, figure, type PoseInput, type Shape } from '../src/game/figure';
import { Effects } from '../src/game/effects';
import { cloneTuning } from '../src/sim/tuning';
import { createWorld } from '../src/sim/world';

/** Every number in a figure's pieces, in order. */
const numbers = (shapes: readonly Shape[]): number[] => shapes.flatMap((s) => (s.kind === 'circle' ? [s.x, s.y, s.r] : s.kind === 'limb' ? [s.x1, s.y1, s.x2, s.y2, s.w] : s.points.flat()));
const apart = (a: readonly Shape[], b: readonly Shape[]): number => {
  const [x, y] = [numbers(a), numbers(b)];
  return x.length === y.length ? Math.max(...x.map((v, i) => Math.abs(v - (y[i] as number)))) : Number.POSITIVE_INFINITY;
};
const gloves = (shapes: readonly Shape[]): Extract<Shape, { kind: 'circle' }>[] => shapes.filter((s): s is Extract<Shape, { kind: 'circle' }> => s.kind === 'circle' && s.tag === 'glove');

describe('moves that ease in and out', () => {
  it('a skater half-way into a move is drawn between standing and the move', () => {
    for (const action of ACTIONS.filter((a) => !GOALIE_ACTIONS.includes(a))) {
      const pose: PoseInput = { ...STANDING, speed: 0.5, stride: 1, action };
      const none = figure({ ...STANDING, speed: 0.5, stride: 1 }).shapes;
      const whole = figure(pose).shapes;
      const half = figure({ ...pose, amount: 0.5 }).shapes;
      if (apart(none, whole) === Number.POSITIVE_INFINITY) continue; // Made of other pieces: nothing to draw between.
      expect(apart(half, whole), action).toBeGreaterThan(0);
      expect(apart(half, whole), action).toBeLessThan(apart(none, whole));
      expect(apart(half, none), action).toBeLessThan(apart(none, whole));
    }
  });

  it('most skater moves can be drawn part-way: they are made of the same pieces as the man standing', () => {
    const blendable = ACTIONS.filter((a) => !GOALIE_ACTIONS.includes(a)).filter((action) => apart(figure(STANDING).shapes, figure({ ...STANDING, action }).shapes) !== Number.POSITIVE_INFINITY);
    expect(blendable).toEqual(expect.arrayContaining(['pass', 'poke', 'hit', 'shot']));
  });

  it('all the way, and none of the way, are the move and the man without it', () => {
    const pose: PoseInput = { ...STANDING, action: 'shot' };
    expect(figure({ ...pose, amount: 1 }).shapes).toEqual(figure(pose).shapes);
    expect(apart(figure({ ...pose, amount: 0 }).shapes, figure(STANDING).shapes)).toBeLessThan(1e-9);
  });

  it('a goalie half-way down is the same pieces as him down, or else simply down: never broken', () => {
    const down = figure({ ...STANDING, goalie: true, down: true });
    const half = figure({ ...STANDING, goalie: true, down: true, amount: 0.5 });
    expect(half.shapes.length).toBe(down.shapes.length);
    // `top` is how far above his skates his highest point is, as a negative number: half-way down he is no taller than standing.
    expect(half.top).toBeGreaterThanOrEqual(figure({ ...STANDING, goalie: true }).top - 1e-9);
  });

  it('a mirrored half-way pose is the exact mirror', () => {
    const right = figure({ ...STANDING, action: 'hit', amount: 0.5, side: 1 });
    const left = figure({ ...STANDING, action: 'hit', amount: 0.5, side: -1 });
    expect(left.hand.x).toBeCloseTo(-right.hand.x, 9);
    expect(left.hand.y).toBeCloseTo(right.hand.y, 9);
  });
});

describe('a carve', () => {
  it('is its own picture, the same wherever he is in his stride, and different each way', () => {
    const toward = figure({ ...STANDING, speed: 1, carve: 1 });
    expect(apart(toward.shapes, figure({ ...STANDING, speed: 1, glide: true }).shapes)).toBeGreaterThan(0.01);
    expect(figure({ ...STANDING, speed: 1, carve: 1, stride: 2 }).shapes).toEqual(toward.shapes);
    expect(apart(toward.shapes, figure({ ...STANDING, speed: 1, carve: -1 }).shapes)).toBeGreaterThan(0.01);
  });

  it('seen from the front his hips go over to one side or the other', () => {
    const one = figure({ ...STANDING, speed: 1, carve: 1, view: 'front' });
    const other = figure({ ...STANDING, speed: 1, carve: -1, view: 'front' });
    expect(apart(one.shapes, other.shapes)).toBeGreaterThan(0.01);
  });

  it('is only called when a skater is turning hard', () => {
    const t = cloneTuning();
    const world = createWorld(t, 'carve');
    const fx = new Effects(false);
    const man = world.players[0]!;
    const run = (steps: number, turn: number): void => {
      for (let i = 0; i < steps; i++) {
        man.facing += turn / 60;
        fx.update(world, [], t, 1 / 60);
      }
    };
    run(30, 0);
    expect(fx.carving(man.id)).toBe(0);
    run(30, look.effects.carveRate * 2);
    expect(fx.carving(man.id)).toBe(1);
    run(30, -look.effects.carveRate * 2);
    expect(fx.carving(man.id)).toBe(-1);
    run(60, 0);
    expect(fx.carving(man.id)).toBe(0);
  });
});

describe('three cheers', () => {
  it('each has both gloves in the air and each is a different picture', () => {
    const plain = figure({ ...STANDING, cheer: true });
    const wide = figure({ ...STANDING, cheer: true, cheerStyle: 1 });
    const knees = figure({ ...STANDING, cheer: true, cheerStyle: 2 });
    for (const f of [plain, wide, knees]) {
      const face = f.shapes.find((s) => s.kind === 'circle' && s.tag === 'skin') as Extract<Shape, { kind: 'circle' }> | undefined;
      const up = gloves(f.shapes).filter((g) => face === undefined || g.y < face.y);
      expect(up.length).toBeGreaterThanOrEqual(2);
    }
    expect(apart(plain.shapes, wide.shapes)).toBeGreaterThan(0.01);
    expect(apart(plain.shapes, knees.shapes)).toBeGreaterThan(0.01);
    expect(knees.top).toBeGreaterThan(plain.top);
  });
});

describe('the numbers behind them', () => {
  it('are sensible', () => {
    const F = look.figure;
    expect(F.paintsPerFrame).toBeGreaterThanOrEqual(1);
    expect(F.easeIn + F.easeOut).toBeLessThan(1);
    expect(F.windUpHalf).toBeGreaterThan(0);
    expect(F.windUpHalf).toBeLessThan(1);
    expect(F.goalie.dropRange).toBeGreaterThan(0);
  });
});
