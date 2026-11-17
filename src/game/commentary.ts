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
  /** True in overtime: a goal then is the winner. */
  overtime?: boolean;
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
    case 'whiff':
      return null;
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

/** What a goal means for the score: which kind of moment it is. */
export type Moment = keyof typeof data.goal.moment;

/**
 * The moment a goal makes, from the score after it, who scored, how many that scorer now has, and whether
 * it is overtime: the winner, a hat-trick, the first goal, a tie, a lead taken, a deficit cut to one, or nothing special.
 */
export function momentOf(after: [number, number], team: 0 | 1, scorerGoals: number, overtime: boolean): Moment {
  const mine = after[team];
  const theirs = after[1 - team] as number;
  if (overtime) return 'winner';
  if (scorerGoals === 3) return 'hatTrick';
  if (mine + theirs === 1) return 'first';
  if (mine === theirs) return 'ties';
  if (mine === theirs + 1) return 'ahead';
  if (mine === theirs - 1) return 'within';
  return 'plain';
}

const fillIn = (line: string, fill: Record<string, string>): string => line.replace(/\{(\w+)\}/g, (_, key: string) => fill[key] ?? '');

/**
 * Turns what happens on the ice into short lines. It picks the most important thing in each batch of
 * events, never says the same wording twice running for one kind of play, and keeps quiet for a moment
 * after each line unless something bigger happens. A goal's line is put together from parts: how it went
 * in, who set it up, and what it does to the score. A few lines are said only once a game, and in a game
 * that is no longer close only the big things are called.
 */
export class Commentator {
  private readonly rng: Rng;
  private readonly last = new Map<string, number>();
  private readonly said = new Set<string>();
  private readonly goals = new Map<number, number>();
  private quietUntil = 0;
  private current = 0;
  /** How the last shot was taken, for the goal or the save that follows it. */
  private shot: 'plain' | 'oneTimer' | 'tip' = 'plain';

  constructor(seed: string) {
    this.rng = createRng(`${seed}/commentary`);
  }

  /** One of a list, never the one said last from the same list. */
  private pick(list: string, options: readonly string[]): string {
    let index = this.rng.int(0, options.length - 1);
    if (options.length > 1 && index === this.last.get(list)) index = (index + 1) % options.length;
    this.last.set(list, index);
    return options[index] as string;
  }

  /** A goal's line: how it went in, then either what it means, or who set it up and the score. */
  private goalText(e: Extract<SimEvent, { type: 'goal' }>, ctx: CallContext, fill: Record<string, string>): string {
    const count = e.scorer === null ? 0 : (this.goals.get(e.scorer) ?? 0);
    const moment = momentOf(ctx.score, e.team, count, ctx.overtime === true);
    const all = { ...fill, team: ctx.teams[e.team], n: String(ctx.score[e.team]) };
    const how = fillIn(this.pick(`how/${this.shot}`, data.goal.how[this.shot]), all);
    const means = fillIn(this.pick(`moment/${moment}`, data.goal.moment[moment]), all);
    // A moment worth naming is named; otherwise there is room for whoever made the pass.
    const from = moment === 'plain' && fill.assist !== undefined && this.rng.chance(data.assistChance) ? ` ${fillIn(this.pick('from', data.goal.from), all)}` : '';
    return `${how}${from} ${means}`;
  }

  /** The line for these events at this time (seconds), or null to say nothing. */
  call(events: readonly SimEvent[], ctx: CallContext, now: number): Call | null {
    let best: { kind: Kind; fill: Record<string, string> } | null = null;
    let bestEvent: SimEvent | null = null;
    let shotBefore = this.shot;
    for (const e of events) {
      // How the puck was last sent at the net, and how many each scorer has, are noted whatever is said.
      if (e.type === 'shot') this.shot = e.oneTimer ? 'oneTimer' : 'plain';
      else if (e.type === 'tip') this.shot = 'tip';
      else if (e.type === 'goal' && e.scorer !== null) this.goals.set(e.scorer, (this.goals.get(e.scorer) ?? 0) + 1);
      const d = describe(e, ctx);
      if (d && (!best || priorityOf(d.kind) > priorityOf(best.kind))) {
        best = d;
        bestEvent = e;
        shotBefore = this.shot;
      }
      // Once it is stopped or picked up, whatever comes next is a new shot.
      if (e.type === 'save' || e.type === 'pickup') this.shot = 'plain';
    }
    if (!best || !bestEvent) return null;
    const priority = priorityOf(best.kind);
    // Still inside the last line: only something bigger may cut in.
    if (now < this.quietUntil && priority <= this.current) return null;
    // A game that is no longer close: only the big things are called.
    if (Math.abs(ctx.score[0] - ctx.score[1]) >= data.quietMargin && priority < data.quietBelow) return null;
    // The small things are not called every time.
    const often = (data.sayChance as Record<string, number>)[best.kind];
    if (often !== undefined && !this.rng.chance(often)) return null;

    const fill = best.fill;
    let text: string;
    if (bestEvent.type === 'goal' && bestEvent.scorer !== null && fill.name !== undefined) {
      this.shot = shotBefore;
      text = this.goalText(bestEvent, ctx, fill);
      this.shot = 'plain';
    } else {
      // A save from a one-timer has words of its own; and a few lines are kept to be said once a game.
      const kind: Kind = best.kind === 'save' && shotBefore === 'oneTimer' ? 'saveOneTimer' : best.kind;
      const once = ((data.once as Record<string, string[]>)[kind] ?? []).filter((line) => !this.said.has(line));
      if (once.length > 0 && this.rng.chance(data.onceChance)) {
        const line = once[this.rng.int(0, once.length - 1)] as string;
        this.said.add(line);
        text = fillIn(line, fill);
      } else {
        text = fillIn(this.pick(kind, data.lines[kind]), fill);
      }
    }
    this.quietUntil = now + data.minGapSeconds;
    this.current = priority;
    return { kind: best.kind, text, priority };
  }
}

export const COMMENTARY_SHOW_SECONDS = data.showSeconds;
