import type { WeeklyResult } from '../core/weekly';
/**
 * Preferences that belong to this device, not to the franchise: sound, volume and how much detail to draw.
 * They are kept apart from the save file, so importing a save does not change them.
 */
export interface Prefs {
  sound: boolean;
  /** 0 to 1. */
  volume: number;
  /** "low" drops skate marks, snow and crowd movement on the ice. */
  detail: 'full' | 'low';
  /** The on-screen controls: shown when the screen is touched ("auto"), always, or never. */
  touch: 'auto' | 'always' | 'never';
  /** On-screen reminders of the moves, shown during a game until each has been done a few times. */
  hints: boolean;
  /** Whether a goal is shown again in slow motion. */
  replays: boolean;
  /** Whether a touch takes the game full screen on a phone held sideways, hiding the browser's address bar (where the browser allows it). */
  fullscreen: boolean;
  /** Whether the controller (or the phone) shakes for hits, goals, posts and saves. */
  rumble: boolean;
  /** True: the puck is drawn larger, with a bright edge. */
  bigPuck: boolean;
  /** True to leave out the screen shake, the camera flashes in the crowd and the pulsing marks. */
  calm: boolean;
  /** True: you keep your skater until you press switch. False: control follows the puck to whoever of yours has it. */
  holdSwitch: boolean;
  /** Commentary during a game: none, a line of text, or the text read aloud as well. */
  commentary: 'off' | 'text' | 'voice';
  /** Music on the menus and at big moments, and how loud (0 to 1). */
  music: boolean;
  musicVolume: number;
}

export const DEFAULT_PREFS: Prefs = { sound: true, volume: 0.7, detail: 'full', touch: 'auto', hints: true, replays: true, holdSwitch: false, bigPuck: false, calm: false, rumble: true, fullscreen: true, commentary: 'text', music: true, musicVolume: 0.5 };
export const COMMENTARY_MODES: Prefs['commentary'][] = ['off', 'text', 'voice'];
export const COMMENTARY_NAMES: Record<Prefs['commentary'], string> = { off: 'Off', text: 'Text', voice: 'Text and voice' };
export const VOLUME_STEPS = [0.2, 0.4, 0.7, 1];
export const TOUCH_MODES: Prefs['touch'][] = ['auto', 'always', 'never'];

/**
 * Whether the on-screen controls show. Left to itself ("auto") they appear once the screen has been touched
 * and step aside when a controller or keyboard is in use.
 */
export function touchVisible(mode: Prefs['touch'], touched: boolean, padOrKeys: boolean): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return touched && !padOrKeys;
}

const KEY = 'hockey-prefs';

/** Reads preferences from stored text. Anything missing, broken or out of range falls back to the default. */
export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return { ...DEFAULT_PREFS };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return { ...DEFAULT_PREFS };
    const v = value as Record<string, unknown>;
    return {
      sound: typeof v.sound === 'boolean' ? v.sound : DEFAULT_PREFS.sound,
      volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.max(0, Math.min(1, v.volume)) : DEFAULT_PREFS.volume,
      detail: v.detail === 'low' || v.detail === 'full' ? v.detail : DEFAULT_PREFS.detail,
      touch: v.touch === 'auto' || v.touch === 'always' || v.touch === 'never' ? v.touch : DEFAULT_PREFS.touch,
      hints: typeof v.hints === 'boolean' ? v.hints : DEFAULT_PREFS.hints,
      replays: typeof v.replays === 'boolean' ? v.replays : DEFAULT_PREFS.replays,
      rumble: typeof v.rumble === 'boolean' ? v.rumble : DEFAULT_PREFS.rumble,
      fullscreen: typeof v.fullscreen === 'boolean' ? v.fullscreen : DEFAULT_PREFS.fullscreen,
      holdSwitch: typeof v.holdSwitch === 'boolean' ? v.holdSwitch : DEFAULT_PREFS.holdSwitch,
      bigPuck: typeof v.bigPuck === 'boolean' ? v.bigPuck : DEFAULT_PREFS.bigPuck,
      calm: typeof v.calm === 'boolean' ? v.calm : DEFAULT_PREFS.calm,
      commentary: v.commentary === 'off' || v.commentary === 'text' || v.commentary === 'voice' ? v.commentary : DEFAULT_PREFS.commentary,
      music: typeof v.music === 'boolean' ? v.music : DEFAULT_PREFS.music,
      musicVolume: typeof v.musicVolume === 'number' && Number.isFinite(v.musicVolume) ? Math.max(0, Math.min(1, v.musicVolume)) : DEFAULT_PREFS.musicVolume,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage is unavailable: the preference lasts until the page is closed.
  }
}

const HINTS_KEY = 'hockey-hints';

/** Reads how often each move has been done. Anything that is not a whole number of times is dropped. */
export function parseHintCounts(raw: string | null): Record<string, number> {
  if (raw === null) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const out: Record<string, number> = {};
    for (const [key, n] of Object.entries(value as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isInteger(n) && n > 0) out[key] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** Kept apart from the other preferences, so changing a setting in a menu can never wipe what was learned mid-game. */
export function loadHintCounts(): Record<string, number> {
  try {
    return parseHintCounts(localStorage.getItem(HINTS_KEY));
  } catch {
    return {};
  }
}

export function saveHintCounts(counts: Record<string, number>): void {
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify(counts));
  } catch {
    // Storage is unavailable: the counts last until the page is closed.
  }
}

/** The best weekly-run result on this device (for the latest week played), kept apart from the save. */
const WEEKLY_BEST = 'hockey-weekly';

export function loadWeeklyBest(): WeeklyResult | null {
  try {
    const raw = localStorage.getItem(WEEKLY_BEST);
    const value = raw === null ? null : (JSON.parse(raw) as Partial<WeeklyResult>);
    return value && typeof value.week === 'string' && typeof value.won === 'boolean' ? { week: value.week, won: value.won, wins: Number(value.wins) || 0, losses: Number(value.losses) || 0, strikes: Number(value.strikes) || 0 } : null;
  } catch {
    return null;
  }
}

export function saveWeeklyBest(result: WeeklyResult): void {
  try {
    localStorage.setItem(WEEKLY_BEST, JSON.stringify(result));
  } catch {
    // Storage may be unavailable; the best result is then simply not kept.
  }
}
