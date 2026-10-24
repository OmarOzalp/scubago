import { REGIONS_BY_ID } from '@/data/regions';
import { canonicalSiteId, RETIRED_SITE_IDS } from '@/data/sites';
import { UNLISTED_ID } from '@/lib/catalog';
import { bySighting, byDive, type Facts } from '@/lib/rewards/facts';
import { type Place, placeResolver } from '@/lib/rewards/places';
import type { RewardsInput } from '@/lib/rewards/types';
import type { Dive, Sighting, Species } from '@/lib/types';

/** The mark one dive site leaves in the passport. */
export interface PassportStamp {
  siteId: string;
  siteName: string;
  /** yyyy-mm-dd of the first dive or sighting there. */
  firstVisitedOn: string;
  lastVisitedOn: string;
  /** The distinct days the diver dived or logged a sighting there. */
  visits: number;
  /** The dives logged there. */
  dives: number;
  /** The catalog species seen there, in the order first seen. */
  speciesIds: string[];
}

/** The stamps of one place: a top-level region, or a country for sites without one. */
export interface PassportGroup {
  /** 'region:<region id>' or 'country:<country, lower case>': stable, safe to store. */
  id: string;
  kind: 'region' | 'country';
  name: string;
  /** Visited sites, most recently visited first. */
  stamps: PassportStamp[];
  /** How many listed sites are in this group, visited or not (and any other with a stamp), to show "3 of 41". */
  knownSites: number;
  firstVisitedOn: string;
  lastVisitedOn: string;
}

interface Tally {
  days: Set<string>;
  dives: number;
  species: Set<string>;
}

/**
 * One stamp for each site in `sightings` and `dives` that `placeOf` knows, a visit logged at a hidden
 * copy of a site going on the listed site's stamp. Both must be oldest first.
 */
function stampsFrom(sightings: readonly Sighting[], dives: readonly Dive[], catalog: ReadonlyMap<string, Species>, placeOf: (siteId: string) => Place | undefined): Map<string, PassportStamp> {
  const tallies = new Map<string, Tally>();
  const tally = (siteId: string) => {
    let t = tallies.get(siteId);
    if (!t) tallies.set(siteId, (t = { days: new Set(), dives: 0, species: new Set() }));
    return t;
  };
  for (const s of sightings) {
    const siteId = canonicalSiteId(s.siteId);
    if (!placeOf(siteId)) continue;
    const t = tally(siteId);
    t.days.add(s.sightedOn);
    if (s.speciesId !== UNLISTED_ID && catalog.has(s.speciesId)) t.species.add(s.speciesId);
  }
  for (const d of dives) {
    const siteId = canonicalSiteId(d.siteId);
    if (!placeOf(siteId)) continue;
    const t = tally(siteId);
    t.days.add(d.divedOn);
    t.dives++;
  }
  const stamps = new Map<string, PassportStamp>();
  for (const [siteId, t] of tallies) {
    const days = [...t.days].sort();
    stamps.set(siteId, {
      siteId,
      siteName: placeOf(siteId)!.site.name,
      firstVisitedOn: days[0],
      lastVisitedOn: days[days.length - 1],
      visits: days.length,
      dives: t.dives,
      speciesIds: [...t.species],
    });
  }
  return stamps;
}

/** The passport: the sites the diver has visited, grouped by top-level region (else country), the most recently visited group first. */
export function passportFrom(facts: Facts): PassportGroup[] {
  const stamps = stampsFrom(facts.sightings, facts.dives, facts.input.catalog, facts.placeOf);
  const groups = new Map<string, PassportGroup>();
  for (const stamp of stamps.values()) {
    const { group } = facts.placeOf(stamp.siteId)!;
    let entry = groups.get(group.id);
    if (!entry) groups.set(group.id, (entry = { ...group, stamps: [], knownSites: 0, firstVisitedOn: stamp.firstVisitedOn, lastVisitedOn: stamp.lastVisitedOn }));
    entry.stamps.push(stamp);
    if (stamp.firstVisitedOn < entry.firstVisitedOn) entry.firstVisitedOn = stamp.firstVisitedOn;
    if (stamp.lastVisitedOn > entry.lastVisitedOn) entry.lastVisitedOn = stamp.lastVisitedOn;
  }
  // Only listed sites are there to visit: a hidden copy is counted as the site it stands for, and a
  // retired one only once stamped. Counting them would leave a page that can never be completed.
  for (const siteId of facts.input.sites.keys()) {
    if (!stamps.has(siteId) && (canonicalSiteId(siteId) !== siteId || RETIRED_SITE_IDS.has(siteId))) continue;
    const group = groups.get(facts.placeOf(siteId)!.group.id);
    if (group) group.knownSites++;
  }
  for (const group of groups.values()) {
    group.stamps.sort((a, b) => b.lastVisitedOn.localeCompare(a.lastVisitedOn) || b.firstVisitedOn.localeCompare(a.firstVisitedOn) || a.siteName.localeCompare(b.siteName));
  }
  return [...groups.values()].sort((a, b) => b.lastVisitedOn.localeCompare(a.lastVisitedOn) || a.name.localeCompare(b.name));
}

/**
 * The stamp for one site (for a site's own page), or null if the diver has never visited it or the
 * lookup does not know it. It is the same stamp the passport shows.
 */
export function siteStamp(siteId: string, input: Pick<RewardsInput, 'sightings' | 'dives' | 'sites' | 'catalog' | 'regions'>): PassportStamp | null {
  const placeOf = placeResolver(input.sites, input.regions ?? REGIONS_BY_ID);
  const at = canonicalSiteId(siteId);
  const sightings = input.sightings.filter((s) => canonicalSiteId(s.siteId) === at).sort(bySighting);
  const dives = input.dives.filter((d) => canonicalSiteId(d.siteId) === at).sort(byDive);
  return stampsFrom(sightings, dives, input.catalog, placeOf).get(at) ?? null;
}
