import { REGIONS, REGIONS_BY_ID, regionPath } from '@/data/regions';
import { matchScore, scoreSites, scoreSpecies } from '@/lib/text-search';
import type { SiteBounds } from '@/lib/site-clusters';
import type { DiveSite, Species } from '@/lib/types';

/**
 * The Explore tab's one search: dive sites, places and animals found by the same words.
 *
 * - **Dive sites** by name, then by region and country ("Ras Mohammed", "Hurghada", "Egypt").
 * - **Places** to look at all at once: a country, or one of the regions in data/regions.ts ("Red
 *   Sea", "Great Barrier Reef"), with the sites in it.
 * - **Animals**, for "Where can I see a…".
 *
 * The sections are ordered by how well each one matched: a site called exactly what was typed comes
 * before everything, a place the query names comes before the sites in it, and animals follow when
 * they match no better. Ties go sites, places, animals. Return picks the first row of the first section.
 */

/** A country or a region, with the dive sites in it. */
export interface Place {
  /** `country:Egypt`, or the region's id. */
  id: string;
  name: string;
  /** What kind of place, and where: "Country", or "Red Sea, Egypt" for a part of the Red Sea. */
  detail: string;
  /** The ids of the dive sites in it (a region's include those of the regions inside it). */
  siteIds: string[];
}

export type ExploreItem =
  | { kind: 'site'; id: string; site: DiveSite }
  | { kind: 'place'; id: string; place: Place }
  | { kind: 'animal'; id: string; species: Species };

export type SectionKind = 'sites' | 'places' | 'animals';

export interface ExploreSection {
  kind: SectionKind;
  /** The heading: "Dive sites", "Places", "Animals". */
  title: string;
  /** Everything that matched, best first (the screen shows the first few until asked for all). */
  items: ExploreItem[];
  /** How well the best of them matched (1–100). */
  score: number;
}

export interface ExploreResults {
  /** The query as typed. */
  query: string;
  /** Only the sections that found something, best first. */
  sections: ExploreSection[];
  /** What Return picks: the first row of the first section. */
  top: ExploreItem | null;
}

export const SECTION_TITLES: Record<SectionKind, string> = { sites: 'Dive sites', places: 'Places', animals: 'Animals' };

/** Where equally good sections go: sites first, as finding a site is the harder search. */
const SECTION_ORDER: SectionKind[] = ['sites', 'places', 'animals'];

/**
 * The countries and regions the dive sites are in, for the "Places" section. A region's sites
 * include those of its child regions, so "Red Sea" has all of Egypt's Red Sea sites; a region with
 * no site is left out. Built once per list of sites.
 */
export function buildPlaces(sites: readonly DiveSite[]): Place[] {
  const byRegion = new Map<string, string[]>();
  const byCountry = new Map<string, string[]>();
  for (const site of sites) {
    const country = site.country.trim();
    if (country) {
      let ids = byCountry.get(country);
      if (!ids) byCountry.set(country, (ids = []));
      ids.push(site.id);
    }
    // The site's region and every region above it.
    for (let region = site.regionId ? REGIONS_BY_ID.get(site.regionId) : undefined; region; region = region.parentId ? REGIONS_BY_ID.get(region.parentId) : undefined) {
      let ids = byRegion.get(region.id);
      if (!ids) byRegion.set(region.id, (ids = []));
      ids.push(site.id);
    }
  }
  const places: Place[] = [];
  for (const region of REGIONS) {
    const siteIds = byRegion.get(region.id);
    if (!siteIds) continue;
    const inside = [regionPath(region.parentId), region.country].filter(Boolean).join(', ');
    places.push({ id: region.id, name: region.name, detail: inside || 'Region', siteIds });
  }
  for (const [country, siteIds] of byCountry) places.push({ id: `country:${country}`, name: country, detail: 'Country', siteIds });
  return places;
}

/** The place's name with the regions above it ("Sinai, Red Sea"), so "red sea" also finds the parts of the Red Sea. */
function placePath(place: Place): string {
  return place.id.startsWith('country:') ? place.name : (regionPath(place.id) ?? place.name);
}

