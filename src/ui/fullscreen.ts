/**
 * Getting the browser's address bar out of the way on a phone. A page cannot simply hide it. Where the
 * browser allows a page to go full screen (Android), the game asks on a touch; where it does not (an
 * iPhone), the only way is to add the game to the home screen and open it from there, and the game says so.
 */

export type ScreenPlan =
  /** Opened from the home screen, or already full screen: nothing to do. */
  | 'none'
  /** The browser can go full screen when asked on a touch. */
  | 'request'
  /** It cannot: tell the player to add the game to the home screen. */
  | 'hint';

/** What to do about the address bar, from what the browser is and can do. */
export function screenPlan(facts: { standalone: boolean; fullscreen: boolean; canRequest: boolean; touch: boolean }): ScreenPlan {
  if (facts.standalone || facts.fullscreen) return 'none';
  // A desktop browser has room for its address bar: leave it alone.
  if (!facts.touch) return 'none';
  return facts.canRequest ? 'request' : 'hint';
}

type Root = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

function facts(): { standalone: boolean; fullscreen: boolean; canRequest: boolean; touch: boolean } {
  const root = document.documentElement as Root;
  const standalone = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return {
    standalone,
    fullscreen: document.fullscreenElement !== null,
    canRequest: typeof root.requestFullscreen === 'function' && document.fullscreenEnabled !== false,
    touch: navigator.maxTouchPoints > 0,
  };
}

/** What applies on this device now. */
export function currentScreenPlan(): ScreenPlan {
  return screenPlan(facts());
}

/** Asks for full screen and, once there, for the screen to stay sideways. Only works from a touch or a click. */
export function goFullscreen(): void {
  const root = document.documentElement as Root;
  try {
    const asked = root.requestFullscreen?.({ navigationUI: 'hide' });
    void asked
      ?.then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> } | undefined)?.lock?.('landscape'))
      .catch(() => undefined);
  } catch {
    // Not allowed here: the address bar stays.
  }
}

/**
 * From now on, any touch while the phone is sideways and the address bar is showing takes the game full
 * screen (where the browser allows it). `wanted` is the player's setting, read each time.
 */
export function fullscreenOnTouch(wanted: () => boolean): void {
  const act = (): void => {
    if (!wanted()) return;
    if (currentScreenPlan() !== 'request') return;
    if (window.innerWidth < window.innerHeight) return;
    goFullscreen();
  };
  // The end of a touch and a click both count as the player's own act, which the browser insists on.
  window.addEventListener('touchend', act, { passive: true });
  window.addEventListener('click', act, { passive: true });
}
