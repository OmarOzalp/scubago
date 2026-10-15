import { SiteList } from '@/components/site-list';
import type { SiteMapProps } from '@/components/site-map';
import { Spacing } from '@/constants/theme';

/** Web fallback: the interactive map is native-only, so show a browsable site list. */
export function SiteMap({ sites, highlightedSiteIds, onSelectSite }: SiteMapProps) {
  return (
    <SiteList
      sites={sites}
      highlightedSiteIds={highlightedSiteIds}
      onSelectSite={onSelectSite}
      topInset={Spacing.six}
      note="The dive map is available in the iOS and Android apps — here’s the site list."
    />
  );
}
