import { useMemo, useState } from 'react';

import { SITES_BY_ID } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateRewards, type Rewards } from '@/lib/rewards';
import { useAllSites, useAppStore, useMyDives, useMySightings } from '@/lib/store';
import type { Rarity } from '@/lib/types';

/**
 * Rarity tiers from real records near particular sites, by species id, to override the catalog's.
 * None yet: the catalog's own rarity already comes from real records worldwide once they have been
 * fetched (`CATALOG` in catalog.ts, docs/real-rarity.md), and per-region tiers would be returned here.
 */
function useObservedRarity(): ReadonlyMap<string, Rarity> | undefined {
  return undefined;
}

/**
 * The same list, as the same array while its items are the same. The store hooks filter on every
 * render, so without this a memo keyed on their result would never hold.
 */
function useSameList<T>(list: readonly T[]): readonly T[] {
  const [kept, setKept] = useState(list);
  const same = kept.length === list.length && kept.every((item, i) => item === list[i]);
  if (!same) setKept(list);
  return same ? kept : list;
}

/**
 * The diver's rewards: badges, collections, passport and islands, worked out from their own
 * sightings and dives (demo data is not theirs, so it never counts) and every site that can be
 * named. `ready` is false until the log has loaded: until then the rewards are those of an empty
 * log, so a screen waits rather than showing them.
 */
export function useRewards(): Rewards & { ready: boolean } {
  const ready = useAppStore((s) => s.ready);
  const sightings = useSameList(useMySightings());
  const dives = useSameList(useMyDives());
  const allSites = useSameList(useAllSites());
  const observed = useObservedRarity();
  // Every site by id, retired imported ones too, so a visit to one still counts.
  const sites = useMemo(() => new Map([...SITES_BY_ID, ...allSites.map((site) => [site.id, site] as const)]), [allSites]);
  const rewards = useMemo(
    () => evaluateRewards({ sightings, dives, sites, catalog: CATALOG_BY_ID, observed }),
    [sightings, dives, sites, observed],
  );
  return useMemo(() => ({ ...rewards, ready }), [rewards, ready]);
}
