import data from '../data/mascotLook.json';
import { createRng } from './rng';

/** The costume a club's mascot wears: which animal he is. */
export type MascotKind = keyof typeof data.kinds;

export const MASCOT_KINDS = Object.keys(data.kinds) as MascotKind[];

/** How a costume is drawn: its colours, and which ears, snout and tail it has. */
export interface MascotLook {
  /** What he is, as "a bear". */
  name: string;
  fur: string;
  muzzle: string;
  ears: 'round' | 'small' | 'pointed' | 'tufts' | 'crest' | 'antlers';
  snout: 'short' | 'long' | 'beak';
  tail: 'none' | 'bushy' | 'thick';
  /** Dark bands through the eyes, as a badger has. */
  stripe: boolean;
}

export function mascotLook(kind: MascotKind): MascotLook {
  return data.kinds[kind] as MascotLook;
}

/**
 * The costume of a club's mascot, worked out from the club's name and nothing stored: a club named for
 * an animal has that animal (the Owls an owl, the Foxes a fox); any other club has one picked by its name,
 * the same every time.
 */
export function mascotKind(teamName: string): MascotKind {
  const noun = teamName.trim().split(/\s+/).pop() ?? '';
  const named = (data.byNoun as Record<string, string>)[noun];
  if (named) return named as MascotKind;
  return createRng(`mascot-kind/${teamName}`).pick(data.others) as MascotKind;
}
