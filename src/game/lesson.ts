import data from '../data/lessons.json';
import type { Drill } from '../sim/drill';
import type { SimEvent, World } from '../sim/types';

/**
 * The first skate: a handful of situations on the practice rink, each asking for one move a few times,
 * with a sentence of why. This file only keeps count; the scene sets each situation up and shows the words.
 */
export interface LessonStep {
  id: string;
  drill: Drill;
  /** How many times the move must be done. */
  need: number;
  say: string;
  why: string;
}

export const LESSON_STEPS = data.steps as LessonStep[];
export const LESSON_TIMING = { stageSeconds: data.stageSeconds, resetSeconds: data.resetSeconds, startStick: data.startStick, lineSize: data.lineSize, whySeconds: data.whySeconds, doneSeconds: data.doneSeconds };
export const LESSON_WORDS = { good: data.good, finished: data.finished };
export const LESSON_LEVEL = data.opponentLevel;

export interface Lesson {
  /** The step being asked for; past the last one, the lesson is over. */
  step: number;
  /** How often its move has been done. */
  count: number;
}

export function newLesson(): Lesson {
  return { step: 0, count: 0 };
}

export function lessonStep(lesson: Lesson): LessonStep | null {
  return LESSON_STEPS[lesson.step] ?? null;
}

export function lessonOver(lesson: Lesson): boolean {
  return lesson.step >= LESSON_STEPS.length;
}

/** How many times the step's move shows in what has just happened. `controlled` is the person's skater before the step. */
function doneNow(id: string, events: readonly SimEvent[], controlled: number, world: World): number {
  const human = world.human;
  if (!human) return 0;
  if (id === 'skate') return world.puck.carrier === human.controlled ? 1 : 0;
  let n = 0;
  for (const e of events) {
    if (id === 'shoot' && e.type === 'shot' && e.player === controlled) n += 1;
    else if (id === 'pass' && e.type === 'pass' && e.player === controlled && e.target !== null) n += 1;
    // A one-timer counts for whichever of his skaters lets it go: with hold switching the person may be the passer.
    else if (id === 'oneTimer' && e.type === 'shot' && e.oneTimer && world.players[e.player]?.team === human.team) n += 1;
    else if (id === 'poke' && e.type === 'check' && e.player === controlled && e.kind === 'poke' && e.success) n += 1;
    else if (id === 'body' && e.type === 'check' && e.player === controlled && e.kind === 'body' && e.success) n += 1;
  }
  return n;
}

/**
 * Counts what has just happened toward the step. Returns 'step' when the step is finished (the lesson has moved
 * on, or ended), 'progress' when its move was done but more are wanted, and 'none' otherwise.
 */
export function lessonAdvance(lesson: Lesson, events: readonly SimEvent[], controlled: number, world: World): 'none' | 'progress' | 'step' {
  const step = lessonStep(lesson);
  if (!step) return 'none';
  const n = doneNow(step.id, events, controlled, world);
  if (n === 0) return 'none';
  lesson.count += n;
  if (lesson.count < step.need) return 'progress';
  lesson.step += 1;
  lesson.count = 0;
  return 'step';
}

/** The line on the screen: where he is in the lesson, what to do, and how many are done of how many. */
export function lessonLine(lesson: Lesson): string {
  const step = lessonStep(lesson);
  if (!step) return LESSON_WORDS.finished;
  const tally = step.need > 1 ? `  ·  ${lesson.count}/${step.need}` : '';
  return `${lesson.step + 1} OF ${LESSON_STEPS.length}  ·  ${step.say}${tally}`;
}
