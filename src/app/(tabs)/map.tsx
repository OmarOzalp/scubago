import { router } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { boundsOfSites, buildPlaces, searchExplore, type Place } from '@/components/explore/search';
import { FilterChip, SearchBar } from '@/components/explore/search-bar';
import { SearchPanel } from '@/components/explore/search-panel';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { Paper } from '@/components/journal/paper';
import { ScreenHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { SiteList } from '@/components/site-list';
import { SiteMap, type MapFocus } from '@/components/site-map';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing, TabBarOverhang, Type } from '@/constants/theme';
import { canonicalSiteId } from '@/data/sites';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { sortDives } from '@/lib/dives';
import { useAllSites, useAppStore, useMyDives, useMyUserId, useSiteById } from '@/lib/store';
import type { DiveSite, Species } from '@/lib/types';
import { hashSeed } from '@/lib/wash';

/** How many sightings of an animal are the diver's own and how many are other divers'. */
type Seen = { mine: number; others: number };
type TopSpecies = Seen & { species: Species };

/** Whose sightings a count is: "3 of yours", "5 by others", or both. */
function whose({ mine, others }: Seen): string {
  return [mine ? `${mine} of yours` : null, others ? `${others} by others` : null].filter(Boolean).join(' · ');
}

/**
 * The Explore tab: every dive site on a map (a list on the web), and one search for dive sites,
 * places and animals. A site you pick is selected (and the map flies to it); an animal shows where
 * it is seen; a place shows only its sites. The map is mounted on the page like a chart pasted into
 * the journal.
 */
