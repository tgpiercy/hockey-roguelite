import data from '../data/voice.json';
import { createRng } from './rng';

/**
 * The club's two voices: the town's paper, which prints the news, and the radio announcer, who has a
 * line before each game. Neither invents anything: each line is picked from the wordings in voice.json
 * by what the season already knows (a streak, a rival, a boss, the books, a veteran in the lineup).
 */

export type ContextId = keyof typeof data.contexts;
export const CONTEXTS = Object.keys(data.contexts) as ContextId[];
export const TAGLINE = data.tagline;
export const THRESHOLDS = data.thresholds;

/** The town a team is from: every team name is a town and then a noun ("Redcliff Miners", "Marlow Bay Badgers"). */
export function townOf(teamName: string): string {
  const words = teamName.split(' ');
  return words.length > 1 ? words.slice(0, -1).join(' ') : teamName;
}

/** The town's paper: the same club always has the same one. */
export function paperName(teamName: string): string {
  return `The ${townOf(teamName)} ${createRng(`paper/${teamName}`).pick(data.papers)}`;
}

/** The club's radio announcer: the same club always has the same one. */
export function announcerName(teamName: string): string {
  const rng = createRng(`announcer/${teamName}`);
  return `${rng.pick(data.announcers.first)} ${rng.pick(data.announcers.last)}`;
}

/** What a line may need filling in. Anything a context does not use is left out. */
export interface VoiceFacts {
  team: string;
  town: string;
  n?: number;
  rival?: string;
  boss?: string;
  person?: string;
  role?: string;
  player?: string;
  age?: number;
  goals?: number;
}

/** One thing the season has to say right now, with what its lines need. Most pressing first when listed. */
export interface Context {
  id: ContextId;
  facts: VoiceFacts;
}

/** A line for a context, fixed by the label (so the same game always gets the same line), with its blanks filled. */
export function lineFor(context: Context, label: string): string {
  const lines = data.contexts[context.id];
  const line = createRng(`voice/${label}/${context.id}`).pick(lines);
  return fill(line, context.facts);
}

function fill(line: string, facts: VoiceFacts): string {
  return line.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = (facts as unknown as Record<string, string | number | undefined>)[key];
    return value === undefined ? '' : String(value);
  });
}

/** The announcer's line: one of his habits of speech now and then, and the line. */
export function announcerLine(context: Context, label: string): string {
  const lines = data.contexts[context.id];
  const template = createRng(`voice/${label}/${context.id}`).pick(lines);
  const line = fill(template, context.facts);
  const rng = createRng(`voice/${label}/habit`);
  // About one line in three starts with one of his turns of phrase. A line that opens on a name or a number keeps its capital.
  if (!rng.chance(0.34)) return line;
  const habit = rng.pick(data.habits);
  return template.startsWith('{') ? `${habit} ${line}` : `${habit} ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

/** Every blank a context's lines use, for checking that a context is given what it needs. */
export function blanksOf(id: ContextId): string[] {
  const found = new Set<string>();
  for (const line of data.contexts[id]) for (const m of line.matchAll(/\{(\w+)\}/g)) found.add(m[1] as string);
  return [...found];
}
