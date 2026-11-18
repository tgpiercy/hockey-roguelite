import data from '../data/lessons.json';
import type { Drill } from '../sim/drill';
import type { SimEvent, World } from '../sim/types';

/**
 * A skate: a handful of situations on the practice rink, each asking for one move a few times, with a
 * sentence of why. The first skate is the moves the game cannot be played without; the second is the ones
 * that come after. This file only keeps count; the scene sets each situation up and shows the words.
 */
export interface LessonStep {
  id: string;
  drill: Drill;
  /** How many times the move must be done. */
  need: number;
  /** What to do. `{move}`, `{shoot}`, `{pass}`, `{check}` and `{switch}` stand for the control, whatever is being played with. */
  say: string;
  why: string;
}

/** Which skate: the first, or the one for the later moves. */
export type LessonId = 'first' | 'second';
/** What is being played with, which decides how a control is named. */
export type Device = keyof typeof data.controls;

const SETS: Record<LessonId, { steps: LessonStep[]; finished: string }> = {
  first: { steps: data.steps as LessonStep[], finished: data.finished },
  second: { steps: data.second.steps as LessonStep[], finished: data.second.finished },
};

export const LESSON_STEPS = SETS.first.steps;
export const SECOND_STEPS = SETS.second.steps;
export const LESSON_TIMING = { stageSeconds: data.stageSeconds, resetSeconds: data.resetSeconds, startStick: data.startStick, lineSize: data.lineSize, whySeconds: data.whySeconds, doneSeconds: data.doneSeconds, slowScale: data.slowScale };
export const LESSON_WORDS = { good: data.good, finished: data.finished };
export const LESSON_LEVEL = data.opponentLevel;

export interface Lesson {
  which: LessonId;
  /** The step being asked for; past the last one, the lesson is over. */
  step: number;
  /** How often its move has been done. */
  count: number;
  /** Whether the thing a step waits for was already so last time it was looked at, for the steps that count a change. */
  was: boolean;
}

export function newLesson(which: LessonId = 'first'): Lesson {
  return { which, step: 0, count: 0, was: false };
}

export function lessonSteps(lesson: Lesson): LessonStep[] {
  return SETS[lesson.which].steps;
}

export function lessonStep(lesson: Lesson): LessonStep | null {
  return lessonSteps(lesson)[lesson.step] ?? null;
}

export function lessonOver(lesson: Lesson): boolean {
  return lesson.step >= lessonSteps(lesson).length;
}

/** True for a step that is easier to learn slowed down: time runs slower while the person's pass is on its way. */
export function slowStep(lesson: Lesson): boolean {
  const step = lessonStep(lesson);
  return step !== null && data.slowSteps.includes(step.id);
}

/**
 * How many times the step's move shows in what has just happened. `controlled` is the person's skater
 * before the step; `braced` is whether he is down to block now.
 */
function doneNow(lesson: Lesson, id: string, events: readonly SimEvent[], controlled: number, world: World, braced: boolean): number {
  const human = world.human;
  if (!human) return 0;
  if (id === 'skate') return world.puck.carrier === human.controlled ? 1 : 0;
  // Two moves show as something becoming so, not as an event: each counts once, when it starts.
  if (id === 'giveGo' || id === 'block') {
    const now = id === 'giveGo' ? human.giveGo !== null : braced;
    const started = now && !lesson.was;
    lesson.was = now;
    return started ? 1 : 0;
  }
  let n = 0;
  for (const e of events) {
    if (id === 'shoot' && e.type === 'shot' && e.player === controlled) n += 1;
    else if (id === 'saucer' && e.type === 'pass' && e.player === controlled && e.saucer && e.target !== null) n += 1;
    else if (id === 'pass' && e.type === 'pass' && e.player === controlled && e.target !== null) n += 1;
    // A one-timer counts for whichever of his skaters lets it go: with hold switching the person may be the passer.
    else if (id === 'oneTimer' && e.type === 'shot' && e.oneTimer && world.players[e.player]?.team === human.team) n += 1;
    else if (id === 'poke' && e.type === 'check' && e.player === controlled && e.kind === 'poke' && e.success) n += 1;
    else if (id === 'body' && e.type === 'check' && e.player === controlled && e.kind === 'body' && e.success) n += 1;
    else if (id === 'deke' && e.type === 'deke' && e.player === controlled) n += 1;
    else if (id === 'fake' && e.type === 'fake' && e.player === controlled) n += 1;
  }
  return n;
}

/**
 * Counts what has just happened toward the step. Returns 'step' when the step is finished (the lesson has moved
 * on, or ended), 'progress' when its move was done but more are wanted, and 'none' otherwise.
 */
export function lessonAdvance(lesson: Lesson, events: readonly SimEvent[], controlled: number, world: World, braced = false): 'none' | 'progress' | 'step' {
  const step = lessonStep(lesson);
  if (!step) return 'none';
  const n = doneNow(lesson, step.id, events, controlled, world, braced);
  if (n === 0) return 'none';
  lesson.count += n;
  if (lesson.count < step.need) return 'progress';
  lesson.step += 1;
  lesson.count = 0;
  lesson.was = false;
  return 'step';
}

/** A step's instruction with each control named as it is on what is being played with. */
export function sayFor(say: string, device: Device): string {
  const names = data.controls[device] as Record<string, string>;
  return say.replace(/\{(\w+)\}/g, (_, key: string) => names[key] ?? key.toUpperCase());
}

/** The line on the screen: where he is in the lesson, what to do, and how many are done of how many. */
export function lessonLine(lesson: Lesson, device: Device = 'pad'): string {
  const step = lessonStep(lesson);
  if (!step) return SETS[lesson.which].finished;
  const tally = step.need > 1 ? `  ·  ${lesson.count}/${step.need}` : '';
  return `${lesson.step + 1} OF ${lessonSteps(lesson).length}  ·  ${sayFor(step.say, device)}${tally}`;
}
