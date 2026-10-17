import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'scubago.lastDiveDate';
/** A date picked this long ago still describes the trip being logged; after that, today is the better guess. */
const REMEMBER_MS = 12 * 60 * 60 * 1000;

/**
 * Remember the dive date the diver chose, so logging the rest of a trip from last week doesn't mean
 * picking the same date again for every dive. Best effort: storage failures are ignored.
 */
export async function rememberDiveDate(iso: string, today: string, now = Date.now()): Promise<void> {
  try {
    if (iso === today) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify({ iso, at: now }));
  } catch {
    // Not remembering is fine.
  }
}

/** The date chosen for the last log, if that was recent and wasn't simply today; otherwise null. */
export async function recentDiveDate(today: string, now = Date.now()): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const { iso, at } = JSON.parse(raw) as { iso: string; at: number };
    if (typeof iso !== 'string' || typeof at !== 'number' || now - at > REMEMBER_MS || iso > today) return null;
    return iso;
  } catch {
    return null;
  }
}
