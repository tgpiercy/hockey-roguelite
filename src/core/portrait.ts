import data from '../data/portraits.json';
import { createRng, type Rng } from './rng';

export type HairStyle = 'short' | 'buzz' | 'flow' | 'curly' | 'side' | 'bald';
export type FaceShape = 'round' | 'square' | 'long';
export type Brows = 'flat' | 'arched' | 'heavy';
export type Beard = 'none' | 'stubble' | 'full' | 'moustache';

/** What a player looks like. Worked out from his id, so he always looks the same. */
export interface Portrait {
  skin: string;
  hairColour: string;
  hairStyle: HairStyle;
  face: FaceShape;
  brows: Brows;
  beard: Beard;
  eyeColour: string;
}

function weighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let roll = rng.next() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

/**
 * A player's face from his id and his age. Everything but the grey is fixed for life:
 * past his early thirties his hair may turn grey, likelier each year, and once grey it stays grey.
 * The youngest players have no beard yet.
 */
export function portraitOf(playerId: string, age: number): Portrait {
  const rng = createRng(`portrait/${playerId}`);
  const skin = rng.pick(data.skins);
  const natural = rng.pick(data.hairColours);
  const hairStyle = weighted(rng, data.hairStyles as HairStyle[], data.hairWeights);
  const face = rng.pick(data.faces) as FaceShape;
  const brows = rng.pick(data.brows) as Brows;
  const grownBeard = weighted(rng, data.beards as Beard[], data.beardWeights);
  const eyeColour = rng.pick(data.eyeColours);
  // One fixed number per player decides the age at which he goes grey, so it never flickers back.
  const greyAt = data.greyFromAge + Math.floor(rng.next() / data.greyChancePerYear);
  return {
    skin,
    hairColour: age >= greyAt ? data.greyHair : natural,
    hairStyle,
    face,
    brows,
    beard: age >= data.beardFromAge ? grownBeard : 'none',
    eyeColour,
  };
}
