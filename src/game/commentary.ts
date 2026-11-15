import { createRng, type Rng } from '../core/rng';
import data from '../data/commentary.json';
import type { SimEvent } from '../sim/types';

type Kind = keyof typeof data.lines;

/** One thing for the commentator to say, and how much it matters (a goal outranks a poke). */
export interface Call {
  kind: Kind;
  text: string;
  priority: number;
}

/** What the commentator needs to know to put names to events. */
export interface CallContext {
  /** A player's name by his id in the game, or null if he has none. */
  name: (playerId: number) => string | null;
  /** The two teams' names. */
  teams: [string, string];
  /** Each team's mascot's name, where it has one. */
  mascots?: [string | null, string | null];
  /** The score after the event. */
  score: [number, number];
}

/** "2-1 Gulls", or "tied at 2". */
export function scoreLine(score: [number, number], teams: [string, string]): string {
  if (score[0] === score[1]) return `Tied at ${score[0]}.`;
  const lead = score[0] > score[1] ? 0 : 1;
  return `${score[lead]}-${score[1 - lead]} ${teams[lead]}.`;
}

const priorityOf = (kind: Kind): number => (data.priority as Record<string, number>)[kind === 'goalAssist' ? 'goal' : kind === 'pullOn' || kind === 'pullOff' ? 'pull' : kind] ?? 1;

/** What an event is, as far as the commentary goes, with the names it needs; null if it is not worth a word. */
export function describe(e: SimEvent, ctx: CallContext): { kind: Kind; fill: Record<string, string> } | null {
  const named = (id: number | null | undefined): string | null => (id === null || id === undefined ? null : ctx.name(id));
  const score = scoreLine(ctx.score, ctx.teams);
  switch (e.type) {
    case 'goal': {
      const scorer = named(e.scorer);
      const helper = named(e.assists[0]);
      if (!scorer) return { kind: 'fire', fill: { team: ctx.teams[e.team] } };
      return helper ? { kind: 'goalAssist', fill: { name: scorer, assist: helper, score } } : { kind: 'goal', fill: { name: scorer, score } };
    }
    case 'save': {
      const goalie = named(e.goalie);
      return goalie ? { kind: e.frozen ? 'freeze' : 'save', fill: { name: goalie } } : null;
    }
    case 'check': {
      const who = named(e.player);
      if (!who || !e.success) return null;
      if (e.kind === 'body') return e.big ? { kind: 'bigHit', fill: { name: who } } : null;
      return { kind: 'poke', fill: { name: who } };
    }
    case 'post':
      return { kind: 'post', fill: {} };
    case 'shot': {
      const who = named(e.player);
      return who && e.oneTimer ? { kind: 'oneTimer', fill: { name: who } } : null;
    }
    case 'fake': {
      const who = named(e.player);
      return who ? { kind: 'fake', fill: { name: who } } : null;
    }
    case 'block': {
      const who = named(e.player);
      return who ? { kind: 'block', fill: { name: who } } : null;
    }
    case 'tip': {
      const who = named(e.player);
      return who ? { kind: 'tip', fill: { name: who } } : null;
    }
    case 'fire':
      return { kind: 'fire', fill: { team: ctx.teams[e.team] } };
    case 'pull':
      return { kind: e.on ? 'pullOn' : 'pullOff', fill: { team: ctx.teams[e.team] } };
    case 'period':
      return { kind: 'period', fill: { score } };
    case 'mascot':
      return { kind: e.arrived ? 'mascotOn' : 'mascotOff', fill: { name: ctx.mascots?.[e.team] ?? 'The mascot', team: ctx.teams[e.team] } };
    case 'final':
      return { kind: 'final', fill: { score } };
    default:
      return null;
  }
}

/**
 * Turns what happens on the ice into short lines. It picks the most important thing in each batch of
 * events, never says the same wording twice running for one kind of play, and keeps quiet for a moment
 * after each line unless something bigger happens.
 */
export class Commentator {
  private readonly rng: Rng;
  private readonly last = new Map<Kind, number>();
  private quietUntil = 0;
  private current = 0;

  constructor(seed: string) {
    this.rng = createRng(`${seed}/commentary`);
  }

  /** The line for these events at this time (seconds), or null to say nothing. */
  call(events: readonly SimEvent[], ctx: CallContext, now: number): Call | null {
    let best: { kind: Kind; fill: Record<string, string> } | null = null;
    for (const e of events) {
      const d = describe(e, ctx);
      if (d && (!best || priorityOf(d.kind) > priorityOf(best.kind))) best = d;
    }
    if (!best) return null;
    const priority = priorityOf(best.kind);
    // Still inside the last line: only something bigger may cut in.
    if (now < this.quietUntil && priority <= this.current) return null;

    const options = data.lines[best.kind];
    let index = this.rng.int(0, options.length - 1);
    if (options.length > 1 && index === this.last.get(best.kind)) index = (index + 1) % options.length;
    this.last.set(best.kind, index);
    const fill = best.fill;
    const text = (options[index] as string).replace(/\{(\w+)\}/g, (_, key: string) => fill[key] ?? '');
    this.quietUntil = now + data.minGapSeconds;
    this.current = priority;
    return { kind: best.kind, text, priority };
  }
}

export const COMMENTARY_SHOW_SECONDS = data.showSeconds;
