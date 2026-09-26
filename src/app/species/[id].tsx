import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { RarityChip } from '@/components/rarity-chip';
import { formatDate } from '@/components/sighting-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { speciesMarineModel } from '@/lib/swimming';
import { CATEGORY_EMOJI, CATEGORY_LABEL } from '@/lib/rarity';
import { useAllSites, useAppStore, useMyUserId } from '@/lib/store';

export default function SpeciesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const sites = useAllSites();
  const sightings = useAppStore((s) => s.sightings);
  const myUserId = useMyUserId();

  const species = id ? CATALOG_BY_ID.get(id) : undefined;

  const speciesSightings = useMemo(
    () => sightings.filter((s) => s.speciesId === id),
    [sightings, id],
  );
  const mine = speciesSightings.filter((s) => s.userId === myUserId);

  /** Sites where this species has been seen, most sightings first. */
  const seenAt = useMemo(() => {
    const bySite = new Map<string, { count: number; last: string }>();
    for (const s of speciesSightings) {
      const cur = bySite.get(s.siteId);
      if (cur) {
        cur.count++;
        if (s.sightedOn > cur.last) cur.last = s.sightedOn;
      } else {
        bySite.set(s.siteId, { count: 1, last: s.sightedOn });
      }
    }
    return [...bySite.entries()]
      .map(([siteId, stats]) => ({ site: sites.find((x) => x.id === siteId), ...stats }))
      .filter((x): x is { site: NonNullable<typeof x.site>; count: number; last: string } => !!x.site)
      .sort((a, b) => b.count - a.count);
  }, [speciesSightings, sites]);

  if (!species) {
    return (
      <ThemedView style={styles.missing}>
        <ThemedText>Species not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: species.commonName }} />
      <ScrollView contentContainerStyle={styles.content}>
        {species.photoUrl ? (
          <View>
            <Image source={{ uri: species.photoUrl }} style={styles.hero} contentFit="cover" />
            {species.photoAttribution ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.attribution}>
                {species.photoAttribution} · iNaturalist
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <View style={[styles.heroFallback, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={{ fontSize: 72 }}>
              {species.emoji ?? CATEGORY_EMOJI[species.category]}
            </ThemedText>
          </View>
        )}

        <View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle" style={{ fontSize: 26, lineHeight: 32 }}>
            {species.commonName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic' }}>
            {species.scientificName}
          </ThemedText>
          <View style={styles.tagRow}>
            <RarityChip rarity={species.rarity} />
            <ThemedText type="small" themeColor="textSecondary">
              {CATEGORY_LABEL[species.category]}
            </ThemedText>
          </View>
        </View>

        <ThemedText>{species.blurb}</ThemedText>

        {speciesMarineModel(species.id) && <OceanButton
          title={`See ${species.commonName.toLowerCase()} in 3D`}
          variant="secondary"
          onPress={() => router.push({ pathname: '/inspect', params: { species: species.id } })}
        />}

        {mine.length > 0 ? (
          <View style={[styles.mine, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">In your log: ×{mine.length}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              First seen {formatDate([...mine].sort((a, b) => a.sightedOn.localeCompare(b.sightedOn))[0].sightedOn)}
            </ThemedText>
          </View>
        ) : (
          <OceanButton
            title="I saw one! Log it"
            onPress={() =>
              router.push({ pathname: '/log/new', params: { speciesId: species.id } })
            }
          />
        )}

        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">Where it’s been seen</ThemedText>
          {seenAt.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No logged sightings yet — it’s out there somewhere.
            </ThemedText>
          ) : (
            seenAt.map(({ site, count, last }) => (
              <Pressable
                key={site.id}
                onPress={() => router.push(`/site/${site.id}`)}
                style={({ pressed }) => [
                  styles.siteRow,
                  { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                ]}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {site.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {site.region}, {site.country}
                  </ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ThemedText type="smallBold">×{count}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    last {formatDate(last)}
                  </ThemedText>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {mine.length > 0 ? (
          <OceanButton
            title="Log another sighting"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/log/new', params: { speciesId: species.id } })
            }
          />
        ) : null}
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
  hero: {
    width: '100%',
    height: 220,
    borderRadius: 18,
  },
  heroFallback: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attribution: {
    marginTop: 4,
    fontSize: 11,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 4,
  },
  mine: {
    borderRadius: 14,
    padding: Spacing.three,
    gap: 2,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    padding: Spacing.two + 2,
  },
});
