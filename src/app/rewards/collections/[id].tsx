import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { CollectionDetailView } from '@/components/rewards/collection-detail';
import { EmptyState } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { COLLECTIONS } from '@/lib/rewards';
import { useMySightings } from '@/lib/store';

/** The web build pre-renders a page for every collection. */
export function generateStaticParams(): { id: string }[] {
  return COLLECTIONS.map((c) => ({ id: c.id }));
}

/** One collection in full: the animals found and the ones still to find. */
export default function CollectionRoute() {
  return (
    <WhenReady>
      <CollectionScreen />
    </WhenReady>
  );
}

function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { collections } = useRewards();
  const sightings = useMySightings();
  const collection = collections.find((c) => c.id === id);
  // How often the diver has logged each animal, for the plates ("seen 3 times").
  const counts = useMemo(() => new Map(deriveDex(sightings, CATALOG_BY_ID).map((entry) => [entry.species.id, entry.count])), [sightings]);
  if (!collection) {
    return (
      <Screen>
        <EmptyState icon="fieldGuide" title="Collection not found." />
      </Screen>
    );
  }
  return (
    <>
      {/* The page has its own large title, so the header is the back arrow alone (the title stays the page's name). */}
      <Stack.Screen options={{ title: collection.title, headerTitle: '' }} />
      <Screen>
        <CollectionDetailView collection={collection} counts={counts} onOpenSpecies={(speciesId) => router.push(`/species/${speciesId}`)} />
      </Screen>
    </>
  );
}
