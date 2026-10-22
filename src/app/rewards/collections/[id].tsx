import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { CollectionDetailView } from '@/components/rewards/collection-detail';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
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
  const theme = useTheme();
  const collection = collections.find((c) => c.id === id);
  // How often the diver has logged each animal, for the plates ("seen 3 times").
  const counts = useMemo(() => new Map(deriveDex(sightings, CATALOG_BY_ID).map((entry) => [entry.species.id, entry.count])), [sightings]);
  if (!collection) {
    return (
      <ThemedView style={styles.missing}>
        <View style={styles.missingArt}>
          <Wash width={120} height={84} color={theme.wash} seed={37} style={StyleSheet.absoluteFill} />
          <Icon name="fieldGuide" size={40} />
        </View>
        <ThemedText type="heading">Collection not found.</ThemedText>
      </ThemedView>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: collection.title }} />
      <Screen>
        <CollectionDetailView collection={collection} counts={counts} onOpenSpecies={(speciesId) => router.push(`/species/${speciesId}`)} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingArt: { width: 120, height: 84, alignItems: 'center', justifyContent: 'center' },
});