/** Places that match, best first; the biggest first among equals. */
export function searchPlaces(places: readonly Place[], query: string): { place: Place; score: number }[] {
  const hits: { place: Place; score: number }[] = [];
  for (const place of places) {
    const score = matchScore(query, [place.name], [placePath(place)]);
    if (score > 0) hits.push({ place, score });
  }
  return hits.sort((a, b) => b.score - a.score || b.place.siteIds.length - a.place.siteIds.length || a.place.name.localeCompare(b.place.name));
}

/** The sections for what the diver typed. No sections for an empty query. */
export function searchExplore({
  sites,
  places,
  species,
  query,
}: {
  sites: readonly DiveSite[];
  places: readonly Place[];
  species: readonly Species[];
  query: string;
}): ExploreResults {
  const found: ExploreSection[] = [];
  const siteHits = scoreSites(sites, query);
  if (siteHits.length > 0) {
    found.push({
      kind: 'sites',
      title: SECTION_TITLES.sites,
      score: siteHits[0].score,
      items: siteHits.map(({ site }) => ({ kind: 'site', id: site.id, site })),
    });
  }
  const placeHits = searchPlaces(places, query);
  if (placeHits.length > 0) {
    found.push({
      kind: 'places',
      title: SECTION_TITLES.places,
      score: placeHits[0].score,
      items: placeHits.map(({ place }) => ({ kind: 'place', id: place.id, place })),
    });
  }
  const animalHits = scoreSpecies(species, query);
  if (animalHits.length > 0) {
    found.push({
      kind: 'animals',
      title: SECTION_TITLES.animals,
      score: animalHits[0].score,
      items: animalHits.map(({ species: s }) => ({ kind: 'animal', id: s.id, species: s })),
    });
  }
  const sections = found.sort((a, b) => b.score - a.score || SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind));
  return { query, sections, top: sections[0]?.items[0] ?? null };
}

/**
 * How many rows of a section show before "Show all N": six when it is the only one, otherwise
 * fewer, so the next section's heading is on screen without scrolling the results.
 */
export function sectionLimit(index: number, sectionCount: number): number {
  if (sectionCount <= 1) return 6;
  return index === 0 ? 4 : 3;
}

/**
 * The box round some sites, or null for none. It goes the short way round: a place with sites either
 * side of 180° (Fiji) is the few degrees across the line, with its west edge east of its east edge,
 * not the rest of the world between them.
 */
export function boundsOfSites(sites: readonly DiveSite[], ids?: ReadonlySet<string>): SiteBounds | null {
  let south = Infinity;
  let north = -Infinity;
  const lngs: number[] = [];
  for (const site of sites) {
    if (ids && !ids.has(site.id)) continue;
    south = Math.min(south, site.lat);
    north = Math.max(north, site.lat);
    lngs.push(site.lng);
  }
  if (lngs.length === 0) return null;
  // The widest stretch of longitude with no site in it is what the box leaves out: across 180° unless a wider one is elsewhere.
  lngs.sort((a, b) => a - b);
  let west = lngs[0];
  let east = lngs[lngs.length - 1];
  let gap = west + 360 - east;
  for (let i = 1; i < lngs.length; i++) {
    if (lngs[i] - lngs[i - 1] > gap) {
      gap = lngs[i] - lngs[i - 1];
      west = lngs[i];
      east = lngs[i - 1];
    }
  }
  return { south, north, west, east };
}

/**
 * What the empty search suggests, one of each kind. Each is checked against the real data in a test
 * (explore-search.test.js), so a suggestion never comes back empty.
 */
export const SEARCH_EXAMPLES: { query: string; kind: SectionKind; note: string }[] = [
  { query: 'Cod Hole', kind: 'sites', note: 'A dive site' },
  { query: 'Red Sea', kind: 'places', note: 'A place' },
  { query: 'Manta', kind: 'animals', note: 'Where can I see a…' },
];
