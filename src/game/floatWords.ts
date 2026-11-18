import look from '../data/rinkLook.json';
import type { SimEvent, World } from '../sim/types';

/**
 * Short words that rise from the play: a steal, a big hit, a block, a one-timer, a deke that slips a
 * check, a check that catches an unstoppable wind-up. Which word goes with which event is decided here;
 * the scene only draws them. Wordings are in rinkLook.json.
 */
export interface FloatWord {
  text: string;
  /** The player it rises from. */
  player: number;
  /** Which kind of word it is, which decides the colour of the burst behind it. */
  kind: FloatKind;
}

export type FloatKind = keyof typeof look.floatWords.texts;

const TEXTS = look.floatWords.texts;

/** The words for a batch of events, at most one for each event. */
export function wordsFor(events: readonly SimEvent[]): FloatWord[] {
  const out: FloatWord[] = [];
  for (const e of events) {
    if (e.type === 'check') {
      if (e.success && e.windUp) out.push({ text: TEXTS.denied, kind: 'denied', player: e.player });
      else if (e.success && e.big) out.push({ text: TEXTS.bigHit, kind: 'bigHit', player: e.player });
      else if (e.success && e.kind === 'poke') out.push({ text: TEXTS.stolen, kind: 'stolen', player: e.player });
      else if (e.evaded) out.push({ text: TEXTS.deked, kind: 'deked', player: e.target });
    } else if (e.type === 'block') {
      out.push({ text: TEXTS.blocked, kind: 'blocked', player: e.player });
    } else if (e.type === 'shot' && e.oneTimer) {
      // A one-timer with a defender on him says so: that is why it strayed.
      out.push(e.hurried ? { text: TEXTS.hurried, kind: 'hurried', player: e.player } : { text: TEXTS.oneTimer, kind: 'oneTimer', player: e.player });
    }
  }
  return out;
}

/**
 * The names of a team's conditional items that have come into force since `before` was noted:
 * a triggered boost that has just started, or a "while" condition that has just become true.
 * Returns the names now in force too, to be noted for next time.
 */
export function newlyInForce(world: World, team: 0 | 1, before: ReadonlySet<string>): { fresh: string[]; now: Set<string> } {
  const state = world.teams[team];
  const now = new Set<string>();
  for (const boost of state.boosts) if (boost.id.startsWith('when/')) now.add(boost.name);
  for (const m of state.active) if (m.label) now.add(m.label);
  return { fresh: [...now].filter((name) => !before.has(name)), now };
}
