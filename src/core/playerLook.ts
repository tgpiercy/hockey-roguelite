import data from '../data/playerLook.json';
import type { MascotKind } from './mascotKind';
import { kindOf } from './playerKind';
import type { PlayerRecord } from './player';
import { portraitOf, type Beard, type FaceShape, type HairStyle } from './portrait';

/** How heavily a player is built: it changes his body on the ice, never his head. */
export type Build = 'slight' | 'regular' | 'heavy' | 'tall';
export const BUILDS = data.builds as Build[];

/**
 * What a player looks like on the ice. It is worked out from the player himself, so nothing is stored:
 * his skin, hair and beard are those of his menu portrait, and his build comes from the kind of player
 * he is. A sign (`mark`) is given by whoever dresses the team, not by the player.
 */
export interface PlayerLook {
  skin: string;
  hairColour: string;
  hair: HairStyle;
  beard: Beard;
  build: Build;
  /** The shape of his face, from his portrait: it shows as his jaw under the helmet. */
  face?: FaceShape;
  /** A captain's band, or a mascot's costume head. */
  mark?: 'captain' | 'mascot';
  /** Which costume a mascot wears. */
  costume?: MascotKind;
}

/** The build a player of this position and these ratings has. */
export function buildOf(player: Pick<PlayerRecord, 'position' | 'ratings'>): Build {
  if (player.position === 'G') return data.goalie as Build;
  const kind = kindOf(player.position, player.ratings).id;
  // A defenceman with no leaning of his own is a big man; a forward of the same kind is ordinary.
  if (player.position === 'D' && data.defenceKinds.includes(kind)) return data.defenceBuild as Build;
  return ((data.byKind as Record<string, string>)[kind] ?? data.fallback) as Build;
}

/** A player's look on the ice: the same every time for the same player at the same age. */
export function lookOf(player: Pick<PlayerRecord, 'id' | 'age' | 'position' | 'ratings'>): PlayerLook {
  const face = portraitOf(player.id, player.age);
  return { skin: face.skin, hairColour: face.hairColour, hair: face.hairStyle, beard: face.beard, build: buildOf(player), face: face.face };
}

/** A team's looks in the order it is dressed, with a captain's band on its best skater. */
export function teamLooks(players: readonly Pick<PlayerRecord, 'id' | 'age' | 'position' | 'ratings' | 'overall'>[]): PlayerLook[] {
  const skaters = players.filter((p) => p.position !== 'G');
  const captain = skaters.reduce<(typeof skaters)[number] | undefined>((best, p) => (!best || p.overall > best.overall ? p : best), undefined);
  return players.map((p) => ({ ...lookOf(p), ...(captain && p.id === captain.id ? { mark: 'captain' as const } : {}) }));
}
