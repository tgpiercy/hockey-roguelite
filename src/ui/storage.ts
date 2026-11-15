const DB_NAME = 'hockey-roguelite';
const STORE = 'saves';
const KEY = 'franchise';
/** The weekly run is a save of its own. */
export const WEEKLY_KEY = 'weekly';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** The stored save as it was written, or null if there is none. It still has to go through the version check. */
export function loadStored(key: string = KEY): Promise<unknown> {
  return run<unknown>('readonly', (store) => store.get(key)).then((value) => value ?? null);
}

/** Writes the save, replacing the previous one. */
export function store(save: unknown, key: string = KEY): Promise<void> {
  return run('readwrite', (s) => s.put(save, key)).then(() => undefined);
}

/** Offers some text to the user as a file download. */
export function downloadText(filename: string, text: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Asks the user to pick a file and returns its text, or null if they cancel. */
export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then(resolve, () => resolve(null));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
