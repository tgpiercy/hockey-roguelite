import { downloadText, loadStored } from './storage';

/**
 * What protects the game and the save: an offline copy of the game, a record of when the save was last
 * exported, storage the browser is asked not to clear, and a notice (never a blank screen) when something
 * goes wrong. The parts that decide things are plain functions, tested in tests/safety.test.ts.
 */

const EXPORTED_KEY = 'hockey-exported';
/** The copy of the save kept from the start of the season, beside the save itself. */
export const BACKUP_KEY = 'backup';
/** How many days may pass before the game says the save should be exported again. */
export const BACKUP_DAYS = 14;

/** True if the save has never been exported, or not for `days` days. */
export function backupDue(lastExport: string | null, now: number, days: number = BACKUP_DAYS): boolean {
  if (!lastExport) return true;
  const then = Date.parse(lastExport);
  return Number.isNaN(then) || now - then > days * 24 * 60 * 60 * 1000;
}

/** When the save was last exported, in words. */
export function backupWords(lastExport: string | null, now: number): string {
  if (!lastExport || Number.isNaN(Date.parse(lastExport))) return 'never exported';
  const days = Math.floor((now - Date.parse(lastExport)) / (24 * 60 * 60 * 1000));
  return days <= 0 ? 'exported today' : days === 1 ? 'exported yesterday' : `exported ${days} days ago`;
}

export function lastExport(): string | null {
  try {
    return localStorage.getItem(EXPORTED_KEY);
  } catch {
    return null;
  }
}

export function noteExported(when: string): void {
  try {
    localStorage.setItem(EXPORTED_KEY, when);
  } catch {
    // Storage is unavailable: the reminder simply stays.
  }
}

/** Errors that are not the game going wrong: the browser refusing sound before a press, a cancelled load, a layout note. */
export function isBenign(message: string): boolean {
  return /ResizeObserver|NotAllowedError|AbortError|play\(\) request|The user aborted|Script error\.?$/i.test(message);
}

/** Asks the browser to keep the save through its own clean-ups. Resolves to whether it agreed (false where it cannot be asked). */
export async function protectStorage(): Promise<boolean> {
  try {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return false;
    if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** True if the browser has agreed to keep the save. */
export async function storageProtected(): Promise<boolean> {
  try {
    return typeof navigator.storage?.persisted === 'function' ? await navigator.storage.persisted() : false;
  } catch {
    return false;
  }
}

/**
 * Keeps an offline copy of the game: registers the worker (sw.js) and, once the page has loaded, tells it
 * every file the page is made of. Only on the built game: in development files change under it.
 */
export function keepOffline(base: string, production: boolean): void {
  if (!production || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${base}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const here = new URL(base, location.href).href;
        const urls = new Set<string>([here, `${here}manifest.webmanifest`]);
        for (const entry of performance.getEntriesByType('resource')) if (entry.name.startsWith(here)) urls.add(entry.name);
        for (const el of document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]')) {
          const url = 'src' in el ? el.src : el.href;
          if (url.startsWith(here)) urls.add(url);
        }
        registration.active?.postMessage({ type: 'keep', urls: [...urls] });
      })
      .catch(() => undefined);
  });
}

let shown = false;

/**
 * If something goes wrong, says so in a bar across the top instead of leaving a blank or frozen screen,
 * and offers the save as a file, a reload, or to carry on. Shown once; errors that are not the game's
 * are ignored. Built from plain elements, so it works even if the menus themselves have failed.
 */
export function watchForCrashes(): void {
  const report = (message: string): void => {
    if (shown || isBenign(message)) return;
    shown = true;
    const bar = document.createElement('div');
    bar.id = 'crash';
    bar.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = 'Something went wrong. Your save is kept after every move; you can take a copy of it now.';
    const button = (label: string, act: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', act);
      return b;
    };
    bar.append(
      text,
      button('Save a copy', () => {
        void loadStored().then((save) => {
          if (save) downloadText('hockey-save.json', `${JSON.stringify(save, null, 2)}\n`);
        });
      }),
      button('Reload', () => location.reload()),
      button('Carry on', () => bar.remove()),
    );
    const detail = document.createElement('small');
    detail.textContent = message.slice(0, 200);
    bar.append(detail);
    document.body.append(bar);
  };
  window.addEventListener('error', (event) => report(event.message || String(event.error ?? 'error')));
  window.addEventListener('unhandledrejection', (event) => report(String((event.reason as { message?: string } | undefined)?.message ?? event.reason ?? 'error')));
}
