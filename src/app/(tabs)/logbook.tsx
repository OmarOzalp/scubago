import { useCallback, useMemo } from 'react';

import { bookLeaves } from '@/components/logbook/book';
import { Book } from '@/components/logbook/book-view';
import { Cover } from '@/components/logbook/cover';
import { speciesForSighting } from '@/lib/catalog';
import { useAppStore, useMyDives, useMySightings, useSiteById } from '@/lib/store';
import type { Dive, Species } from '@/lib/types';

/**
 * The diver's own log, as a book: the cover (totals, badges, the account and backup), then one page
 * per dive. It opens at the newest page; swipe right for older pages and the cover, or open Contents
 * for the list of every page.
 */
export default function LogbookScreen() {
  const user = useAppStore((s) => s.user);
  const dives = useMyDives();
  const mySightings = useMySightings();
  // Any site a page names, a hidden or retired one too (the list of sites on offer has only those listed).
  const siteById = useSiteById();
  const leaves = useMemo(() => bookLeaves(dives), [dives]);
  // The animals on each page, in the order they were logged.
  const speciesByDive = useMemo(() => {
    const map = new Map<string, Species[]>();
    for (const s of [...mySightings].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const species = s.diveId ? speciesForSighting(s) : undefined;
      if (!species || !s.diveId) continue;
      map.set(s.diveId, [...(map.get(s.diveId) ?? []), species]);
    }
    return map;
  }, [mySightings]);
  const siteName = useCallback((siteId: string) => siteById(siteId)?.name ?? 'Unknown site', [siteById]);
  const pending = useCallback((d: Dive) => !!user && !d.synced, [user]);

  return <Book leaves={leaves} cover={<Cover dives={dives} />} siteName={siteName} speciesByDive={speciesByDive} pending={pending} />;
}
