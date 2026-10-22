import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the badges a diver has already seen are remembered: one record for each diver (or the device before sign-in). */
export const seenKey = (owner: string) => `scubago:badges-seen:v1:${owner}`;

/** The remembered ids, or null when there is no (valid) record: the diver is new here. */
export function parseSeen(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const { ids } = JSON.parse(raw) as { ids?: unknown };
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? (ids as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * Each record while a screen shows it, one copy for all of them: a badge celebrated on one screen is
 * seen on another still open under it. `ids` is null until the record has been read. A record nobody
 * shows is let go, and read again when a screen next opens.
 */
const records = new Map<string, { ids: readonly string[] | null; listeners: Set<() => void> }>();

/** The ids seen, as known now: null until the record has been read (or while no screen shows it). */
export function knownSeen(key: string): readonly string[] | null {
  return records.get(key)?.ids ?? null;
}

/** Calls `listener` whenever the record under `key` changes. */
export function subscribeSeen(key: string, listener: () => void): () => void {
  let record = records.get(key);
  if (!record) records.set(key, (record = { ids: null, listeners: new Set() }));
  record.listeners.add(listener);
  return () => {
    record.listeners.delete(listener);
    if (record.listeners.size === 0 && records.get(key) === record) records.delete(key);
  };
}

function put(key: string, ids: readonly string[] | null) {
  const record = records.get(key);
  if (!record || record.ids === ids) return;
  record.ids = ids;
  for (const listener of record.listeners) listener();
}

const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

// Reads and writes take turns, so a write never starts from a record read before another write landed.
let turn: Promise<unknown> = Promise.resolve();
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = turn.then(task);
  turn = run.catch(() => undefined);
  return run;
}

/** Writes `ids` together with whatever is stored already, so no write drops ids another made. */
async function write(key: string, ids: readonly string[]): Promise<void> {
  const stored = parseSeen(await AsyncStorage.getItem(key)) ?? [];
  const all = union(stored, ids);
  await AsyncStorage.setItem(key, JSON.stringify({ v: 1, ids: all }));
  const known = knownSeen(key);
  if (known && all.some((id) => !known.includes(id))) put(key, union(known, all));
}

/**
 * Reads the record under `key`, unless it is known already. With no record yet, `start()` gives the
 * ids to take as seen (what is earned already), or null to leave it unread for now.
 */
export function loadSeen(key: string, start: () => readonly string[] | null): Promise<void> {
  return inTurn(async () => {
    if (!records.has(key) || knownSeen(key)) return;
    let stored: string[] | null;
    try {
      stored = parseSeen(await AsyncStorage.getItem(key));
    } catch {
      // Storage is out of reach: take what is earned as seen, and celebrate what comes after.
      const now = start();
      if (now) put(key, now);
      return;
    }
    if (stored) return put(key, stored);
    const now = start();
    if (!now) return;
    put(key, now);
    await write(key, now);
  }).catch(() => {
    // Not remembering only means a badge may be celebrated twice.
  });
}

/** Records `ids` as seen: at once for every screen, and in storage in turn. Nothing until the record is known. */
export function addSeen(key: string, ids: readonly string[]): void {
  const before = knownSeen(key);
  if (!before) return;
  const next = union(before, ids);
  if (next.length === before.length) return;
  put(key, next);
  void inTurn(() => write(key, knownSeen(key) ?? next)).catch(() => {
    // Not remembering only means a badge may be celebrated twice.
  });
}
