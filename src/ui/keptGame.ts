import { looksPacked, packWorld, unpackWorld, type PackedWorld } from '../sim/snapshot';
import type { World } from '../sim/types';
import { loadStored, store } from './storage';

/**
 * A season game in progress, kept on the device so that a locked phone, a switch to another app or a page
 * that reloads does not lose it. One game at a time, under its own key in the save store, apart from the save.
 */
const GAME_KEY = 'game';

interface Kept {
  /** Which game it is: the franchise, the season and the game's number. A different game waiting means this one is stale. */
  game: string;
  /** The build that wrote it. A game is only picked up by the build that kept it: the simulation may have changed. */
  build: string;
  world: PackedWorld;
}

/** The files this build is made of: on the built game their names change with every release. */
function buildId(): string {
  if (typeof document === 'undefined') return 'none';
  return [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src') ?? '').join('|') || 'dev';
}

/** Keeps the game as it stands. Failing to is not worth interrupting a game for. */
export function keepGame(game: string, world: World): void {
  try {
    const kept: Kept = { game, build: buildId(), world: structuredClone(packWorld(world)) };
    void store(kept, GAME_KEY).catch(() => undefined);
  } catch {
    // Nothing to do: the game goes on, unkept.
  }
}

/** The kept game, if it is this game and this build wrote it; otherwise null. */
export async function keptGame(game: string): Promise<World | null> {
  try {
    const kept = (await loadStored(GAME_KEY)) as Kept | null;
    if (!kept || kept.game !== game || kept.build !== buildId() || !looksPacked(kept.world)) return null;
    return unpackWorld(kept.world);
  } catch {
    return null;
  }
}

/** Forgets the kept game: it has been finished, given up or settled another way. */
export function dropGame(): void {
  void store(null, GAME_KEY).catch(() => undefined);
}
