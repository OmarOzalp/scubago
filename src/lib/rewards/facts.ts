import { REGIONS_BY_ID } from '@/data/regions';
import { UNLISTED_ID } from '@/lib/catalog';
import { effectiveRarity } from '@/lib/rewards/effective-rarity';
import { type Place, placeResolver, REGION_BADGE_IDS, type RegionBadgeId } from '@/lib/rewards/places';
import type { RewardsInput } from '@/lib/rewards/types';
import type { Dive, Rarity, Sighting, Species } from '@/lib/types';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Sightings in the order they happened: by the day seen, then when they were logged, then by id so the order never wavers. */
export const bySighting = (a: Sighting, b: Sighting) => cmp(a.sightedOn, b.sightedOn) || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
/** Dives in the order they happened: by the day dived, then when they were logged, then by id. */
export const byDive = (a: Dive, b: Dive) => cmp(a.divedOn, b.divedOn) || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);

/** The first time the diver logged a species. */
export interface Find {
  species: Species;
  /** yyyy-mm-dd the species was first seen. */
  on: string;
  siteId: string;
}

/**
 * What the evaluators share, worked out once from the input by one chronological pass. The `*Dates`
 * lists hold, for each thing counted, the day its n-th distinct item was first reached: so a ladder
 * badge needing n was earned on `dates[n - 1]`, and `dates.length` is how far along it is.
 */
export interface Facts {
  input: RewardsInput;
  /** Sightings, oldest first. */
  sightings: Sighting[];
  /** Dives, oldest first. */
  dives: Dive[];
  /** One per catalog species the diver has logged, in the order first logged. */
  finds: Find[];
  findOf: ReadonlyMap<string, Find>;
  /** Each catalog species' position in the catalog, to break ties in catalog order. */
  catalogOrder: ReadonlyMap<string, number>;
  rarityOf: (species: Species) => Rarity;
  placeOf: (siteId: string) => Place | undefined;
  /** The days each distinct dive site (one the lookup knows) was first visited, by dive or by sighting. */
  siteDates: string[];
  countryDates: string[];
  regionDates: Record<RegionBadgeId, string[]>;
  /** The highest dive number logged (0 when there are no dives). */
  maxDiveNumber: number;
}

export function buildFacts(input: RewardsInput): Facts {
  const { catalog, observed } = input;
  const sightings = [...input.sightings].sort(bySighting);
  const dives = [...input.dives].sort(byDive);
  const placeOf = placeResolver(input.sites, input.regions ?? REGIONS_BY_ID);

  const findOf = new Map<string, Find>();
  for (const s of sightings) {
    if (s.speciesId === UNLISTED_ID || findOf.has(s.speciesId)) continue;
    const species = catalog.get(s.speciesId);
    if (species) findOf.set(s.speciesId, { species, on: s.sightedOn, siteId: s.siteId });
  }

  // Dives and sightings together, oldest first (dives and sightings of the same day by when they were logged).
  const visits = [
    ...sightings.map((s) => ({ siteId: s.siteId, on: s.sightedOn, at: s.createdAt, id: s.id })),
    ...dives.map((d) => ({ siteId: d.siteId, on: d.divedOn, at: d.createdAt, id: d.id })),
  ].sort((a, b) => cmp(a.on, b.on) || cmp(a.at, b.at) || cmp(a.id, b.id));
  const siteDates: string[] = [];
  const countryDates: string[] = [];
  const regionDates = {} as Record<RegionBadgeId, string[]>;
  for (const id of REGION_BADGE_IDS) regionDates[id] = [];
  const seenSites = new Set<string>();
  const seenCountries = new Set<string>();
  for (const visit of visits) {
    const place = placeOf(visit.siteId);
    if (!place || seenSites.has(visit.siteId)) continue;
    seenSites.add(visit.siteId);
    siteDates.push(visit.on);
    const country = place.country?.toLowerCase();
    if (country && !seenCountries.has(country)) {
      seenCountries.add(country);
      countryDates.push(visit.on);
    }
    for (const id of place.regionBadges) regionDates[id].push(visit.on);
  }

  return {
    input,
    sightings,
    dives,
    finds: [...findOf.values()],
    findOf,
    catalogOrder: new Map([...catalog.keys()].map((id, i) => [id, i])),
    rarityOf: (species) => effectiveRarity(species, observed),
    placeOf,
    siteDates,
    countryDates,
    regionDates,
    maxDiveNumber: dives.reduce((max, d) => (Number.isFinite(d.number) && d.number > max ? d.number : max), 0),
  };
}
