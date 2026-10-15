import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteList } from '@/components/site-list';
import { SiteMap } from '@/components/site-map';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Ocean } from '@/constants/palette';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { CATEGORY_EMOJI } from '@/lib/rarity';
import { useAllSites, useAppStore } from '@/lib/store';
import { searchSpecies } from '@/lib/text-search';
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
  // A plain list of sites on phones too: easier for screen readers than pins on a map.
  const [listView, setListView] = useState(false);

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

  const results = useMemo(() => searchSpecies(CATALOG, query).slice(0, 12), [query]);

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

  const handleLongPress = async (lat: number, lng: number) => {
    const ok = await confirmAction({
      title: 'Add a dive site here?',
      message: `A new site will be pinned at ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
      confirmLabel: 'Add site',
    });
    if (ok) router.push({ pathname: '/add-site', params: { lat: String(lat), lng: String(lng) } });
  };
  const selectSite = (id: string) => {
    setSelectedSiteId(id);
    setSearching(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {listView && Platform.OS !== 'web' ? (
        <SiteList
          sites={sites}
          highlightedSiteIds={highlightedSiteIds}
          onSelectSite={selectSite}
          topInset={insets.top + 64}
        />
      ) : (
        <SiteMap
          sites={sites}
          highlightedSiteIds={highlightedSiteIds}
          onSelectSite={selectSite}
          onLongPress={handleLongPress}
        />
      )}

      {/* Species search / active filter */}
      <View style={[styles.topOverlay, { top: insets.top + Spacing.two }]}>
        {speciesFilter ? (
          <Pressable
            onPress={() => setSpeciesFilter(null)}
            accessibilityRole="button"
            accessibilityLabel={`Showing where to see the ${speciesFilter.commonName}: ${highlightedSiteIds?.size ?? 0} sites. Clear`}
            style={[styles.filterChip, { backgroundColor: theme.background }]}>
            <SpeciesAvatar species={speciesFilter} size={28} />
            <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={2}>
              {speciesFilter.commonName} — seen at {highlightedSiteIds?.size ?? 0} sites
            </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
              ✕
            </ThemedText>
          </Pressable>
        ) : searching ? (
          <View style={[styles.searchBar, { backgroundColor: theme.background }]}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="Which species? Search by name"
              placeholder="Whale shark, manta, seahorse…"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              returnKeyType="search"
              style={[styles.searchInput, { color: theme.text }]}
              onSubmitEditing={() => results[0] && pickSpecies(results[0])}
            />
            <Pressable
              onPress={() => {
                setSearching(false);
                setQuery('');
              }}
              accessibilityRole="button"
              style={styles.barButton}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setSearching(true)}
            accessibilityRole="search"
            accessibilityLabel="Where can I see a… Search by species"
            style={[styles.searchBar, { backgroundColor: theme.background }]}>
            <ThemedText themeColor="textSecondary">
              <ThemedText importantForAccessibility="no" accessibilityElementsHidden>
                🔍{' '}
              </ThemedText>
              Where can I see a…
            </ThemedText>
          </Pressable>
        )}

        {searching ? (
          <View style={[styles.results, { backgroundColor: theme.background }]}>
            <FlatList
              data={results}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(s) => s.id}
              ListEmptyComponent={
                <ThemedText type="small" themeColor="textSecondary" style={styles.noResults} accessibilityLiveRegion="polite">
                  No species matches “{query.trim()}”.
                </ThemedText>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => pickSpecies(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.commonName}. Show where it’s seen`}
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
              <ThemedText type="smallBold" style={{ fontSize: 18 }} numberOfLines={2} accessibilityRole="header">
                {selectedSite.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedSite.region}, {selectedSite.country}
              </ThemedText>
            </View>
            <Pressable onPress={() => setSelectedSiteId(null)} accessibilityRole="button" accessibilityLabel="Close" style={styles.closeButton}>
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
                  accessible
                  accessibilityLabel={`${species.commonName}, ${count} ${count === 1 ? 'sighting' : 'sightings'}`}
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
              accessibilityRole="button"
              accessibilityLabel={`Details about ${selectedSite.name}`}
              style={[styles.cardButton, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">Details</ThemedText>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/log/new', params: { siteId: selectedSite.id } })
              }
              accessibilityRole="button"
              accessibilityLabel={`Log a sighting at ${selectedSite.name}`}
              style={[styles.cardButton, { backgroundColor: Ocean.primary }]}>
              <ThemedText type="smallBold" style={{ color: Ocean.onPrimary }}>
                Log sighting here
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Adding a site without the long-press, which VoiceOver and the web app can't do; and the list view. */}
      {!selectedSite ? (
        <View style={[styles.bottomActions, { bottom: insets.bottom + Spacing.three }]}>
          <Pressable
            onPress={() => router.push('/add-site')}
            accessibilityRole="button"
            accessibilityLabel="Add a dive site"
            style={[styles.pill, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold">＋ Add a site</ThemedText>
          </Pressable>
          {Platform.OS !== 'web' ? (
            <Pressable
              onPress={() => setListView((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={listView ? 'Show the map' : 'Show sites as a list'}
              style={[styles.pill, { backgroundColor: theme.background }]}>
              <ThemedText type="smallBold">{listView ? 'Map' : 'List'}</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Log FAB */}
      <Pressable
        onPress={() => router.push('/log/new')}
        accessibilityRole="button"
        accessibilityLabel="Log a sighting"
        style={[styles.fab, { bottom: insets.bottom + Spacing.three }]}>
        <ThemedText style={styles.fabPlus} importantForAccessibility="no" accessibilityElementsHidden>
          ＋
        </ThemedText>
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
    minHeight: 48,
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
    minHeight: 48,
  },
  barButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    marginRight: -10,
  },
  noResults: {
    padding: Spacing.three,
  },
  bottomActions: {
    position: 'absolute',
    left: Spacing.three,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 48,
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
    justifyContent: 'center',
    minHeight: 48,
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
