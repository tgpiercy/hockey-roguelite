import type { Boost, Modifier } from './modifiers';
import { startBoost } from './powerups';
import { otherTeam } from './team';
import type { Tuning } from './tuning';
import type { SimEvent, World } from './types';

/** The id of the boost a team gets when its momentum meter fills. */
export const ON_FIRE = 'onFire';

/** True while a team's on-fire spell is running. */
export function onFire(world: World, team: 0 | 1): boolean {
  return world.teams[team].boosts.some((b) => b.id === ON_FIRE);
}

function add(world: World, team: 0 | 1, amount: number): void {
  // Nothing builds while the spell is running: it has to be earned again from empty.
  if (onFire(world, team)) return;
  const state = world.teams[team];
  state.heat = Math.max(0, Math.min(1, state.heat + amount));
}

/**
 * Momentum: each team's meter fills from its goals, big hits, one-timers and saves, drains slowly, and is
 * cut when the other team scores. A full meter sets the team on fire for a few seconds (a timed boost,
 * like a powerup) and empties.
 */
export function stepMomentum(world: World, t: Tuning, events: SimEvent[], dt: number): void {
  const m = t.momentum;
  for (const e of [...events]) {
    if (e.type === 'goal') {
      add(world, e.team, m.goal);
      const other = world.teams[otherTeam(e.team)];
      other.heat *= 1 - m.concedeLoss;
    } else if (e.type === 'check' && e.success && e.big) {
      const p = world.players[e.player];
      if (p) add(world, p.team, m.bigHit);
    } else if (e.type === 'shot' && e.oneTimer) {
      const p = world.players[e.player];
      if (p) add(world, p.team, m.oneTimer);
    } else if (e.type === 'save') {
      const g = world.players[e.goalie];
      if (g) add(world, g.team, m.save);
    }
  }
  for (const team of [0, 1] as const) {
    const state = world.teams[team];
    // Checked before the drain: a meter that has just filled must not be nudged back under full first.
    if (state.heat >= 1 && !onFire(world, team)) {
      state.heat = 0;
      const modifiers: Modifier[] = [
        { stat: 'shotPower', op: 'add', value: m.fireShotPower },
        { stat: 'topSpeedScale', op: 'mul', value: m.fireSpeedScale },
      ];
      const boost: Boost = { id: ON_FIRE, name: 'On fire', modifiers, secondsLeft: m.fireSeconds };
      startBoost(world, team, boost);
      events.push({ type: 'fire', team });
    }
    state.heat = Math.max(0, state.heat - m.drainPerSecond * dt);
  }
}
