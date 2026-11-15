import data from '../data/ai.json';

/** How a team's AI skaters are told to play in each part of the game. The skaters a person controls do as they are told by him. */
export interface Tactics {
  /** They have the puck in their own end. */
  forecheck: 'press' | 'balanced' | 'sit';
  /** You have the puck. */
  attack: 'balanced' | 'rush' | 'cycle' | 'crash';
  /** They have the puck in your end. */
  defence: 'collapse' | 'balanced' | 'man';
}

export type TacticKind = keyof Tactics;

/** No leaning anywhere: the AI plays as it always has. */
export const BALANCED: Tactics = { forecheck: 'balanced', attack: 'balanced', defence: 'balanced' };

export interface TacticInfo {
  id: string;
  name: string;
  /** What it does and what it costs, for the player. */
  describe: string;
}

const table = data.tactics as unknown as Record<TacticKind, Record<string, { name: string; describe: string }>> & { kinds: Record<TacticKind, string> };

/** The three settings, in the order they are shown. */
export const TACTIC_KINDS: TacticKind[] = ['forecheck', 'attack', 'defence'];

/** What a setting is called on screen: "Forecheck", "Attack", "Defence". */
export function kindName(kind: TacticKind): string {
  return table.kinds[kind];
}

/** The choices for one setting, in order. */
export function choices(kind: TacticKind): TacticInfo[] {
  return Object.entries(table[kind]).map(([id, info]) => ({ id, name: info.name, describe: info.describe }));
}

export function tacticInfo(kind: TacticKind, id: string): TacticInfo {
  const all = choices(kind);
  return all.find((c) => c.id === id) ?? (all.find((c) => c.id === 'balanced') as TacticInfo);
}

/** The same tactics with one setting moved on to its next choice, coming round again after the last. */
export function nextTactic(tactics: Tactics, kind: TacticKind): Tactics {
  const all = choices(kind);
  const at = all.findIndex((c) => c.id === tactics[kind]);
  return { ...tactics, [kind]: (all[(at + 1) % all.length] as TacticInfo).id } as Tactics;
}

/** Reads stored tactics, falling back to balanced for anything missing or unknown. */
export function readTactics(value: unknown): Tactics {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const pick = <K extends TacticKind>(kind: K): Tactics[K] => (choices(kind).some((c) => c.id === v[kind]) ? (v[kind] as Tactics[K]) : BALANCED[kind]);
  return { forecheck: pick('forecheck'), attack: pick('attack'), defence: pick('defence') };
}

/** "Press · Cycle · Collapse". */
export function tacticsLine(tactics: Tactics): string {
  return TACTIC_KINDS.map((kind) => tacticInfo(kind, tactics[kind]).name).join(' · ');
}
