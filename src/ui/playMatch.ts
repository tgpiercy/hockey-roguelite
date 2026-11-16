import type { GameResult } from '../sim/match';
import type { MatchOptions } from './matchView';
import { tellOffline } from './safety';

/**
 * The rink (and the drawing engine under it, most of the game's size) is not needed to show the menus, so
 * it is fetched apart from them: quietly once the menus are up, or at the latest when the first game
 * starts. `playMatch` here is the one the menus call; it waits for the rink if it is still on its way.
 */
let rink: Promise<typeof import('./matchView')> | null = null;

function load(): Promise<typeof import('./matchView')> {
  if (!rink) {
    rink = import('./matchView');
    // With the rink here the game is whole: the offline copy can be told what to keep.
    void rink.then(() => tellOffline()).catch(() => undefined);
  }
  // If the fetch fails (no connection, first visit), the next call tries again.
  rink.catch(() => {
    rink = null;
  });
  return rink;
}

/** Fetches the rink ahead of the first game, so that game starts at once. Safe to call more than once. */
export function preloadRink(): void {
  void load().catch(() => undefined);
}

/** Starts a game on the ice between two dressed teams; `onDone` is called with the result when the player leaves the summary. */
export function playMatch(options: MatchOptions, onDone: (result: GameResult) => void, onFail?: () => void): void {
  load()
    .then((m) => m.playMatch(options, onDone))
    .catch(() => {
      // No rink (no connection on a first visit, most likely): say so through the notice, which offers a reload.
      if (onFail) onFail();
      else window.dispatchEvent(new ErrorEvent('error', { message: 'The rink could not be loaded. Check your connection and reload.' }));
    });
}
