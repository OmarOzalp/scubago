import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { Paper } from '@/components/journal/paper';
import { ScreenHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { SiteList } from '@/components/site-list';
import { SiteMap } from '@/components/site-map';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Shadow, Spacing, TabBarOverhang, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { useAllSites, useAppStore } from '@/lib/store';
import { searchSpecies } from '@/lib/text-search';
import type { DiveSite, Species } from '@/lib/types';
import { hashSeed } from '@/lib/wash';

/**
 * The Explore tab: every dive site on a map (a list on the web), and a species search that shows
 * where an animal is seen. The map is mounted on the page like a chart pasted into the journal.
 */
export default function ExploreScreen() {
  const theme = useTheme();
  const scheme = useSchemeName();
  const insets = useSafeAreaInsets();
  const sites = useAllSites();
  const sightings = useAppStore((s) => s.sightings);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [speciesFilter, setSpeciesFilter] = useState<Species | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  // A plain list of sites on phones too: easier for screen readers than pins on a map.
  const [listView, setListView] = useState(false);
  // The search results open just below the header, over the map.
  const [headerHeight, setHeaderHeight] = useState(0);

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

  // The interactive map is native-only; the web build's SiteMap is the site list.
  const mapShown = Platform.OS !== 'web' && !listView;
  const map = (
    <SiteMap
      sites={sites}
      highlightedSiteIds={highlightedSiteIds}
      onSelectSite={selectSite}
      onLongPress={handleLongPress}
    />
  );
  const card = selectedSite ? (
    <SiteCard site={selectedSite} topSpecies={selectedTopSpecies} onClose={() => setSelectedSiteId(null)} style={mapShown ? styles.cardOnMap : undefined} />
  ) : null;
  const filtered = highlightedSiteIds?.size ?? 0;
  const barShadow = Shadow[scheme].card;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* The page's head: title, the add-site and list buttons, then the species search (or its filter). */}
      <View
        style={[styles.column, styles.header, { paddingTop: insets.top + Spacing.four }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <ScreenHeader
          eyebrow="Dive sites"
          title="Explore"
          accessory={
            // Adding a site without the long-press, which VoiceOver and the web app can't do; and the list view.
            <View style={styles.tools}>
              <IconButton icon="addSite" onPress={() => router.push('/add-site')} accessibilityLabel="Add a dive site" />
              {Platform.OS !== 'web' ? (
                <IconButton
                  icon={listView ? 'map' : 'list'}
                  onPress={() => setListView((v) => !v)}
                  accessibilityLabel={listView ? 'Show the map' : 'Show sites as a list'}
                />
              ) : null}
            </View>
          }
        />

        {speciesFilter ? (
          // Edged in coral, like the pins it lights up on the map.
          <Pressable
            onPress={() => setSpeciesFilter(null)}
            accessibilityRole="button"
            accessibilityLabel={`Showing where to see the ${speciesFilter.commonName}: ${highlightedSiteIds?.size ?? 0} sites. Clear`}
            style={({ pressed }) => [
              styles.bar,
              styles.filterBar,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.coral, boxShadow: barShadow },
            ]}>
            <SpeciesAvatar species={speciesFilter} size={38} showRarityRing />
            <View style={styles.filterText}>
              <Text numberOfLines={1} style={[styles.filterName, { color: theme.text }]}>
                {speciesFilter.commonName}
              </Text>
              <Text numberOfLines={1} style={[styles.filterCount, { color: theme.textSecondary }]}>
                Seen at {filtered} {filtered === 1 ? 'site' : 'sites'}
              </Text>
            </View>
            <View style={[styles.closeCircle, { backgroundColor: theme.backgroundSelected }]}>
              <Icon name="close" size={16} weight="bold" />
            </View>
          </Pressable>
        ) : searching ? (
          <View style={[styles.bar, { backgroundColor: theme.backgroundElement, borderColor: theme.tint, boxShadow: barShadow }]}>
            <Icon name="search" size={20} color={theme.tint} />
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
              style={({ pressed }) => [styles.barButton, { opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[styles.cancel, { color: theme.tint }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setSearching(true)}
            accessibilityRole="search"
            accessibilityLabel="Where can I see a… Search by species"
            style={({ pressed }) => [
              styles.bar,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.rule, boxShadow: barShadow },
            ]}>
            <Icon name="search" size={20} color={theme.textSecondary} />
            <Text numberOfLines={1} style={[styles.placeholder, { color: theme.textSecondary }]}>
              Where can I see a…
            </Text>
            <Icon name="fieldGuide" size={20} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.15} />
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        {listView && Platform.OS !== 'web' ? (
          <SiteList sites={sites} highlightedSiteIds={highlightedSiteIds} onSelectSite={selectSite} />
        ) : mapShown ? (
          // The chart, mounted like the island on Home: a fine ink frame inside a raised sheet. It stops
          // short of the tab bar so the raised "Log dive" button never covers it.
          <View style={[styles.column, styles.mapArea]}>
            <Paper raised padded={false} style={styles.mapSheet}>
              <View style={[styles.mount, { borderColor: theme.text }]}>
                <View style={[styles.chart, { backgroundColor: theme.backgroundSelected }]}>
                  {map}
                  {card}
                </View>
              </View>
            </Paper>
          </View>
        ) : (
          map
        )}

        {/* Over the list, the card floats above the raised "Log dive" button. */}
        {card && !mapShown ? (
          <View style={[styles.cardOverlay, { pointerEvents: 'box-none' }]}>
            <View style={[styles.column, { pointerEvents: 'box-none' }]}>
              {card}
            </View>
          </View>
        ) : null}
      </View>

      {searching ? (
        <View style={[styles.overlay, { top: headerHeight - Spacing.two, pointerEvents: 'box-none' }]}>
          <View style={[styles.column, { pointerEvents: 'box-none' }]}>
            <Paper raised padded={false} style={styles.results}>
              <FlatList
                data={results}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(s) => s.id}
                ItemSeparatorComponent={Separator}
                ListEmptyComponent={
                  <ThemedText type="caption" themeColor="textSecondary" style={styles.noResults} accessibilityLiveRegion="polite">
                    No species matches “{query.trim()}”.
                  </ThemedText>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => pickSpecies(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.commonName}. Show where it’s seen`}
                    style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: theme.backgroundSelected }]}>
                    <SpeciesAvatar species={item} size={40} showRarityRing />
                    <View style={styles.resultText}>
                      <Text numberOfLines={1} style={[styles.resultName, { color: theme.text }]}>
                        {item.commonName}
                      </Text>
                      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.resultLatin}>
                        {item.scientificName}
                      </ThemedText>
                    </View>
                    <Icon name="pin" size={18} color={theme.textSecondary} wash={theme.coral} washOpacity={0.35} />
                  </Pressable>
                )}
              />
            </Paper>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A hairline between search results. */
function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.rule }]} />;
}

/** The site you tapped: where it is, what's been seen there, and the way to its page or to log here. */
function SiteCard({
  site,
  topSpecies,
  onClose,
  style,
}: {
  site: DiveSite;
  topSpecies: { species: Species; count: number }[];
  onClose: () => void;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <Paper raised style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardPin}>
          <Wash width={44} height={38} color={theme.wash} seed={hashSeed(site.id)} style={StyleSheet.absoluteFill} />
          <Icon name="pin" size={22} wash={theme.coral} washOpacity={0.45} />
        </View>
        <View style={styles.cardTitles}>
          <ThemedText type="label" numberOfLines={1}>
            {site.region}, {site.country}
          </ThemedText>
          <ThemedText type="heading" numberOfLines={2} accessibilityRole="header">
            {site.name}
          </ThemedText>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.closeButton}>
          {({ pressed }) => (
            <View style={[styles.closeCircle, { backgroundColor: pressed ? theme.rule : theme.backgroundSelected }]}>
              <Icon name="close" size={16} weight="bold" />
            </View>
          )}
        </Pressable>
      </View>

      {topSpecies.length > 0 ? (
        <View style={styles.chipsRow}>
          {topSpecies.map(({ species, count }) => (
            <View
              key={species.id}
              accessible
              accessibilityLabel={`${species.commonName}, ${count} ${count === 1 ? 'sighting' : 'sightings'}`}
              style={[styles.speciesChip, { backgroundColor: theme.background, borderColor: theme.rule }]}>
              <SpeciesAvatar species={species} size={28} />
              <Text numberOfLines={1} style={[styles.chipName, { color: theme.text }]}>
                {species.commonName}
              </Text>
              <Text style={[styles.chipCount, { color: theme.textSecondary }]}>×{count}</Text>
            </View>
          ))}
        </View>
      ) : (
        <ThemedText type="caption" themeColor="textSecondary">
          No sightings logged here yet — be the first!
        </ThemedText>
      )}

      <View style={styles.cardButtons}>
        <OceanButton
          title="Details"
          variant="secondary"
          onPress={() => router.push(`/site/${site.id}`)}
          accessibilityLabel={`Details about ${site.name}`}
          style={styles.detailsButton}
        />
        <OceanButton
          title="Log sighting here"
          onPress={() => router.push({ pathname: '/log/new', params: { siteId: site.id } })}
          accessibilityLabel={`Log a sighting at ${site.name}`}
          style={styles.logButton}
        />
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // One centred column on wide screens, as on the other tabs.
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  header: {
    gap: 14,
    paddingBottom: 14,
  },
  tools: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 50,
    gap: 10,
  },
  placeholder: {
    flex: 1,
    fontFamily: Type.body,
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: Type.body,
    fontSize: 16,
    minHeight: 48,
  },
  barButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancel: {
    fontFamily: Type.bodyHeavy,
    fontSize: 14,
  },
  filterBar: {
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 6,
  },
  filterText: {
    flex: 1,
  },
  filterName: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  filterCount: {
    fontFamily: Type.body,
    fontSize: 13,
    lineHeight: 18,
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginRight: -8,
  },
  body: {
    flex: 1,
  },
  mapArea: {
    flex: 1,
    paddingBottom: TabBarOverhang + Spacing.two,
  },
  mapSheet: {
    flex: 1,
    padding: 6,
  },
  mount: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md + 4,
    padding: 3,
  },
  chart: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  results: {
    maxHeight: 340,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    marginLeft: 66,
  },
  noResults: {
    padding: Spacing.three,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  resultLatin: {
    fontSize: 14,
    lineHeight: 19,
  },
  cardOnMap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  cardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: TabBarOverhang + Spacing.two,
  },
  card: {
    gap: 12,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardPin: {
    width: 44,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardTitles: {
    flex: 1,
    gap: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  speciesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 3,
    paddingRight: 10,
  },
  chipName: {
    flexShrink: 1,
    fontFamily: Type.bodyBold,
    fontSize: 13,
    lineHeight: 18,
  },
  chipCount: {
    fontFamily: Type.bodyHeavy,
    fontSize: 12,
    lineHeight: 18,
  },
  cardButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  detailsButton: {
    flex: 1,
    paddingHorizontal: 12,
  },
  // Wider than "Details", so "Log sighting here" stays on one line on a phone.
  logButton: {
    flex: 1.6,
    paddingHorizontal: 12,
  },
});
