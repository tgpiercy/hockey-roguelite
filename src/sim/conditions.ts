import { STEP_SECONDS } from './clock';
import type { Modifier } from './modifiers';
import { refreshBoosts, startBoost } from './powerups';
import type { SimEvent, World } from './types';

/**
 * Modifiers that only count some of the time.
 *
 * "when": on while something is true for the team (leading, trailing, tied, the last period, overtime).
 * "on": starts a timed boost for the team when something happens (its goal, a goal against, a big hit,
 * a save, a steal, a completed pass), lasting `seconds`.
 *
 * A modifier with neither is always on, as it always was.
 */

export const WHEN = ['leading', 'trailing', 'tied', 'lastPeriod', 'overtime'] as const;
export const ON = ['goalFor', 'goalAgainst', 'bigHit', 'save', 'steal', 'pass'] as const;

/** True for a modifier that is simply always on. */
export function isPlain(m: Modifier): boolean {
  return m.when === undefined && m.on === undefined;
}

/** The always-on part of a list: what a player's abilities are built from. */
export function plainOf(modifiers: readonly Modifier[]): Modifier[] {
  return modifiers.filter(isPlain);
}

/** Whether a "when" holds for a team right now. `periods` is how many a game has. */
export function holds(world: World, team: 0 | 1, when: string, periods: number): boolean {
  const lead = world.score[team] - world.score[team === 0 ? 1 : 0];
  switch (when) {
    case 'leading':
      return lead > 0;
    case 'trailing':
      return lead < 0;
    case 'tied':
      return lead === 0;
    case 'lastPeriod':
      return !world.overtime && world.period >= periods;
    case 'overtime':
      return world.overtime;
    default:
      return false;
  }
}

/** Which team an event counts for under each trigger, or null if it is not that kind of event. */
function triggered(world: World, e: SimEvent): { on: string; team: 0 | 1 }[] {
  const teamOf = (id: number): 0 | 1 | null => world.players[id]?.team ?? null;
  const out: { on: string; team: 0 | 1 }[] = [];
  const add = (on: string, team: 0 | 1 | null): void => {
    if (team !== null) out.push({ on, team });
  };
  if (e.type === 'goal') {
    add('goalFor', e.team);
    add('goalAgainst', e.team === 0 ? 1 : 0);
  } else if (e.type === 'check' && e.success) {
    if (e.big) add('bigHit', teamOf(e.player));
    if (e.kind === 'poke') add('steal', teamOf(e.player));
  } else if (e.type === 'save') {
    add('save', teamOf(e.goalie));
  } else if (e.type === 'pickup' && e.pass) {
    add('pass', teamOf(e.player));
  }
  return out;
}

/**
 * One step of the conditional modifiers: switches the "when" ones on and off as the score and the period
 * change, and starts a timed boost for each "on" one whose moment has just come.
 */
export function stepConditions(world: World, events: readonly SimEvent[], periods: number): void {
  stepOwnConditions(world, events, periods);
  for (const team of [0, 1] as const) {
    const state = world.teams[team];
    if (state.conditional.length === 0) continue;
    const active = state.conditional.filter((m) => m.when !== undefined && holds(world, team, m.when, periods));
    if (active.length !== state.active.length || active.some((m, i) => m !== state.active[i])) {
      state.active = active;
      refreshBoosts(world, team);
    }
  }
  for (const e of events) {
    for (const hit of triggered(world, e)) {
      const state = world.teams[hit.team];
      // Modifiers that share a label are one item: they start together as one boost.
      const labels = new Set(state.conditional.filter((m) => m.on === hit.on).map((m) => m.label ?? m.on ?? ''));
      for (const label of labels) {
        const modifiers = state.conditional.filter((m) => m.on === hit.on && (m.label ?? m.on ?? '') === label);
        const seconds = Math.max(...modifiers.map((m) => m.seconds ?? 0));
        if (seconds > 0) startBoost(world, hit.team, { id: `when/${hit.on}/${label}`, name: label, modifiers, secondsLeft: seconds });
      }
    }
  }
}

/**
 * The same for each player's own conditional modifiers (nothing gives a player one today; the way is kept for content): the "when" ones follow his team's
 * situation, and an "on" one starts a timed boost for him alone when its moment comes for his team.
 */
function stepOwnConditions(world: World, events: readonly SimEvent[], periods: number): void {
  const dirty = new Set<0 | 1>();
  const hits = events.flatMap((e) => triggered(world, e));
  for (const p of world.players) {
    if (p.conditional.length === 0 && p.timed.length === 0) continue;
    const active = p.conditional.filter((m) => m.when !== undefined && holds(world, p.team, m.when, periods));
    if (active.length !== p.active.length || active.some((m, i) => m !== p.active[i])) {
      p.active = active;
      dirty.add(p.team);
    }
    if (p.timed.length > 0) {
      for (const boost of p.timed) boost.secondsLeft -= STEP_SECONDS;
      if (p.timed.some((b) => b.secondsLeft <= 0)) {
        p.timed = p.timed.filter((b) => b.secondsLeft > 0);
        dirty.add(p.team);
      }
    }
    for (const hit of hits) {
      if (hit.team !== p.team) continue;
      const modifiers = p.conditional.filter((m) => m.on === hit.on);
      const seconds = Math.max(0, ...modifiers.map((m) => m.seconds ?? 0));
      if (seconds <= 0) continue;
      p.timed = [...p.timed.filter((b) => b.on !== hit.on), { on: hit.on, modifiers, secondsLeft: seconds }];
      dirty.add(p.team);
    }
  }
  for (const team of dirty) refreshBoosts(world, team);
}

/** The names of the conditional items in force for a team right now, for the screen. */
export function activeLabels(world: World, team: 0 | 1): string[] {
  return [...new Set(world.teams[team].active.map((m) => m.label ?? '').filter((label) => label !== ''))];
}
