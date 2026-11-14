import { STEP_SECONDS } from './clock';
import { applyModifiers, type Modifier, type PowerupSpec } from './modifiers';
import type { InputFrame, SimEvent, World } from './types';

/** Re-works every player's abilities on a team from his base abilities plus the boosts now running. */
function refresh(world: World, team: 0 | 1): void {
  const running: Modifier[] = world.teams[team].boosts.flatMap((b) => b.modifiers);
  for (const p of world.players) {
    if (p.team !== team) continue;
    p.fx = applyModifiers(p.baseFx, running);
    if (p.goalie) p.goalie.fx = applyModifiers(p.goalie.baseFx, running);
  }
}

/** Uses the powerup in a slot: a timed one starts its boost, an instant one acts at once. */
export function usePowerup(world: World, team: 0 | 1, slot: number, events: SimEvent[]): boolean {
  const state = world.teams[team];
  const spec: PowerupSpec | null = state.powerups[slot] ?? null;
  if (!spec) return false;
  state.powerups[slot] = null;
  state.powerupsUsed.push(spec.id);

  if (spec.effect) {
    for (const p of world.players) {
      if (p.team !== team || p.role !== 'skater') continue;
      const wanted =
        spec.effect === 'restoreAllEnergy' || (spec.effect === 'restoreLineEnergy' ? p.onIce : !p.onIce);
      if (!wanted) continue;
      p.energy = 1;
      p.stamina = 1;
      p.sprintLocked = false;
    }
  }
  if (spec.modifiers && spec.modifiers.length > 0 && (spec.seconds ?? 0) > 0) {
    state.boosts.push({ id: spec.id, name: spec.name, modifiers: spec.modifiers, secondsLeft: spec.seconds as number });
    refresh(world, team);
  }
  events.push({ type: 'powerup', team, slot, id: spec.id });
  return true;
}

/**
 * One step of powerups: the human's two buttons each use the powerup loaded on them (once per press),
 * and running boosts count down on the game clock and end.
 */
export function stepPowerups(world: World, humanInput: InputFrame, events: SimEvent[]): void {
  if (world.human) {
    const team = world.human.team;
    const state = world.teams[team];
    const pressed = [humanInput.powerupA, humanInput.powerupB];
    pressed.forEach((down, slot) => {
      if (down && !state.powerupHeld[slot]) usePowerup(world, team, slot, events);
      state.powerupHeld[slot] = down;
    });
  }
  for (const team of [0, 1] as const) {
    const state = world.teams[team];
    if (state.boosts.length === 0) continue;
    for (const boost of state.boosts) boost.secondsLeft -= STEP_SECONDS;
    if (state.boosts.some((b) => b.secondsLeft <= 0)) {
      state.boosts = state.boosts.filter((b) => b.secondsLeft > 0);
      refresh(world, team);
    }
  }
}
