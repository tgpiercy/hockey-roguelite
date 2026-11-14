import { cloneTuning, defaultTuning, type Tuning } from '../sim/tuning';

const STORAGE_KEY = 'hockey.tuning.v1';

type Groups = Record<string, Record<string, number>>;

export interface TuningEntry {
  group: string;
  key: string;
}

/** Every tunable value, in the order of src/data/physics.json. */
export const entries: TuningEntry[] = Object.entries(defaultTuning as Groups).flatMap(([group, values]) =>
  Object.keys(values).map((key) => ({ group, key })),
);

/** How much one press changes a value: a quarter of its order of magnitude (9.5 moves by 0.25, 28 by 2.5). */
function stepFor(defaultValue: number): number {
  const size = Math.abs(defaultValue);
  if (size === 0) return 0.05;
  return 10 ** Math.floor(Math.log10(size)) / 4;
}

const round = (value: number): number => Math.round(value * 10000) / 10000;

function loadSaved(): Tuning {
  const tuning = cloneTuning();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Groups;
    for (const { group, key } of entries) {
      const value = saved[group]?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) (tuning as Groups)[group]![key] = value;
    }
  } catch {
    // Nothing saved, or storage is unavailable: use the defaults.
  }
  return tuning;
}

/** The live tuning values plus the state of the panel that edits them. */
class TuningStore {
  tuning: Tuning = loadSaved();
  open = false;
  selected = 0;
  status = '';
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  private changed(save: boolean): void {
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tuning));
      } catch {
        // Storage unavailable: the values still apply until the page closes.
      }
    }
    for (const listener of this.listeners) listener();
  }

  value(entry: TuningEntry): number {
    return (this.tuning as Groups)[entry.group]![entry.key]!;
  }

  defaultValue(entry: TuningEntry): number {
    return (defaultTuning as Groups)[entry.group]![entry.key]!;
  }

  toggle(): void {
    this.open = !this.open;
    this.status = '';
    this.changed(false);
  }

  select(index: number): void {
    this.selected = (index + entries.length) % entries.length;
    this.changed(false);
  }

  /** Nudges a value up (1) or down (-1) by one step. Values never go below zero. */
  adjust(index: number, direction: 1 | -1): void {
    const entry = entries[index];
    if (!entry) return;
    const next = Math.max(0, round(this.value(entry) + direction * stepFor(this.defaultValue(entry))));
    (this.tuning as Groups)[entry.group]![entry.key] = next;
    this.selected = index;
    this.status = '';
    this.changed(true);
  }

  reset(): void {
    this.tuning = cloneTuning();
    this.status = 'Reset to defaults';
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
    this.changed(false);
  }

  json(): string {
    return `${JSON.stringify(this.tuning, null, 2)}\n`;
  }

  /** Copies the values to the clipboard and offers them as a physics.json download. */
  async exportJson(): Promise<void> {
    const text = this.json();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = 'physics.json';
    link.click();
    URL.revokeObjectURL(link.href);
    try {
      await navigator.clipboard.writeText(text);
      this.status = 'Copied, and saved as physics.json';
    } catch {
      this.status = 'Saved as physics.json';
    }
    this.changed(false);
  }
}

export const tuningStore = new TuningStore();
