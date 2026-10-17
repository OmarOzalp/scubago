import { SiteList } from '@/components/site-list';
import type { SiteMapProps } from '@/components/site-map';

/**
 * Web fallback: the interactive map is native-only, so show a browsable site list. The Explore
 * header sits above it on the page (not over it), so the list needs no top inset.
 */
export function SiteMap({ sites, highlightedSiteIds, onSelectSite }: SiteMapProps) {
  return (
    <SiteList
      sites={sites}
      highlightedSiteIds={highlightedSiteIds}
      onSelectSite={onSelectSite}
      note="The dive map is available in the iOS and Android apps — here’s the site list."
    />
  );
}
