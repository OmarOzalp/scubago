import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { earnedIds, newlyEarned, type BadgeResult } from '@/lib/rewards';

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

function save(key: string, ids: readonly string[]): Promise<void> {
  return AsyncStorage.setItem(key, JSON.stringify({ v: 1, ids })).catch(() => {
    // Not remembering only means a badge may be celebrated twice.
  });
}

/**
 * The badges to celebrate: earned, and not yet in what this diver has seen. The first time (no
 * record yet) it takes what is earned already as seen, quietly, so an existing logbook is not
 * celebrated all at once: open the screen that uses it before the dive is saved, so the record is
 * that of before. The record only ever grows: a badge, once seen, stays seen (see "Known
 * limitations" in docs/rewards.md).
 *
 * `markSeen()` records the badges now waiting; `markSeen(ids)` records those.
 */
export function useNewBadges({ owner, badges, ready }: { owner: string; badges: readonly BadgeResult[]; ready: boolean }) {
  const key = seenKey(owner);
  const [record, setRecord] = useState<{ key: string; ids: string[] } | null>(null);
  const ids = record?.key === key ? record.ids : null;

  // What the first run and `markSeen` read: the latest badges and record, whatever render made them.
  const latest = useRef({ key, ids, badges });
  useEffect(() => {
    latest.current = { key, ids, badges };
  });

  // Load this diver's record (once the log has loaded: an empty log has earned nothing yet).
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then(async (raw) => {
        if (cancelled) return;
        const stored = parseSeen(raw);
        if (stored) {
          setRecord({ key, ids: stored });
          return;
        }
        const now = earnedIds(latest.current.badges);
        setRecord({ key, ids: now });
        await save(key, now);
      })
      .catch(() => {
        // Storage is out of reach: take what is earned as seen, and celebrate what comes after.
        if (!cancelled) setRecord({ key, ids: earnedIds(latest.current.badges) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, ready]);

  const fresh = useMemo(() => (ids ? newlyEarned(ids, badges) : []), [ids, badges]);

  const markSeen = useCallback((seen?: readonly string[]) => {
    const { key: current, ids: before, badges: now } = latest.current;
    if (!before) return;
    const next = [...new Set([...before, ...(seen ?? newlyEarned(before, now).map((b) => b.id))])];
    if (next.length === before.length) return;
    latest.current = { key: current, ids: next, badges: now };
    setRecord({ key: current, ids: next });
    void save(current, next);
  }, []);

  return { fresh, markSeen, loaded: ids !== null };
}
