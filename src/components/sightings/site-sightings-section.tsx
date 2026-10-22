import { router } from 'expo-router';

import { RealSightingsView } from '@/components/sightings/real-sightings-view';
import { useSiteSightings } from '@/hooks/use-site-sightings';
import type { DiveSite } from '@/lib/types';

/**
 * A dive site's "Marine life recorded here": the real records near it, offline-first (the cached
 * copy shows at once, a stale one refreshes behind it). Takes the site so it can sit below the
 * page's early return without breaking the order of hooks.
 */
export function SiteSightingsSection({ site }: { site: DiveSite }) {
  const { summary, status, refresh } = useSiteSightings(site);
  return (
    <RealSightingsView
      summary={summary}
      status={status}
      onRefresh={refresh}
      hasCuratedSpecies={site.notableSpecies.length > 0}
      onOpenSpecies={(speciesId) => router.push(`/species/${speciesId}`)}
      onOpenCredits={() => router.push('/credits')}
    />
  );
}
