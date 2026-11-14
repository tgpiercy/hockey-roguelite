import data from '../data/ai.json';
import { createRng } from './rng';

export interface PlayStyle {
  id: string;
  name: string;
  /** One sentence for the player, shown before a game. */
  describe: string;
}

const styles = data.styles as Record<string, { name: string; describe: string }>;

/** Every style a team's AI can play. */
export const PLAY_STYLES: PlayStyle[] = Object.entries(styles).map(([id, s]) => ({ id, name: s.name, describe: s.describe }));

/** How a team likes to attack, from its name: the same team always plays the same way. */
export function playStyle(teamName: string): string {
  const ids = Object.keys(styles);
  return ids[createRng(`play-style/${teamName}`).int(0, ids.length - 1)] as string;
}

export function styleInfo(id: string | undefined): PlayStyle | null {
  return PLAY_STYLES.find((s) => s.id === id) ?? null;
}
