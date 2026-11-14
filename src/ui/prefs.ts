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
}

export const DEFAULT_PREFS: Prefs = { sound: true, volume: 0.7, detail: 'full' };
export const VOLUME_STEPS = [0.2, 0.4, 0.7, 1];

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
