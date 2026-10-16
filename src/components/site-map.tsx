import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type LongPressEvent } from 'react-native-maps';

import { Radius, Shadow, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import type { DiveSite } from '@/lib/types';

export interface SiteMapProps {
  sites: DiveSite[];
  /** When set (species filter active), only these sites are highlighted; others dim. */
  highlightedSiteIds: Set<string> | null;
  onSelectSite: (siteId: string) => void;
  onLongPress: (lat: number, lng: number) => void;
}

/**
 * World map of dive sites (native). Web gets a list fallback via site-map.web.tsx. Pins are lagoon;
 * while a species filter is on, the sites that match turn coral and a small key says what that means.
 */
export function SiteMap({ sites, highlightedSiteIds, onSelectSite, onLongPress }: SiteMapProps) {
  const mapRef = useRef<MapView>(null);
  const theme = useTheme();
  const scheme = useSchemeName();

  const handleLongPress = (e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onLongPress(latitude, longitude);
  };

  return (
    <>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={scheme}
        initialRegion={{
          latitude: 12,
          longitude: 100,
          latitudeDelta: 60,
          longitudeDelta: 80,
        }}
        onLongPress={handleLongPress}>
        {sites.map((site) => {
          const dimmed = highlightedSiteIds !== null && !highlightedSiteIds.has(site.id);
          const highlighted = highlightedSiteIds !== null && highlightedSiteIds.has(site.id);
          return (
            <Marker
              key={site.id}
              coordinate={{ latitude: site.lat, longitude: site.lng }}
              pinColor={highlighted ? theme.coral : theme.lagoon}
              opacity={dimmed ? 0.3 : 1}
              onPress={() => onSelectSite(site.id)}
              accessibilityRole="button"
              accessibilityLabel={`${site.name}, ${site.region}, ${site.country}${highlighted ? ', matches your search' : ''}`}
            />
          );
        })}
      </MapView>

      {/* The key, for sighted divers; each pin already says "matches your search" to a screen reader. */}
      {highlightedSiteIds !== null ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.legend, { pointerEvents: 'none', backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder, boxShadow: Shadow[scheme].card }]}>
          <View style={styles.key}>
            <View style={[styles.dot, { backgroundColor: theme.coral, borderColor: theme.text }]} />
            <Text style={[styles.keyText, { color: theme.text }]}>Where to see it</Text>
          </View>
          <View style={styles.key}>
            <View style={[styles.dot, { backgroundColor: theme.lagoon, borderColor: theme.lagoon, opacity: 0.4 }]} />
            <Text style={[styles.keyText, { color: theme.textSecondary }]}>Other sites</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  legend: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  key: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  keyText: {
    fontFamily: Type.bodyBold,
    fontSize: 12,
    lineHeight: 16,
  },
});
