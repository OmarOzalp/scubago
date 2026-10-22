import type { DiveSite, Region } from '@/lib/types';

/** The regions that have badges of their own, named by the region id each is expected to carry. */
export type RegionBadgeId = 'great-barrier-reef' | 'red-sea';

/**
 * How a site is known to be in a badge region. A site is in one when its `regionId`, or any region
 * above it, is one of `regionIds` or is named like `namePattern` (so the importer's own ids work);
 * failing that, when its country and its free-text `region` match the fallback. That fallback is
 * for sites with no structured region (the seed sites, and ones a diver adds), and is never
 * written in terms of site ids.
 */
export interface RegionBadgeRegion {
  name: string;
  regionIds: readonly string[];
  namePattern: RegExp;
  fallback: { countries: readonly string[]; regionText: RegExp };
}

export const REGION_BADGES: Record<RegionBadgeId, RegionBadgeRegion> = {
  'great-barrier-reef': {
    name: 'Great Barrier Reef',
    regionIds: ['great-barrier-reef'],
    namePattern: /great barrier reef/i,
    fallback: { countries: ['Australia'], regionText: /great barrier reef/i },
  },
  'red-sea': {
    name: 'Red Sea',
    regionIds: ['red-sea'],
    namePattern: /\bred sea\b/i,
    fallback: {
      countries: ['Egypt', 'Sudan', 'Saudi Arabia', 'Jordan', 'Israel', 'Eritrea'],
      // The sea itself, its two gulfs, and the dive areas the seed sites use for it.
      regionText: /\bred sea\b|gulf of (?:aqaba|suez)|\b(?:sinai|ras mohammed|dahab|sharm|hurghada|safaga|marsa alam|quseir|aqaba|eilat)\b/i,
    },
  },
};
export const REGION_BADGE_IDS = Object.keys(REGION_BADGES) as RegionBadgeId[];

/** Where a site sits in the passport: its top-level region, or its country when it has none. */
export interface PlaceGroup {
  /** 'region:<region id>' or 'country:<country, lower case>': stable, safe to store. */
  id: string;
  kind: 'region' | 'country';
  name: string;
}

/** What the engine knows of a site: where it is and which badge regions it is in. */
export interface Place {
  site: DiveSite;
  /** The country as written, or null when the site has none. */
  country: string | null;
  group: PlaceGroup;
  regionBadges: readonly RegionBadgeId[];
}

/** A region id and every region above it, nearest first. An id missing from `regions` still counts, and a loop in the data ends the walk. */
export function regionChain(regionId: string | undefined, regions: ReadonlyMap<string, Region>): string[] {
  const chain: string[] = [];
  for (let id = regionId; id && !chain.includes(id); id = regions.get(id)?.parentId) chain.push(id);
  return chain;
}

function badgeRegionsOf(site: DiveSite, chain: readonly string[], regions: ReadonlyMap<string, Region>): RegionBadgeId[] {
  const country = (site.country ?? '').trim().toLowerCase();
  return REGION_BADGE_IDS.filter((id) => {
    const badge = REGION_BADGES[id];
    if (chain.some((regionId) => badge.regionIds.includes(regionId) || badge.namePattern.test(regions.get(regionId)?.name ?? ''))) return true;
    return badge.fallback.countries.some((c) => c.toLowerCase() === country) && badge.fallback.regionText.test(site.region ?? '');
  });
}

/**
 * Where a site belongs in the passport. The group is the top-level region found by walking `regionId`
 * up its `parentId` chain; a site without one that is in a badge region (by its country and region
 * text) is grouped there, so a seed site and an imported one in the same sea share a page; any other
 * site is grouped by country.
 */
export function placeOf(site: DiveSite, regions: ReadonlyMap<string, Region>): Place {
  const chain = regionChain(site.regionId, regions);
  const regionBadges = badgeRegionsOf(site, chain, regions);
  const country = (site.country ?? '').trim() || null;
  const top = chain.filter((id) => regions.has(id)).pop();
  let group: PlaceGroup;
  if (top) group = { id: `region:${top}`, kind: 'region', name: regions.get(top)!.name };
  else if (regionBadges.length > 0) group = { id: `region:${regionBadges[0]}`, kind: 'region', name: REGION_BADGES[regionBadges[0]].name };
  else group = { id: `country:${(country ?? '').toLowerCase()}`, kind: 'country', name: country ?? 'Elsewhere' };
  return { site, country, group, regionBadges };
}

/** `placeOf` for site ids, worked out once per site (undefined for an id the lookup does not have). */
export function placeResolver(sites: ReadonlyMap<string, DiveSite>, regions: ReadonlyMap<string, Region>): (siteId: string) => Place | undefined {
  const known = new Map<string, Place>();
  return (siteId) => {
    const cached = known.get(siteId);
    if (cached) return cached;
    const site = sites.get(siteId);
    if (!site) return undefined;
    const place = placeOf(site, regions);
    known.set(siteId, place);
    return place;
  };
}
