import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteMap } from '@/components/site-map';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Ocean } from '@/constants/palette';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { CATEGORY_EMOJI } from '@/lib/rarity';
import { useAllSites, useAppStore } from '@/lib/store';
import type { Species } from '@/lib/types';

export default function MapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sites = useAllSites();
  const sightings = useAppStore((s) => s.sightings);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [speciesFilter, setSpeciesFilter] = useState<Species | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const sightingsBySite = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of sightings) {
      let counts = map.get(s.siteId);
      if (!counts) map.set(s.siteId, (counts = new Map()));
      counts.set(s.speciesId, (counts.get(s.speciesId) ?? 0) + 1);
    }
    return map;
  }, [sightings]);

  const highlightedSiteIds = useMemo(() => {
    if (!speciesFilter) return null;
    const ids = new Set<string>();
    for (const site of sites) {
      const seenHere = sightingsBySite.get(site.id)?.has(speciesFilter.id);
      if (seenHere || site.notableSpecies.includes(speciesFilter.id)) ids.add(site.id);
    }
    return ids;
  }, [speciesFilter, sites, sightingsBySite]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATALOG.slice(0, 12);
    return CATALOG.filter(
      (s) =>
        s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [query]);

  const selectedSite = selectedSiteId ? sites.find((s) => s.id === selectedSiteId) : null;
  const selectedTopSpecies = useMemo(() => {
    if (!selectedSiteId) return [];
    const counts = sightingsBySite.get(selectedSiteId);
    if (!counts) return [];
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([speciesId, count]) => ({ species: CATALOG_BY_ID.get(speciesId), count }))
      .filter((x): x is { species: Species; count: number } => !!x.species);
  }, [selectedSiteId, sightingsBySite]);

  const pickSpecies = (species: Species) => {
    setSpeciesFilter(species);
    setSearching(false);
    setQuery('');
    setSelectedSiteId(null);
  };

  const handleLongPress = (lat: number, lng: number) => {
    Alert.alert(
      'Add a dive site here?',
      `A new site will be pinned at ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add site',
          onPress: () =>
            router.push({ pathname: '/add-site', params: { lat: String(lat), lng: String(lng) } }),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <SiteMap
        sites={sites}
        highlightedSiteIds={highlightedSiteIds}
        onSelectSite={(id) => {
          setSelectedSiteId(id);
          setSearching(false);
        }}
        onLongPress={handleLongPress}
      />

      {/* Species search / active filter */}
      <View style={[styles.topOverlay, { top: insets.top + Spacing.two }]}>
        {speciesFilter ? (
          <Pressable
            onPress={() => setSpeciesFilter(null)}
            style={[styles.filterChip, { backgroundColor: theme.background }]}>
            <SpeciesAvatar species={speciesFilter} size={28} />
            <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>
              {speciesFilter.commonName} — seen at {highlightedSiteIds?.size ?? 0} sites
            </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ✕
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setSearching(true)}
            style={[styles.searchBar, { backgroundColor: theme.background }]}>
            {searching ? (
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Whale shark, manta, seahorse…"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.text }]}
                onSubmitEditing={() => results[0] && pickSpecies(results[0])}
              />
            ) : (
              <ThemedText themeColor="textSecondary">🔍 Where can I see a…</ThemedText>
            )}
            {searching ? (
              <Pressable
                onPress={() => {
                  setSearching(false);
                  setQuery('');
                }}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
            ) : null}
          </Pressable>
        )}

        {searching ? (
          <View style={[styles.results, { backgroundColor: theme.background }]}>
            <FlatList
              data={results}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(s) => s.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => pickSpecies(item)}
                  style={({ pressed }) => [
                    styles.resultRow,
                    pressed && { backgroundColor: theme.backgroundElement },
                  ]}>
                  <SpeciesAvatar species={item} size={36} showRarityRing />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{item.commonName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.scientificName}
                    </ThemedText>
                  </View>
                </Pressable>
              )}
            />
          </View>
        ) : null}
      </View>

      {/* Selected site card */}
      {selectedSite ? (
        <View
          style={[
            styles.siteCard,
            { backgroundColor: theme.background, bottom: insets.bottom + 84 },
          ]}>
          <View style={styles.siteCardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold" style={{ fontSize: 18 }} numberOfLines={1}>
                {selectedSite.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedSite.region}, {selectedSite.country}
              </ThemedText>
            </View>
            <Pressable onPress={() => setSelectedSiteId(null)} hitSlop={12}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                ✕
              </ThemedText>
            </Pressable>
          </View>

          {selectedTopSpecies.length > 0 ? (
            <View style={styles.chipsRow}>
              {selectedTopSpecies.map(({ species, count }) => (
                <View
                  key={species.id}
                  style={[styles.speciesChip, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small">
                    {species.emoji ?? CATEGORY_EMOJI[species.category]} {species.commonName}{' '}
                    ×{count}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No sightings logged here yet — be the first!
            </ThemedText>
          )}

          <View style={styles.cardButtons}>
            <Pressable
              onPress={() => router.push(`/site/${selectedSite.id}`)}
              style={[styles.cardButton, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">Details</ThemedText>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/log/new', params: { siteId: selectedSite.id } })
              }
              style={[styles.cardButton, { backgroundColor: Ocean.primary }]}>
              <ThemedText type="smallBold" style={{ color: Ocean.onPrimary }}>
                Log sighting here
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Log FAB */}
      <Pressable
        onPress={() => router.push('/log/new')}
        style={[styles.fab, { bottom: insets.bottom + Spacing.three }]}>
        <ThemedText style={styles.fabPlus}>＋</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topOverlay: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    gap: Spacing.two,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    height: 48,
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: Spacing.two + 2,
    height: 48,
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  results: {
    borderRadius: 14,
    maxHeight: 320,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  siteCard: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two + 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  siteCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one + 2,
  },
  speciesChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cardButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Ocean.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabPlus: {
    color: Ocean.onPrimary,
    fontSize: 28,
    lineHeight: Platform.select({ ios: 32, default: 34 }),
    fontWeight: '600',
  },
});