export default function ExploreScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const allSites = useAllSites();
  // A to Z: the list (the web's map, and the phone's list view) otherwise follows the order the sites were added in.
  const sites = useMemo(() => [...allSites].sort((a, b) => a.name.localeCompare(b.name)), [allSites]);
  const sightings = useAppStore((s) => s.sightings);
  const myUserId = useMyUserId();
  const myDives = useMyDives();
  const siteById = useSiteById();

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  // What the map and list are filtered to: where an animal is seen, or the sites in a place. One at a time.
  const [speciesFilter, setSpeciesFilter] = useState<Species | null>(null);
  const [placeFilterId, setPlaceFilterId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  // The results follow what is typed a moment behind, so the field keeps up with the keyboard.
  const typed = useDeferredValue(query);
  // A plain list of sites on phones too: easier for screen readers than pins on a map.
  const [listView, setListView] = useState(false);
  // The search results open just below the search bar, over the map.
  const [barBottom, setBarBottom] = useState(0);

  // By the listed site: one logged at a hidden copy of a site counts at the site. Each count is kept as the
  // diver's own and everyone else's, so a card can say whose it is (the store holds other divers' sightings too).
  const sightingsBySite = useMemo(() => {
    const map = new Map<string, Map<string, Seen>>();
    for (const s of sightings) {
      const siteId = canonicalSiteId(s.siteId);
      let counts = map.get(siteId);
      if (!counts) map.set(siteId, (counts = new Map()));
      const seen = counts.get(s.speciesId) ?? { mine: 0, others: 0 };
      if (s.userId === myUserId) seen.mine++;
      else seen.others++;
      counts.set(s.speciesId, seen);
    }
    return map;
  }, [sightings, myUserId]);

  // Where the native map opens: the diver's last dive's site (else where they last logged an animal), so it starts
  // in their own part of the world instead of South-East Asia. Plain numbers, so the map isn't redrawn for a new copy of them.
  const lastSite = useMemo(() => {
    const lastDive = sortDives(myDives)[0];
    const lastSeen = sightings.filter((s) => s.userId === myUserId).sort((a, b) => b.sightedOn.localeCompare(a.sightedOn) || b.createdAt.localeCompare(a.createdAt))[0];
    return siteById(canonicalSiteId(lastDive?.siteId ?? lastSeen?.siteId ?? ''));
  }, [myDives, sightings, myUserId, siteById]);
  const lastLat = lastSite?.lat;
  const lastLng = lastSite?.lng;
  const startAt = useMemo(() => (lastLat === undefined || lastLng === undefined ? null : { south: lastLat, north: lastLat, west: lastLng, east: lastLng }), [lastLat, lastLng]);

  const places = useMemo(() => buildPlaces(sites), [sites]);
  const placeFilter = useMemo(() => (placeFilterId ? (places.find((p) => p.id === placeFilterId) ?? null) : null), [places, placeFilterId]);

  const highlightedSiteIds = useMemo(() => {
    if (speciesFilter) {
      const ids = new Set<string>();
      for (const site of sites) {
        const seenHere = sightingsBySite.get(site.id)?.has(speciesFilter.id);
        if (seenHere || site.notableSpecies.includes(speciesFilter.id)) ids.add(site.id);
      }
      return ids;
    }
    return placeFilter ? new Set(placeFilter.siteIds) : null;
  }, [speciesFilter, placeFilter, sites, sightingsBySite]);

  const results = useMemo(
    () => (typed.trim() ? searchExplore({ sites, places, species: CATALOG, query: typed }) : null),
    [typed, sites, places],
  );

  const selectedSite = selectedSiteId ? sites.find((s) => s.id === selectedSiteId) : null;
  const selectedTopSpecies = useMemo(() => {
    if (!selectedSiteId) return [];
    const counts = sightingsBySite.get(selectedSiteId);
    if (!counts) return [];
    return [...counts.entries()]
      .sort((a, b) => b[1].mine + b[1].others - (a[1].mine + a[1].others))
      .slice(0, 4)
      .map(([speciesId, seen]) => ({ species: CATALOG_BY_ID.get(speciesId), ...seen }))
      .filter((x): x is TopSpecies => !!x.species);
  }, [selectedSiteId, sightingsBySite]);

  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };
  const pickSpecies = (species: Species) => {
    setSpeciesFilter(species);
    setPlaceFilterId(null);
    setSelectedSiteId(null);
    // The site searched for before is done with: a map or list that comes back mustn't go to it again.
    setFocus(null);
    closeSearch();
  };
  const pickPlace = (place: Place) => {
    setPlaceFilterId(place.id);
    setSpeciesFilter(null);
    setSelectedSiteId(null);
    const ids = new Set(place.siteIds);
    const bounds = boundsOfSites(sites, ids);
    setFocus(bounds ? { bounds, siteId: null } : null);
    closeSearch();
  };
  // The same as tapping the site's pin (its card opens), and the map flies to it (the list scrolls to it).
  // A filter that leaves the site out would hide what was asked for, so it goes; one that has it stays.
  const pickSite = (site: DiveSite) => {
    if (highlightedSiteIds && !highlightedSiteIds.has(site.id)) {
      setSpeciesFilter(null);
      setPlaceFilterId(null);
    }
    setSelectedSiteId(site.id);
    setFocus({ bounds: { south: site.lat, north: site.lat, west: site.lng, east: site.lng }, siteId: site.id });
    closeSearch();
  };
  // Return: the first row of the first section, worked out from what is in the field now.
  const submitSearch = () => {
    const top = searchExplore({ sites, places, species: CATALOG, query }).top;
    if (!top) return;
    if (top.kind === 'site') pickSite(top.site);
    else if (top.kind === 'place') pickPlace(top.place);
    else pickSpecies(top.species);
  };

  // Stable, so choosing a site (which only changes the card) doesn't re-render the map and its markers.
  const handleLongPress = useCallback(async (lat: number, lng: number) => {
    const ok = await confirmAction({
      title: 'Add a dive site here?',
      message: `A new site will be pinned at ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
      confirmLabel: 'Add site',
    });
    if (ok) router.push({ pathname: '/add-site', params: { lat: String(lat), lng: String(lng) } });
  }, []);
  // A pin or a row: the map and list are already where the diver is looking. What the search asked
  // them to show is forgotten, or the map would fly back to it (and the list scroll to it) when the
  // diver switches between the two, which mounts them again.
  const selectSite = useCallback((id: string) => {
    setSelectedSiteId(id);
    setFocus(null);
    setSearching(false);
  }, []);
  const closeCard = useCallback(() => {
    setSelectedSiteId(null);
    setFocus(null);
  }, []);

  // The interactive map is native-only; the web build's SiteMap is the site list.
  const mapShown = Platform.OS !== 'web' && !listView;
  const map = (
    <SiteMap
      sites={sites}
      highlightedSiteIds={highlightedSiteIds}
      highlightLabel={placeFilter ? `In ${placeFilter.name}` : undefined}
      focus={focus}
      startAt={startAt}
      selectedSiteId={Platform.OS === 'web' ? selectedSiteId : undefined}
      onSelectSite={selectSite}
      onLongPress={handleLongPress}
    />
  );
  const card = selectedSite ? (
    <SiteCard site={selectedSite} topSpecies={selectedTopSpecies} onClose={closeCard} style={mapShown ? styles.cardOnMap : undefined} />
  ) : null;
  const filtered = highlightedSiteIds?.size ?? 0;
  // Over the map the results can reach further down than over a keyboard.
  const panelMaxHeight = Platform.OS === 'web' ? Math.min(560, Math.max(340, windowHeight - barBottom - 96)) : 340;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* The page's head: title, the add-site and list buttons, then the search, and under it the filter it has set. */}
      <View style={[styles.column, styles.header, { paddingTop: insets.top + Spacing.four }]}>
        <ScreenHeader
          title="Explore"
          accessory={
            // Adding a site without the long-press, which VoiceOver and the web app can't do; and the list view.
            <View style={styles.tools}>
              <AddSiteButton onPress={() => router.push('/add-site')} />
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

        <View onLayout={(e) => setBarBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <SearchBar
            searching={searching}
            query={query}
            onQueryChange={setQuery}
            onOpen={() => setSearching(true)}
            onCancel={closeSearch}
            onSubmit={submitSearch}
          />
        </View>

        {speciesFilter ? (
          <FilterChip
            leading={<SpeciesAvatar species={speciesFilter} size={38} showRarityRing />}
            title={speciesFilter.commonName}
            subtitle={`Seen at ${filtered} ${filtered === 1 ? 'site' : 'sites'}`}
            accessibilityLabel={`Showing where to see the ${speciesFilter.commonName}: ${filtered} sites. Clear`}
            onClear={() => setSpeciesFilter(null)}
          />
        ) : placeFilter ? (
          <FilterChip
            leading={
              <View style={[styles.placeTile, { backgroundColor: theme.backgroundSelected }]}>
                <Icon name="map" size={22} wash={theme.coral} washOpacity={0.45} />
              </View>
            }
            title={placeFilter.name}
            subtitle={`${filtered} ${filtered === 1 ? 'dive site' : 'dive sites'} · ${placeFilter.detail}`}
            accessibilityLabel={`Showing the dive sites in ${placeFilter.name}: ${filtered} sites. Clear`}
            onClear={() => setPlaceFilterId(null)}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        {listView && Platform.OS !== 'web' ? (
          <SiteList sites={sites} highlightedSiteIds={highlightedSiteIds} onSelectSite={selectSite} reveal={focus} selectedSiteId={selectedSiteId} />
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
        <View style={[styles.overlay, { top: barBottom + 6, pointerEvents: 'box-none' }]}>
          <View style={[styles.column, { pointerEvents: 'box-none' }]}>
            <SearchPanel
              results={results}
              maxHeight={panelMaxHeight}
              onPickSite={pickSite}
              onPickPlace={pickPlace}
              onPickSpecies={pickSpecies}
              onTry={setQuery}
              onAddSite={(name) => {
                closeSearch();
                router.push({ pathname: '/add-site', params: { name } });
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Adding a site, in words as well as a picture: a bare pin with a plus is not something everyone reads. */
function AddSiteButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add site"
      accessibilityHint="Adds a dive site to the map"
      style={({ pressed }) => [
        styles.addSite,
        { borderColor: theme.rule, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <Icon name="addSite" size={22} />
      <Text style={[styles.addSiteText, { color: theme.text }]}>Add site</Text>
    </Pressable>
  );
}

/** The site you tapped: where it is, what's been seen there, and the way to its page or to log here. */
function SiteCard({
  site,
  topSpecies,
  onClose,
  style,
}: {
  site: DiveSite;
  topSpecies: TopSpecies[];
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
          {topSpecies.map(({ species, mine, others }) => (
            <View
              key={species.id}
              accessible
              accessibilityLabel={`${species.commonName}, ${whose({ mine, others })}`}
              style={[styles.speciesChip, { backgroundColor: theme.background, borderColor: theme.rule }]}>
              <SpeciesAvatar species={species} size={28} />
              <Text numberOfLines={1} style={[styles.chipName, { color: theme.text }]}>
                {species.commonName}
              </Text>
              <Text style={[styles.chipCount, { color: theme.textSecondary }]}>{whose({ mine, others })}</Text>
            </View>
          ))}
        </View>
      ) : (
        <ThemedText type="caption" themeColor="textSecondary">
          No sightings here yet.
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
        {/* Coral, as logging is everywhere else. */}
        <OceanButton
          title="Log a dive here"
          variant="log"
          onPress={() => router.push({ pathname: '/log/new', params: { siteId: site.id } })}
          accessibilityLabel={`Log a dive here, at ${site.name}`}
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
    alignItems: 'center',
    gap: Spacing.two,
  },
  addSite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 46,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 23,
    borderWidth: 1.5,
  },
  addSiteText: {
    fontFamily: Type.bodyHeavy,
    fontSize: 14,
    lineHeight: 20,
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Where an animal has its plate in the filter chip, a place has a tile of paper with a map on it.
  placeTile: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
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
  // Wider than "Details", so "Log a dive here" stays on one line on a phone.
  logButton: {
    flex: 1.6,
    paddingHorizontal: 12,
  },
});
