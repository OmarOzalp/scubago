import { memo } from 'react';

import { SiteList } from '@/components/site-list';
import type { SiteMapProps } from '@/components/site-map';

/**
 * Web fallback: the interactive map is native-only (react-native-maps has no web map), so show a
 * browsable site list. No markers are drawn here, so there is nothing to cluster: the list is
 * windowed instead (site-list.tsx) and carries the OpenStreetMap credit under it. The Explore
 * header sits above it on the page (not over it), so the list needs no top inset. Where the native
 * map flies to the site or place the search picked, the list scrolls to it.
 */
export const SiteMap = memo(function SiteMap({ sites, highlightedSiteIds, focus, selectedSiteId, onSelectSite }: SiteMapProps) {
  return (
    <SiteList
      sites={sites}
      highlightedSiteIds={highlightedSiteIds}
      onSelectSite={onSelectSite}
      reveal={focus}
      selectedSiteId={selectedSiteId}
      note="The dive map is available in the iOS and Android apps — here’s the site list."
    />
  );
});
