import type { OceanFiles } from '@/lib/ocean-store';

/**
 * The saved oceans (src/lib/ocean-store.ts) in a browser: IndexedDB, one record a file (and a small one beside it saying when it was
 * written, so tidying never has to load the files). Where IndexedDB is not there or is refused (a private window, blocked site data) every
 * call fails and the store works the ocean out in memory only, as it always did.
 */
const DATABASE = 'scubago-ocean', BYTES = 'bytes', WHEN = 'when';

let opening: Promise<IDBDatabase> | null = null;
function open() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(BYTES); request.result.createObjectStore(WHEN); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((error) => { opening = null; throw error; });
  return opening;
}

/** One transaction over both stores; resolves with what `use` leaves in `result` once it has completed. */
async function transact<T>(mode: IDBTransactionMode, use: (bytes: IDBObjectStore, when: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction([BYTES, WHEN], mode);
    const request = use(transaction.objectStore(BYTES), transaction.objectStore(WHEN));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const oceanFiles: OceanFiles = {
  async read(name) {
    const found = await transact<ArrayBuffer | Uint8Array | undefined>('readonly', (bytes) => bytes.get(name));
    return found ? (found instanceof Uint8Array ? found : new Uint8Array(found)) : null;
  },
  async write(name, bytes) {
    // (a copy of exactly the file's bytes: the array may be a view of a larger buffer)
    await transact('readwrite', (store, when) => { when.put(Date.now(), name); return store.put(bytes.slice().buffer, name); });
  },
  async remove(name) {
    await transact('readwrite', (store, when) => { when.delete(name); return store.delete(name); });
  },
  async list() {
    const db = await open();
    return new Promise<{ name: string; at: number }[]>((resolve, reject) => {
      const found: { name: string; at: number }[] = [];
      const request = db.transaction(WHEN, 'readonly').objectStore(WHEN).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { found.push({ name: String(cursor.key), at: Number(cursor.value) }); cursor.continue(); } else resolve(found);
      };
      request.onerror = () => reject(request.error);
    });
  },
};
