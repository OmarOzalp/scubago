import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type LongPressEvent, type Region } from 'react-native-maps';

import { OsmCredit } from '@/components/site-list';
import { OnFill, Radius, Shadow, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { boundsToRegion, clusterSites, hasImportedSites, spreadStackedSites, type MapRegion, type SiteBounds, type SiteCluster } from '@/lib/site-clusters';
import type { DiveSite } from '@/lib/types';

/**
 * Something the search asks the map to show: a site, or a place (the box round its sites). The map
 * moves when it gets a new one (it compares by identity, so asking for the same site again moves
 * it again). The list on the web scrolls to `siteId`, or to the top when that is null.
 */
export interface MapFocus {
  bounds: SiteBounds;
  siteId: string | null;
}

export interface SiteMapProps {
  sites: DiveSite[];
  /** When set (a species or place filter is active), only these sites are highlighted; others dim. */
  highlightedSiteIds: Set<string> | null;
  /** What the highlight means, for the key on the map. */
  highlightLabel?: string;
  /** Where to move the map (the web list scrolls to it). Nothing moves for null. */
  focus?: MapFocus | null;
  /** Where the map opens (the diver's last site, say), instead of South-East Asia. Read once, as the map appears. */
  startAt?: SiteBounds | null;
  /** The site whose card is open. Only the web list marks it (the map's pins don't change, and must not be redrawn for it). */
  selectedSiteId?: string | null;
  onSelectSite: (siteId: string) => void;
  onLongPress: (lat: number, lng: number) => void;
}

/** What the map shows when it opens: South-East Asia, where most of the sites are. */
const INITIAL_REGION: MapRegion = { latitude: 12, longitude: 100, latitudeDelta: 60, longitudeDelta: 80 };
/** The least the map shows across, in degrees, when it opens on a site: the region round it, a few hundred kilometres. */
const START_DELTA = 4;
/** How long the map must stop moving before the sites are grouped again for where it ended up. */
const REGION_DEBOUNCE_MS = 150;
/** How long a cluster's view is redrawn into the map after it appears or changes (see `useSettledTracking`). */
const SETTLE_MS = 500;
/** How long the zoom to a tapped cluster takes. */
const ZOOM_MS = 450;
/** How long the move to a site or place the search picked takes. */
const FOCUS_MS = 600;
/** A cluster's roundel is centred on its position (the default anchor is the foot of a pin). */
const CENTRE = { x: 0.5, y: 0.5 } as const;

/**
 * World map of dive sites (native). Web gets a list fallback via site-map.web.tsx.
 *
 * With hundreds of sites, one marker each would be too many pins and too many views to keep up to
 * date, so sites are grouped by lib/site-clusters.ts: zoomed out, a paper roundel with a count stands
 * for the sites in one cell of a world grid, and tapping it zooms to them; zoomed in, every site is
 * its own pin (sites mapped on one exact spot are drawn on a small ring round it, so each can be
 * tapped). The grouping is redone once the map has stopped moving, for the region it stopped at.
 *
 * Single sites are the platform's own pins: lagoon, or coral while a species filter is on and the
 * site matches. The key says what that means.
 *
 * What re-renders: the markers are memoised on plain values (position, colour, count, label) and get
 * the same callbacks every time, so choosing a site (which only changes the screen's card) doesn't
 * touch the map, and moving the map only adds and removes the markers whose cell changed.
 */
export const SiteMap = memo(function SiteMap({ sites, highlightedSiteIds, highlightLabel = 'Where to see it', focus = null, startAt = null, onSelectSite, onLongPress }: SiteMapProps) {
  const mapRef = useRef<MapView>(null);
  const theme = useTheme();
  const scheme = useSchemeName();
  // A few degrees across at the least, so the sites round it show too, not only the one.
  const [start] = useState<MapRegion>(() => (startAt ? boundsToRegion(startAt, { minDelta: START_DELTA }) : INITIAL_REGION));
  const [region, setRegion] = useState<MapRegion>(start);

  // The newest callbacks, read when a marker is pressed, so the markers never depend on them.
  const latest = useRef({ onSelectSite, onLongPress });
  useLayoutEffect(() => {
    latest.current = { onSelectSite, onLongPress };
  });

  const clusters = useMemo(() => clusterSites(sites, region), [sites, region]);
  const clustersRef = useRef<SiteCluster[]>(clusters);
  const regionRef = useRef<MapRegion>(region);
  useLayoutEffect(() => {
    clustersRef.current = clusters;
    regionRef.current = region;
  }, [clusters, region]);

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const imported = useMemo(() => hasImportedSites(sites), [sites]);

  // Sites on one exact spot are drawn on a small ring round it, so each pin can be tapped.
  const spread = useMemo(() => spreadStackedSites(clusters, region), [clusters, region]);
  const markers = useMemo(
    () =>
      clusters.map((cluster) => {
        const matching = highlightedSiteIds === null ? 0 : cluster.siteIds.reduce((n, id) => n + (highlightedSiteIds.has(id) ? 1 : 0), 0);
        return markerSpec(cluster, matching, highlightedSiteIds !== null, sitesById, spread.get(cluster.id));
      }),
    [clusters, highlightedSiteIds, sitesById, spread],
  );

  const handleSelect = useCallback((siteId: string) => latest.current.onSelectSite(siteId), []);
  const handleZoom = useCallback((clusterId: string) => {
    const cluster = clustersRef.current.find((c) => c.id === clusterId);
    // Frame its sites, but at least halve the view, so a tap always gets closer.
    if (cluster) mapRef.current?.animateToRegion(boundsToRegion(cluster.bounds, { within: regionRef.current }), ZOOM_MS);
  }, []);
  const handleLongPress = useCallback((e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    latest.current.onLongPress(latitude, longitude);
  }, []);

  // Fly to the site or place the search picked: a site at the closest zoom (where it is a pin of its own), a place framed whole.
  useEffect(() => {
    if (focus) mapRef.current?.animateToRegion(boundsToRegion(focus.bounds, { padding: 1.3 }), FOCUS_MS);
  }, [focus]);

  // Group again once the map has settled (it reports once per move, but several can follow one another).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRegionChangeComplete = useCallback((next: Region) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setRegion((prev) => (sameRegion(prev, next) ? prev : next));
    }, REGION_DEBOUNCE_MS);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const paper = theme.backgroundElement;
  const coralInk = OnFill[scheme].coral;

  return (
    <>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={scheme}
        initialRegion={start}
        // Android moves the camera to a tapped marker by itself, which would fight the zoom to a cluster; iOS never does.
        moveOnMarkerPress={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        onLongPress={handleLongPress}>
        {markers.map((m) =>
          m.count === 1 ? (
            <SitePin
              key={m.id}
              id={m.id}
              latitude={m.lat}
              longitude={m.lng}
              pinColor={m.state === 'match' ? theme.coral : theme.lagoon}
              opacity={m.state === 'other' ? 0.3 : 1}
              label={m.label}
              onSelect={handleSelect}
            />
          ) : (
            <ClusterPin
              key={m.id}
              id={m.id}
              latitude={m.lat}
              longitude={m.lng}
              count={m.count}
              fill={m.state === 'match' ? theme.coral : paper}
              ring={m.state === 'match' ? theme.text : theme.lagoon}
              halo={m.state === 'match' ? theme.coral : theme.lagoon}
              text={m.state === 'match' ? coralInk : theme.text}
              opacity={m.state === 'other' ? 0.3 : 1}
              label={m.label}
              onZoom={handleZoom}
            />
          ),
        )}
      </MapView>

      {/* Over the map, top left: clear of the provider's logo and legal link along the bottom, and of the card. */}
      <View style={[styles.overlay, { pointerEvents: 'box-none' }]}>
        {/* The key, for sighted divers; each pin already says "matches your search" to a screen reader. */}
        {highlightedSiteIds !== null ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.legend, { pointerEvents: 'none', backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder, boxShadow: Shadow[scheme].card }]}>
            <View style={styles.key}>
              <View style={[styles.dot, { backgroundColor: theme.coral, borderColor: theme.text }]} />
              <Text numberOfLines={1} style={[styles.keyText, { color: theme.text }]}>{highlightLabel}</Text>
            </View>
            <View style={styles.key}>
              <View style={[styles.dot, { backgroundColor: theme.lagoon, borderColor: theme.lagoon, opacity: 0.4 }]} />
              <Text style={[styles.keyText, { color: theme.textSecondary }]}>Other sites</Text>
            </View>
          </View>
        ) : null}
        {imported ? <OsmCredit onMap /> : null}
      </View>
    </>
  );
});

