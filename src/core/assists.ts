import rules from '../data/season.json';
import type { Tuning } from '../sim/tuning';
import { difficultyInfo, type ActionResult, type Franchise } from './season';

/**
 * The help a person's team is given, as settings. There are four kinds (aim, pass, check, goalie), each set
 * to a step (full, part, off). Every difficulty names a step for each; the player may then change any of
 * them, and the choice stays until the difficulty is changed. A step is a share of the help's full strength
 * in `physics.json`, so everything here reaches the ice as four numbers on a copy of the tuning.
 */

export type AssistKind = 'aim' | 'pass' | 'check' | 'goalie';

export interface AssistStep {
  id: string;
  name: string;
  /** The share of the full help: 1, something between, or 0. */
  strength: number;
}

export interface AssistInfo {
  id: AssistKind;
  name: string;
  /** What the help does, in a sentence. */
  what: string;
  /** The steps it can be set to, most help first. */
  steps: string[];
}

export const ASSISTS = rules.assists.kinds as AssistInfo[];
export const ASSIST_STEPS = rules.assists.steps as AssistStep[];

const stepInfo = (id: string): AssistStep => ASSIST_STEPS.find((s) => s.id === id) ?? (ASSIST_STEPS[0] as AssistStep);

/** The step a difficulty sets a kind of help to. */
export function presetStep(difficulty: string, kind: AssistKind): string {
  const preset = (difficultyInfo(difficulty) as { assists?: Partial<Record<AssistKind, string>> }).assists ?? {};
  const wanted = preset[kind] ?? (ASSIST_STEPS[0] as AssistStep).id;
  return assistOf(kind).steps.includes(wanted) ? wanted : (assistOf(kind).steps[0] as string);
}

function assistOf(kind: AssistKind): AssistInfo {
  return ASSISTS.find((a) => a.id === kind) as AssistInfo;
}

/** The step each kind of help is at for this franchise: its own choice where it has made one, the difficulty's otherwise. */
export function assistSteps(f: Franchise): Record<AssistKind, AssistStep> {
  const out = {} as Record<AssistKind, AssistStep>;
  for (const a of ASSISTS) {
    const own = f.assists?.[a.id];
    out[a.id] = stepInfo(own !== undefined && a.steps.includes(own) ? own : presetStep(f.difficulty, a.id));
  }
  return out;
}

/** The same as numbers: the share of each help's full strength. This is what a game is given. */
export function assistStrengths(f: Franchise): Record<AssistKind, number> {
  const steps = assistSteps(f);
  return { aim: steps.aim.strength, pass: steps.pass.strength, check: steps.check.strength, goalie: steps.goalie.strength };
}

/** True if any help is set away from what the difficulty gives. */
export function assistsChanged(f: Franchise): boolean {
  return ASSISTS.some((a) => f.assists?.[a.id] !== undefined && f.assists[a.id] !== presetStep(f.difficulty, a.id));
}

/** Sets one kind of help to a step. Setting it to the difficulty's own step forgets the choice. */
export function setAssist(f: Franchise, kind: AssistKind, step: string): ActionResult {
  const info = ASSISTS.find((a) => a.id === kind);
  if (!info) return { ok: false, reason: 'There is no such help.' };
  if (!info.steps.includes(step)) return { ok: false, reason: 'It cannot be set to that.' };
  const own = { ...(f.assists ?? {}) };
  if (step === presetStep(f.difficulty, kind)) delete own[kind];
  else own[kind] = step;
  if (Object.keys(own).length > 0) f.assists = own;
  else delete f.assists;
  return { ok: true, message: `${info.name}: ${stepInfo(step).name}.` };
}

/** The next step for a kind of help, round and round: what a press on its row does. */
export function nextAssistStep(f: Franchise, kind: AssistKind): string {
  const steps = assistOf(kind).steps;
  return steps[(steps.indexOf(assistSteps(f)[kind].id) + 1) % steps.length] as string;
}

/** Back to what the difficulty gives. */
export function resetAssists(f: Franchise): ActionResult {
  delete f.assists;
  return { ok: true, message: `Help is as ${difficultyInfo(f.difficulty).name} sets it.` };
}

/** A copy of the tuning with each help at its share of full strength. The tuning given is left alone. */
export function assistTuning(t: Tuning, strengths: Record<AssistKind, number>): Tuning {
  return {
    ...t,
    aimAssist: { ...t.aimAssist, strength: t.aimAssist.strength * strengths.aim },
    passAssist: { ...t.passAssist, strength: t.passAssist.strength * strengths.pass },
    checkAssist: { ...t.checkAssist, strength: t.checkAssist.strength * strengths.check },
    goalieAssist: { ...t.goalieAssist, strength: t.goalieAssist.strength * strengths.goalie },
  };
}

/** One line for a list: "Aim full · Pass full · Check part · Goalie off". */
export function assistLine(f: Franchise): string {
  const steps = assistSteps(f);
  return ASSISTS.map((a) => `${a.name.replace(/^Your /, '')} ${steps[a.id].name.toLowerCase()}`).join(' · ');
}
