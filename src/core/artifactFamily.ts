import data from '../data/artifactLook.json';
import type { Modifier } from '../sim/modifiers';

/**
 * How an artifact is shown: the family it belongs to (what it mostly changes), and its condition in a
 * few words. Both are worked out from its modifiers, so a new artifact needs nothing more than its data.
 */
export type FamilyId = keyof typeof data.families;

export interface FamilyInfo {
  id: FamilyId;
  name: string;
  /** The name of the icon that stands for it. */
  icon: string;
  colour: string;
}

export const FAMILIES = Object.keys(data.families) as FamilyId[];

export function familyInfo(id: FamilyId): FamilyInfo {
  const f = data.families[id];
  return { id, name: f.name, icon: f.icon, colour: f.colour };
}

/** The family a stat belongs to, or null for one no family claims. */
export function familyOfStat(stat: string): FamilyId | null {
  return FAMILIES.find((id) => (data.families[id].stats as string[]).includes(stat)) ?? null;
}

/** An artifact's family: that of the first thing it changes that a family claims. */
export function familyOf(modifiers: readonly Modifier[]): FamilyId | null {
  for (const m of modifiers) {
    const family = familyOfStat(m.stat);
    if (family) return family;
  }
  return null;
}

/** The moments an artifact's modifiers depend on, in a few words each, without repeats: "While trailing", "After a save". */
export function conditionWords(modifiers: readonly Modifier[]): string[] {
  const out: string[] = [];
  for (const m of modifiers) {
    const words = m.when !== undefined ? (data.when as Record<string, string>)[m.when] : m.on !== undefined ? (data.on as Record<string, string>)[m.on] : undefined;
    if (words && !out.includes(words)) out.push(words);
  }
  return out;
}
