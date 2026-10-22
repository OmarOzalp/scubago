import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { addSeen, knownSeen, loadSeen, seenKey, subscribeSeen } from '@/lib/badges-seen';
import { earnedIds, newlyEarned, type BadgeResult } from '@/lib/rewards';

/**
 * The badges to celebrate: earned, and not yet in what this diver has seen. The first time (no
 * record yet) it takes what is earned already as seen, quietly, so an existing logbook is not
 * celebrated all at once: open the screen that uses it before the dive is saved, so the record is
 * that of before. The record only ever grows: a badge, once seen, stays seen (see "Known
 * limitations" in docs/rewards.md). Every screen open shares one record (src/lib/badges-seen.ts).
 *
 * `markSeen()` records the badges now waiting; `markSeen(ids)` records those.
 */
export function useNewBadges({ owner, badges, ready }: { owner: string; badges: readonly BadgeResult[]; ready: boolean }) {
  const key = seenKey(owner);
  const subscribe = useCallback((listener: () => void) => subscribeSeen(key, listener), [key]);
  const ids = useSyncExternalStore(subscribe, () => knownSeen(key));

  // What the first run and `markSeen` read: the latest badges, whatever render made them.
  const latest = useRef({ key, badges });
  useEffect(() => {
    latest.current = { key, badges };
  });

  // Load this diver's record (once the log has loaded: an empty log has earned nothing yet).
  const known = ids !== null;
  useEffect(() => {
    if (!ready || known) return;
    let cancelled = false;
    void loadSeen(key, () => (cancelled ? null : earnedIds(latest.current.badges)));
    return () => {
      cancelled = true;
    };
  }, [key, ready, known]);

  const fresh = useMemo(() => (ids ? newlyEarned(ids, badges) : []), [ids, badges]);

  const markSeen = useCallback((seen?: readonly string[]) => {
    const { key: current, badges: now } = latest.current;
    const before = knownSeen(current);
    if (before) addSeen(current, seen ?? newlyEarned(before, now).map((b) => b.id));
  }, []);

  return { fresh, markSeen, loaded: known };
}
