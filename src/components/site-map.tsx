import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, type LongPressEvent } from 'react-native-maps';

import { Ocean } from '@/constants/palette';
import type { DiveSite } from '@/lib/types';

export interface SiteMapProps {
  sites: DiveSite[];
  /** When set (species filter active), only these sites are highlighted; others dim. */
  highlightedSiteIds: Set<string> | null;
  onSelectSite: (siteId: string) => void;
  onLongPress: (lat: number, lng: number) => void;
}

/** World map of dive sites (native). Web gets a list fallback via site-map.web.tsx. */
export function SiteMap({ sites, highlightedSiteIds, onSelectSite, onLongPress }: SiteMapProps) {
  const mapRef = useRef<MapView>(null);

  const handleLongPress = (e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onLongPress(latitude, longitude);
  };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
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
            pinColor={highlighted ? Ocean.pinHighlight : Ocean.pin}
            opacity={dimmed ? 0.3 : 1}
            onPress={() => onSelectSite(site.id)}
          />
        );
      })}
    </MapView>
  );
}