/** Whether two regions are the same view, to a thousandth of a screen. */
function sameRegion(a: MapRegion, b: MapRegion): boolean {
  const near = (x: number, y: number, scale: number) => Math.abs(x - y) <= scale * 1e-3;
  return (
    near(a.latitude, b.latitude, a.latitudeDelta) &&
    near(a.longitude, b.longitude, a.longitudeDelta) &&
    near(a.latitudeDelta, b.latitudeDelta, a.latitudeDelta) &&
    near(a.longitudeDelta, b.longitudeDelta, a.longitudeDelta)
  );
}

interface MarkerSpec {
  /** The site's id for a lone site (`count` 1), the cluster's own id otherwise. */
  id: string;
  lat: number;
  lng: number;
  count: number;
  /** While a species filter is on: `match` for a site where it is seen (or a cluster holding one), `other` for the rest. */
  state: 'plain' | 'match' | 'other';
  label: string;
}

/** The plain values a marker is drawn from, including what a screen reader says. `at` moves a lone site's pin off a spot it shares. */
function markerSpec(cluster: SiteCluster, matching: number, filtering: boolean, sitesById: Map<string, DiveSite>, at?: { lat: number; lng: number }): MarkerSpec {
  const state = !filtering ? 'plain' : matching > 0 ? 'match' : 'other';
  if (cluster.count === 1) {
    const site = sitesById.get(cluster.id);
    return {
      id: cluster.id,
      lat: at?.lat ?? cluster.lat,
      lng: at?.lng ?? cluster.lng,
      count: 1,
      state,
      label: site ? `${site.name}, ${site.region}, ${site.country}${state === 'match' ? ', matches your search' : ''}` : cluster.id,
    };
  }
  const near = cluster.place ? ` in ${cluster.place}` : '';
  const matches = state === 'match' ? `, ${matching} ${matching === 1 ? 'matches' : 'match'} your search` : '';
  return { id: cluster.id, lat: cluster.lat, lng: cluster.lng, count: cluster.count, state, label: `${cluster.count} dive sites${near}${matches}` };
}

