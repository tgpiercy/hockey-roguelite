import { createRng } from '../core/rng';
import { canPickUp, createPuck, stepCarriedPuck, stepLoosePuck } from './puck';
import { stepShooting } from './shot';
import { createSkater, stepSkater } from './skater';
import type { Tuning } from './tuning';
import type { InputFrame, SimEvent, World } from './types';

/** The simulation always advances in steps of this length, whatever the screen's refresh rate. */
export const STEPS_PER_SECOND = 60;
export const STEP_SECONDS = 1 / STEPS_PER_SECOND;

export function createWorld(t: Tuning, seed: number | string): World {
  return {
    tick: 0,
    skater: createSkater(t.game.skaterStartX, 0),
    puck: createPuck(0, 0),
    goals: 0,
    phase: 'play',
    phaseTime: 0,
    rng: createRng(seed),
  };
}

function faceOff(world: World, t: Tuning): void {
  world.skater = createSkater(t.game.skaterStartX, 0);
  world.puck = createPuck(0, 0);
  world.phase = 'play';
  world.phaseTime = 0;
}

function goal(world: World, side: -1 | 1, t: Tuning, events: SimEvent[]): void {
  world.goals += 1;
  world.phase = 'goal';
  world.phaseTime = t.game.goalPauseSeconds;
  world.puck.carried = false;
  events.push({ type: 'goal', side });
}

/** Advances the whole world by one fixed step and reports what happened. */
export function step(world: World, input: InputFrame, t: Tuning): SimEvent[] {
  const dt = STEP_SECONDS;
  const events: SimEvent[] = [];
  const { skater, puck } = world;
  world.tick += 1;

  stepSkater(skater, input, t, dt);

  if (world.phase === 'goal') {
    // Celebration pause: the puck settles in the net, then everything resets.
    skater.shootHeld = input.shoot;
    skater.charge = 0;
    stepLoosePuck(puck, t, dt);
    world.phaseTime -= dt;
    if (world.phaseTime <= 0) faceOff(world, t);
    return events;
  }

  puck.pickupCooldown = Math.max(0, puck.pickupCooldown - dt);

  const speed = stepShooting(skater, puck, input, t.player, t, world.rng, dt);
  if (speed !== null) events.push({ type: 'shot', speed });

  if (puck.carried) {
    const scored = stepCarriedPuck(puck, skater, t, dt);
    if (scored !== 0) goal(world, scored, t, events);
    return events;
  }

  const moved = stepLoosePuck(puck, t, dt);
  if (moved.hitPost) events.push({ type: 'post' });
  if (moved.scored !== 0) {
    goal(world, moved.scored, t, events);
  } else if (canPickUp(puck, skater, t)) {
    puck.carried = true;
    events.push({ type: 'pickup' });
  }
  return events;
}
