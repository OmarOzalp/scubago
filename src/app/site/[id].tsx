import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { SightingRow } from '@/components/sighting-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { CATEGORY_EMOJI } from '@/lib/rarity';
import { useAllSites, useAppStore } from '@/lib/store';

export default function SiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const sites = useAllSites();
  const sightings = useAppStore((s) => s.sightings);

  const site = sites.find((s) => s.id === id);

  const siteSightings = useMemo(
    () =>
      sightings
        .filter((s) => s.siteId === id)
        .sort((a, b) => b.sightedOn.localeCompare(a.sightedOn)),
    [sightings, id],
  );

  const speciesCount = useMemo(
    () => new Set(siteSightings.map((s) => s.speciesId)).size,
    [siteSightings],
  );

  if (!site) {
    return (
      <ThemedView style={styles.missing}>
        <ThemedText>Site not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: site.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 2 }}>
          <ThemedText type="subtitle" style={{ fontSize: 26, lineHeight: 32 }}>
            {site.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {site.region}, {site.country}
            {site.source === 'user' ? ' · added by you' : ''}
          </ThemedText>
        </View>

        <ThemedText>{site.blurb}</ThemedText>

        <View style={styles.statsRow}>
          <ThemedText type="smallBold">{siteSightings.length}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            sightings
          </ThemedText>
          <ThemedText type="smallBold" style={{ marginLeft: Spacing.three }}>
            {speciesCount}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            species
          </ThemedText>
        </View>

        {site.notableSpecies.length > 0 ? (
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">What divers see here</ThemedText>
            <View style={styles.chipsRow}>
              {site.notableSpecies.map((speciesId) => {
                const species = CATALOG_BY_ID.get(speciesId);
                if (!species) return null;
                return (
                  <View
                    key={speciesId}
                    style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="small">
                      {species.emoji ?? CATEGORY_EMOJI[species.category]} {species.commonName}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <OceanButton
          title="Log a sighting here"
          onPress={() => router.push({ pathname: '/log/new', params: { siteId: site.id } })}
        />

        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">Recent sightings</ThemedText>
          {siteSightings.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              None yet — be the first to log one.
            </ThemedText>
          ) : (
            siteSightings.slice(0, 30).map((s) => {
              const species = CATALOG_BY_ID.get(s.speciesId);
              if (!species) return null;
              return (
                <SightingRow
                  key={s.id}
                  sighting={s}
                  species={species}
                  showUsername
                  onPress={() => router.push(`/species/${species.id}`)}
                />
              );
            })
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one + 2,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