/** One site: the platform's pin. */
const SitePin = memo(function SitePin({
  id,
  latitude,
  longitude,
  pinColor,
  opacity,
  label,
  onSelect,
}: {
  id: string;
  latitude: number;
  longitude: number;
  pinColor: string;
  opacity: number;
  label: string;
  onSelect: (siteId: string) => void;
}) {
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const handlePress = useCallback(() => onSelect(id), [onSelect, id]);
  return (
    <Marker
      coordinate={coordinate}
      pinColor={pinColor}
      opacity={opacity}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
    />
  );
});

/**
 * Several sites: a roundel of paper with a lagoon ring and the count in it, on a faint wash of
 * lagoon (a coral roundel edged in ink, on a coral wash, when it holds a site the species filter
 * matches). It grows a little with the count. The halo round it is part of the touch target.
 */
const ClusterPin = memo(function ClusterPin({
  id,
  latitude,
  longitude,
  count,
  fill,
  ring,
  halo,
  text,
  opacity,
  label,
  onZoom,
}: {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  fill: string;
  ring: string;
  halo: string;
  text: string;
  opacity: number;
  label: string;
  onZoom: (clusterId: string) => void;
}) {
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const handlePress = useCallback(() => onZoom(id), [onZoom, id]);
  const tracksViewChanges = useSettledTracking(`${count}|${fill}|${ring}|${halo}|${text}`);
  const size = count < 10 ? 34 : count < 100 ? 40 : 46;
  return (
    <Marker
      coordinate={coordinate}
      anchor={CENTRE}
      opacity={opacity}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Zooms in to show them">
      <View style={[styles.halo, { width: size + 14, height: size + 14, borderRadius: (size + 14) / 2, backgroundColor: `${halo}33` }]}>
        <View style={[styles.roundel, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderColor: ring }]}>
          <Text allowFontScaling={false} style={[styles.count, { color: text }]}>
            {count}
          </Text>
        </View>
      </View>
    </Marker>
  );
});

/**
 * Whether a marker whose view is drawn by us should still be watched for changes. The map copies a
 * custom marker's view into an image, and keeps copying it every frame while `tracksViewChanges`
 * is on, which is costly with dozens of markers. Off from the start, though, the first copy can be
 * taken before the view has been laid out and the marker comes up blank. So: on when the marker
 * appears or what it shows changes, off once `SETTLE_MS` has passed. (Only Android and Google Maps on
 * iOS read it; Apple Maps draws the view itself.)
 */
function useSettledTracking(signature: string): boolean {
  const [state, setState] = useState({ signature, tracking: true });
  let current = state;
  if (state.signature !== signature) {
    // Changed: track again from this render, not after it, so the new view is the one that gets copied.
    current = { signature, tracking: true };
    setState(current);
  }
  const tracking = current.tracking;
  useEffect(() => {
    if (!tracking) return;
    const timer = setTimeout(() => setState((s) => (s.signature === signature ? { signature, tracking: false } : s)), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [tracking, signature]);
  return tracking;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    alignItems: 'flex-start',
    gap: 6,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    gap: 12,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  key: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  keyText: {
    flexShrink: 1,
    fontFamily: Type.bodyBold,
    fontSize: 12,
    lineHeight: 16,
  },
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundel: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  count: {
    fontFamily: Type.display,
    fontSize: 15,
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
