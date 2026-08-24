import type { Sighting } from '@/lib/types';

export type PushFn = (sighting: Sighting) => Promise<void>;

export interface DrainResult {
  synced: string[];
  failed: string[];
}

/**
 * Push every unsynced sighting through `push`, collecting ids that succeeded.
 * Failures are kept in the outbox for the next drain; one failure never blocks the rest.
 *
 * In the vertical slice there is no remote yet — the app calls this with a no-op pusher
 * once Supabase credentials exist (see supabase/README.md).
 */
export async function drainOutbox(unsynced: Sighting[], push: PushFn): Promise<DrainResult> {
  const synced: string[] = [];
  const failed: string[] = [];
  for (const sighting of unsynced) {
    try {
      await push(sighting);
      synced.push(sighting.id);
    } catch {
      failed.push(sighting.id);
    }
  }
  return { synced, failed };
}
