import { describe, expect, it } from 'vitest';
import { assistedAim } from '../src/sim/aim';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type World } from '../src/sim/types';
import { createWorld, step } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);
const corner = t.net.mouthWidth / 2 - t.aimAssist.cornerInset;

/** The human's skater in the slot with the puck, 8 m out; the goalie shaded to one side of his net. */
const setUp = (goalieY: number, shooterY = 0): World => {
  const world = createWorld(t, 'aim');
  clearIce(world, [ID.home1]);
  for (const p of world.players) if (p.role === 'skater' && p.id !== ID.home1) p.stagger = 999;
  place(world, ID.home1, gx - 9, shooterY, 0);
  giveTo(world, ID.home1);
  player(world, ID.awayGoalie).pos = { x: gx - 1, y: goalieY };
  return world;
};

const angleTo = (world: World, y: number): number => Math.atan2(y - world.puck.pos.y, gx - world.puck.pos.x);

describe('aim assist', () => {
  it('steers a shot pointed at the net to the corner away from the goalie', () => {
    const left = setUp(0.5);
    expect(assistedAim(left, player(left, ID.home1), 0, t)).toBeCloseTo(angleTo(left, -corner), 6);
    const right = setUp(-0.5);
    expect(assistedAim(right, player(right, ID.home1), 0, t)).toBeCloseTo(angleTo(right, corner), 6);
  });

  it('works from an angle and with only a rough direction, as from a keyboard', () => {
    const world = setUp(0.4, 6);
    // From 6 m to the side, "right and up" is 45 degrees off the true line to the net, but still inside the cone.
    const aimed = assistedAim(world, player(world, ID.home1), -Math.PI / 4, t);
    expect(aimed).toBeCloseTo(angleTo(world, -corner), 6);
  });

  it('leaves a shot alone when it is pointed well away from the net', () => {
    const world = setUp(0.5);
    const shooter = player(world, ID.home1);
    expect(assistedAim(world, shooter, Math.PI / 2, t)).toBe(Math.PI / 2);
    expect(assistedAim(world, shooter, Math.PI, t)).toBe(Math.PI);
  });

  it('does nothing from behind the goal line', () => {
    const world = setUp(0.5);
    world.puck.pos = { x: gx + 1.5, y: 3 };
    expect(assistedAim(world, player(world, ID.home1), Math.PI, t)).toBe(Math.PI);
  });

  it('can be turned down or off', () => {
    const world = setUp(0.5);
    const shooter = player(world, ID.home1);
    const off = cloneTuning();
    off.aimAssist.strength = 0;
    expect(assistedAim(world, shooter, 0.1, off)).toBe(0.1);

    const half = cloneTuning();
    half.aimAssist.strength = 0.5;
    const full = angleTo(world, -corner);
    expect(assistedAim(world, shooter, 0.1, half)).toBeCloseTo((0.1 + full) / 2, 6);
  });

  it('with no goalie, picks the corner nearer to where the stick points', () => {
    const world = setUp(0);
    player(world, ID.awayGoalie).onIce = false;
    const shooter = player(world, ID.home1);
    expect(assistedAim(world, shooter, 0.2, t)).toBeCloseTo(angleTo(world, corner), 6);
    expect(assistedAim(world, shooter, -0.2, t)).toBeCloseTo(angleTo(world, -corner), 6);
  });

  it('in play, the human shot heads for the open corner even with the stick pointed straight ahead', () => {
    const exact = cloneTuning();
    exact.shot.maxSpreadDegrees = 0;
    exact.shot.minSpreadDegrees = 0;
    const world = setUp(0.5);
    step(world, { ...NO_INPUT, moveX: 1, shoot: true }, exact);
    step(world, { ...NO_INPUT, moveX: 1, shoot: true }, exact);
    player(world, ID.awayGoalie).pos = { x: gx - 1, y: 0.5 };
    step(world, { ...NO_INPUT, moveX: 1 }, exact);
    expect(world.puck.carrier).toBe(null);
    expect(world.puck.vel.y).toBeLessThan(0);
    const heading = Math.atan2(world.puck.vel.y, world.puck.vel.x);
    expect(heading).toBeLessThan(-0.05);
  });

  it('the AI gets no assist: its shot goes where its stick points', () => {
    const exact = cloneTuning();
    exact.shot.maxSpreadDegrees = 0;
    exact.shot.minSpreadDegrees = 0;
    const world = createWorld(exact, 'ai-aim', { human: false, levels: [0.5, 0.5] });
    clearIce(world, [ID.home1]);
    for (const p of world.players) if (p.role === 'skater') p.stagger = 999;
    const shooter = place(world, ID.home1, gx - 9, 0, 0);
    shooter.stagger = 0;
    shooter.ai.thinkIn = 99;
    shooter.ai.shootSteps = 3;
    shooter.ai.aimX = 1;
    shooter.ai.aimY = 0;
    giveTo(world, ID.home1);
    player(world, ID.awayGoalie).pos = { x: gx - 1, y: 0.5 };
    for (let i = 0; i < 5 && world.puck.carrier !== null; i++) step(world, NO_INPUT, exact);
    expect(world.puck.carrier).toBe(null);
    expect(Math.abs(Math.atan2(world.puck.vel.y, world.puck.vel.x))).toBeLessThan(0.02);
  });
});
