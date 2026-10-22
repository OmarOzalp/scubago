import { RARITY_ORDER } from '@/lib/rarity';
import type { Rarity, Species } from '@/lib/types';

/**
 * Rarity from encounters: how often an animal is recorded at dive sites in its own waters
 * (docs/real-rarity.md). Pure. Nothing here reads the network; the per-site records come from
 * `scripts/real-rarity/encounters.ts`, which asks iNaturalist and OBIS once at build time.
 *
 * This file holds the geography (which ocean basin a site is in) and the share: of the dive sites
 * in the basins where an animal lives, the fraction that has it recorded nearby.
 */

/** The catalogue's id for "something else" (UNLISTED_ID in catalog.ts, which imports from the rarity modules). */
const UNLISTED_ID = 'unlisted';

// ── Ocean basins ─────────────────────────────────────────────────────────────

export const BASIN_IDS = [
  'tropical-indo-pacific',
  'tropical-west-atlantic',
  'tropical-east-pacific',
  'tropical-east-atlantic',
  'temperate-north-pacific',
  'temperate-north-atlantic',
  'temperate-southern',
] as const;
export type BasinId = (typeof BASIN_IDS)[number];

export interface Basin {
  id: BasinId;
  /** The full name. */
  name: string;
  /** A short label for "recorded near 6 of 41 Indo-Pacific dive sites". */
  short: string;
  /** The rule, in words (the code is `basinOf`). */
  rule: string;
}

export const BASINS: readonly Basin[] = [
  {
    id: 'tropical-indo-pacific',
    name: 'Tropical Indo-Pacific (Red Sea included)',
    short: 'Indo-Pacific',
    rule: 'Latitude 32 S to 30 N and longitude east of 20 E or west of 140 W: the Red Sea, the Indian Ocean, Southeast Asia, the western and central Pacific, Hawaii and French Polynesia, the warm east coast of southern Africa and Australia.',
  },
  {
    id: 'tropical-west-atlantic',
    name: 'Tropical West Atlantic and Caribbean',
    short: 'Caribbean',
    rule: 'Latitude 25 S to 32.5 N, longitude 98 W to 30 W, on the Atlantic side of the Americas (the Gulf of Mexico, Florida, the Bahamas, Bermuda, Central America’s Caribbean coast, Brazil).',
  },
  {
    id: 'tropical-east-pacific',
    name: 'Tropical Eastern Pacific',
    short: 'Eastern Pacific',
    rule: 'Latitude 6 S to 27 N, east of 140 W, on the Pacific side of the Americas: the Gulf of California, Mexico’s Pacific coast and Revillagigedo, Central America’s Pacific coast, Cocos, Galapagos, Ecuador and northern Peru.',
  },
  {
    id: 'tropical-east-atlantic',
    name: 'Tropical Eastern Atlantic',
    short: 'East Atlantic',
    rule: 'Latitude 18 S to 27 N, longitude 30 W to 20 E: West Africa, Cape Verde, the Gulf of Guinea, St Helena.',
  },
  {
    id: 'temperate-north-pacific',
    name: 'Temperate and cold North Pacific',
    short: 'North Pacific',
    rule: 'North of the tropical limits, longitude east of 100 E or west of 100 W: California and the Pacific North-West, British Columbia, Alaska, Japan north of 30 N, Korea, Russia’s Far East.',
  },
  {
    id: 'temperate-north-atlantic',
    name: 'Temperate and cold North Atlantic (with the Mediterranean)',
    short: 'North Atlantic',
    rule: 'North of the tropical limits, longitude between 100 W and 100 E: Europe and the Mediterranean, Iceland, Norway, the Canaries and Azores, Atlantic Canada and the US north-east.',
  },
  {
    id: 'temperate-southern',
    name: 'Temperate and cold southern waters',
    short: 'Southern temperate',
    rule: 'South of the tropical limits: southern Australia and Tasmania, New Zealand, South Africa’s cold west and south coasts, Chile, Patagonia and the sub-Antarctic.',
  },
];

export const BASINS_BY_ID: ReadonlyMap<BasinId, Basin> = new Map(BASINS.map((basin) => [basin.id, basin]));

export const isBasinId = (value: unknown): value is BasinId => typeof value === 'string' && (BASIN_IDS as readonly string[]).includes(value);

/**
 * Where the Pacific meets the Atlantic across Central America, as [longitude, latitude] points from
 * Mexico’s Isthmus of Tehuantepec to the Panama–Colombia border. A point south of the line is on the
 * Pacific side. Coarse (tens of km at the isthmus): the dive sites there are few, and far from it the
 * line decides nothing.
 */
const AMERICAS_DIVIDE: readonly (readonly [lng: number, lat: number])[] = [
  [-98, 17.3],
  [-94.5, 17.3],
  [-91.5, 15.6],
  [-89.5, 14.8],
  [-87.3, 14.4],
  [-85.2, 12.4],
  [-84.2, 10.3],
  [-82.5, 9.0],
  [-79.8, 9.15],
  [-76.6, 8.4],
];

function divideLatitude(lng: number): number {
  for (let i = 1; i < AMERICAS_DIVIDE.length; i++) {
    const [lng0, lat0] = AMERICAS_DIVIDE[i - 1];
    const [lng1, lat1] = AMERICAS_DIVIDE[i];
    if (lng <= lng1) return lat0 + ((lng - lng0) / (lng1 - lng0)) * (lat1 - lat0);
  }
  return AMERICAS_DIVIDE[AMERICAS_DIVIDE.length - 1][1];
}

/** True for a point on the Pacific side of the Americas (west of 98 W, the South American Pacific coast, or south of the Central American divide). */
function onPacificSide(lat: number, lng: number): boolean {
  if (lng < -98) return true;
  if (lat < 8.4 && lng < -66) return true;
  if (lng > -76.6) return false;
  return lat < divideLatitude(lng);
}

/**
 * The ocean basin of a point, by explicit latitude and longitude rules (`BASINS[].rule` says them in
 * words). The tropical basins are tried first, in this order; whatever is left is temperate or cold
 * and goes to the southern basin (south of the equator), the North Pacific (east of 100 E or west of
 * 100 W) or the North Atlantic (between). Null for coordinates that are not numbers on Earth.
 *
 * The limits are the poleward edge of tropical water, not of the tropics: the Red Sea runs to 30 N
 * and southern Africa’s warm coast to 32 S, while California’s kelp (33 N), Sydney (34 S) and the
 * Mediterranean (30.5 N and up) are temperate. An inland point (a quarry, a lake) falls into whichever
 * rule its coordinates satisfy; it returns no marine records and is dropped by the site filter.
 */
export function basinOf(lat: number, lng: number): BasinId | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const pacific = onPacificSide(lat, lng);
  if (pacific && lat >= -6 && lat <= 27 && lng > -140) return 'tropical-east-pacific';
  if (!pacific && lat >= -25 && lat <= 32.5 && lng >= -98 && lng < -30) return 'tropical-west-atlantic';
  if (lat >= -18 && lat <= 27 && lng >= -30 && lng < 20) return 'tropical-east-atlantic';
  if (lat >= -32 && lat <= 30 && (lng >= 20 || lng <= -140)) return 'tropical-indo-pacific';
  if (lat < 0) return 'temperate-southern';
  return lng >= 100 || lng <= -100 ? 'temperate-north-pacific' : 'temperate-north-atlantic';
}

// ── The per-site records ─────────────────────────────────────────────────────

/** What one source returned for a site: how many species-level taxa it listed, and whether the list was cut at the page or row limit. */
export interface SourceTally {
  taxa: number;
  truncated: boolean;
}

/** Counts of one catalogue species near one site. A source that did not list it is absent. */
export interface SiteSpeciesCounts {
  /** Research-grade iNaturalist observations within the radius. */
  inaturalist?: number;
  /** OBIS occurrence records inside the box around the site. */
  obis?: number;
}

/**
 * What the sources said about one dive site, reduced to what the metric needs: where the site is,
 * how much each source listed there (the effort), and the counts of the catalogue species found.
 * No observation, observer or photo is kept. This is the per-site file the script writes
 * (`encounter-rarity.sites.json`), so the metric can be recomputed offline.
 */
export interface SiteEncounters {
  lat: number;
  lng: number;
  /** Present when iNaturalist answered. */
  inaturalist?: SourceTally;
  /** Present when OBIS was asked and answered. */
  obis?: SourceTally;
  species: Record<string, SiteSpeciesCounts>;
}

/** Which source's records make an animal "recorded" at a site. */
export type PresenceSource = 'either' | 'inaturalist' | 'obis';
export const PRESENCE_SOURCES: readonly PresenceSource[] = ['either', 'inaturalist', 'obis'];

/**
 * A site is used only if its sources listed at least this many species-level taxa (marine animals of
 * any kind, not only the catalogue's). A site where almost nothing at all is recorded says that nobody
 * posts there, not that the animals are absent: a quarry, a lake, a remote reef with no observers.
 */
export const MIN_SITE_TAXA = 20;

/** An animal needs at least this many used sites in its waters to be given a share. */
export const MIN_SITES_IN_WATERS = 5;

/**
 * Records at one site that make an animal "recorded" there. One record is a stray, a tag position or
 * a survey row; three or more from one source near the same site is the least that says the animal is
 * there repeatedly. OBIS ingests iNaturalist's research-grade observations, so the two sources are not
 * added together (that would count an observation twice): one of them has to reach it alone.
 */
export const MIN_RECORDS_PER_SITE = 3;

export interface EncounterOptions {
  presence?: PresenceSource;
  minRecords?: number;
  minSiteTaxa?: number;
  minSites?: number;
}

export const DEFAULT_ENCOUNTER_OPTIONS: Required<EncounterOptions> = {
  presence: 'either',
  minRecords: MIN_RECORDS_PER_SITE,
  minSiteTaxa: MIN_SITE_TAXA,
  minSites: MIN_SITES_IN_WATERS,
};

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** The effort at a site: the most taxa any selected source listed. Undefined when none of the selected sources answered. */
export function siteEffort(site: SiteEncounters, presence: PresenceSource = 'either'): number | undefined {
  const tallies = [presence !== 'obis' ? site.inaturalist : undefined, presence !== 'inaturalist' ? site.obis : undefined].filter((tally): tally is SourceTally => !!tally);
  return tallies.length === 0 ? undefined : Math.max(...tallies.map((tally) => count(tally.taxa)));
}

/** True when the animal is recorded at the site under the presence rule. */
export function isRecordedAt(site: SiteEncounters, speciesId: string, presence: PresenceSource = 'either', minRecords = MIN_RECORDS_PER_SITE): boolean {
  const found = Object.prototype.hasOwnProperty.call(site.species, speciesId) ? site.species[speciesId] : undefined;
  if (!found) return false;
  const inat = presence !== 'obis' && count(found.inaturalist) >= minRecords;
  const obis = presence !== 'inaturalist' && count(found.obis) >= minRecords;
  return inat || obis;
}

// ── The share ────────────────────────────────────────────────────────────────

/** A dive site with curated notable species (`DiveSite.notableSpecies`): only used to say where an animal lives. */
export interface NotableSite {
  lat: number;
  lng: number;
  notableSpecies: readonly string[];
}

export interface EncounterShare {
  /** recordedAt / sites, 0 to 1. */
  share: number;
  /** Used sites in the animal’s waters. */
  sites: number;
  /** Of those, the sites where it is recorded. */
  recordedAt: number;
  /** Its waters: the basins where it is recorded at a used site or listed as notable. */
  basins: BasinId[];
}

export interface SkippedSite {
  id: string;
  reason: string;
}

export interface EncounterShares {
  shares: Map<string, EncounterShare>;
  /** Catalogue species that could not be given a share, with the reason. */
  unresolved: Map<string, string>;
  /** Used sites in each basin. */
  basinSites: Record<BasinId, number>;
  skippedSites: SkippedSite[];
  usedSites: number;
}

const emptyBasinCounts = (): Record<BasinId, number> => Object.fromEntries(BASIN_IDS.map((id) => [id, 0])) as Record<BasinId, number>;

const names = (basins: readonly BasinId[]) => basins.map((id) => BASINS_BY_ID.get(id)?.short ?? id).join(', ');

/**
 * Each catalogue animal’s encounter share.
 *
 * 1. **Used sites.** A site is used when its sources answered and listed at least `minSiteTaxa`
 *    species-level taxa, and its coordinates fall in a basin.
 * 2. **Its waters.** The basins of the used sites where the animal is recorded, plus the basins of
 *    every site that lists it among its `notableSpecies` (the app’s own curation, so an animal the
 *    data never records is still placed where it is known to live). Only basins with a used site count.
 * 3. **The share** is (used sites in its waters where it is recorded) ÷ (used sites in its waters).
 *
 * An animal with no waters, or fewer than `minSites` used sites in them, is unresolved and keeps its
 * catalogue tier: no data says the data is thin, not that the animal is rare.
 */
export function encounterShares(
  catalog: readonly Pick<Species, 'id'>[],
  sites: Readonly<Record<string, SiteEncounters>> | ReadonlyMap<string, SiteEncounters>,
  notableSites: Iterable<NotableSite> = [],
  options: EncounterOptions = {},
): EncounterShares {
  const { presence, minRecords, minSiteTaxa, minSites } = { ...DEFAULT_ENCOUNTER_OPTIONS, ...options };
  const entries = sites instanceof Map ? [...sites.entries()] : Object.entries(sites);

  const used: { id: string; basin: BasinId; site: SiteEncounters }[] = [];
  const skippedSites: SkippedSite[] = [];
  const basinSites = emptyBasinCounts();
  for (const [id, site] of entries) {
    const basin = basinOf(site.lat, site.lng);
    const effort = siteEffort(site, presence);
    if (!basin) skippedSites.push({ id, reason: 'Its coordinates are not on Earth.' });
    else if (effort === undefined) skippedSites.push({ id, reason: 'The sources asked for did not answer for it.' });
    else if (effort < minSiteTaxa) skippedSites.push({ id, reason: `Only ${effort} taxa are recorded near it, fewer than the ${minSiteTaxa} that make a site worth counting.` });
    else {
      used.push({ id, basin, site });
      basinSites[basin] += 1;
    }
  }

  const notableBasins = new Map<string, Set<BasinId>>();
  for (const site of notableSites) {
    const basin = basinOf(site.lat, site.lng);
    if (!basin) continue;
    for (const id of site.notableSpecies) {
      const held = notableBasins.get(id) ?? new Set<BasinId>();
      held.add(basin);
      notableBasins.set(id, held);
    }
  }

  const shares = new Map<string, EncounterShare>();
  const unresolved = new Map<string, string>();
  for (const { id } of catalog) {
    if (id === UNLISTED_ID) continue;
    const recorded = used.filter(({ site }) => isRecordedAt(site, id, presence, minRecords));
    const waters = new Set<BasinId>([...recorded.map(({ basin }) => basin), ...(notableBasins.get(id) ?? [])]);
    const basins = BASIN_IDS.filter((basin) => waters.has(basin) && basinSites[basin] > 0);
    if (basins.length === 0) {
      unresolved.set(
        id,
        waters.size === 0
          ? 'No dive site records it and none lists it as notable, so there is no way to say where its waters are.'
          : `Its waters (${names([...waters] as BasinId[])}) hold no dive site with enough records to count.`,
      );
      continue;
    }
    const inWaters = used.filter(({ basin }) => basins.includes(basin));
    if (inWaters.length < minSites) {
      unresolved.set(id, `Only ${inWaters.length} usable dive site${inWaters.length === 1 ? '' : 's'} in its waters (${names(basins)}); at least ${minSites} are needed.`);
      continue;
    }
    const recordedAt = inWaters.filter(({ site }) => isRecordedAt(site, id, presence, minRecords)).length;
    shares.set(id, { share: recordedAt / inWaters.length, sites: inWaters.length, recordedAt, basins });
  }
  return { shares, unresolved, basinSites, skippedSites, usedSites: used.length };
}

// ── Tiers ────────────────────────────────────────────────────────────────────

/**
 * Percentile bands, from the most often recorded animal down. The hand-assigned catalogue of 120 has
 * 33 common (27.5%), 25 uncommon (20.8%), 31 rare (25.8%), 19 epic (15.8%) and 12 legendary (10.0%);
 * these are those shares rounded to whole percents, so the shape of the collection stays the same and
 * only who sits where changes. Legendary stays the rarest tenth.
 */
export const RARITY_BANDS: readonly { tier: Rarity; percent: number }[] = [
  { tier: 'common', percent: 28 },
  { tier: 'uncommon', percent: 21 },
  { tier: 'rare', percent: 26 },
  { tier: 'epic', percent: 15 },
  { tier: 'legendary', percent: 10 },
];

/** With fewer animals than this the bands mean nothing (3 animals would be one per tier), so no tiers are given. */
export const MIN_SPECIES_FOR_BANDS = 20;

/** Where each band ends, as a count of animals from the top. Whole percents keep the division exact. */
function bandEnds(total: number): { tier: Rarity; end: number }[] {
  let cumulative = 0;
  return RARITY_BANDS.map(({ tier, percent }) => {
    cumulative += percent;
    return { tier, end: Math.round((cumulative * total) / 100) };
  });
}

/** How many of `total` animals each band holds, ignoring ties. 120 gives 34, 25, 31, 18, 12. */
export function bandCounts(total: number): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  if (!Number.isFinite(total) || total <= 0) return counts;
  let previous = 0;
  for (const { tier, end } of bandEnds(Math.floor(total))) {
    counts[tier] = end - previous;
    previous = end;
  }
  return counts;
}

/** How many animals hold each tier. */
export function tierCounts(tiers: Iterable<Rarity>): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (const tier of tiers) if (tier in counts) counts[tier] += 1;
  return counts;
}

export interface TierOptions {
  /** Override MIN_SPECIES_FOR_BANDS. */
  minSpecies?: number;
}

/**
 * Tiers from shares by percentile across the animals given: the highest shares are common, the
 * lowest legendary, in the bands of `RARITY_BANDS`.
 *
 * - A share of 0 is a result (recorded at none of the sites in its waters) and is tiered. A value
 *   that is not a finite number of 0 or more is not, and the "unlisted" id never is.
 * - **Equal shares share a tier: the one at the middle of their block** (the mid-rank), so the tier
 *   does not depend on the order of equal animals. Ties are the rule here, not the exception (a
 *   share is a count over a small number of sites, and many animals sit at 0 or at one site), and a
 *   block of animals recorded at no site must not drift up into a commoner band just because it
 *   starts there.
 * - Fewer than `minSpecies` animals gives an empty map.
 */
export function tiersFromShares(
  shares: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  options: TierOptions = {},
): Map<string, Rarity> {
  const entries = (shares instanceof Map ? [...shares.entries()] : Object.entries(shares))
    .filter((entry): entry is [string, number] => entry[0] !== UNLISTED_ID && typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0);
  const tiers = new Map<string, Rarity>();
  if (entries.length === 0 || entries.length < (options.minSpecies ?? MIN_SPECIES_FOR_BANDS)) return tiers;

  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const ends = bandEnds(entries.length);
  for (let start = 0; start < entries.length; ) {
    let stop = start;
    while (stop < entries.length && entries[stop][1] === entries[start][1]) stop += 1;
    const middle = (start + stop - 1) / 2;
    const tier = (ends.find((band) => middle < band.end) ?? ends[ends.length - 1]).tier;
    for (let i = start; i < stop; i++) tiers.set(entries[i][0], tier);
    start = stop;
  }
  return tiers;
}

// ── The file ─────────────────────────────────────────────────────────────────

/** A catalogue animal that has no tier, and why. It keeps its catalogue tier in the app. */
export interface UnresolvedSpecies {
  id: string;
  scientificName: string;
  reason: string;
}

/** What `src/data/encounter-rarity.json` holds for one animal. */
export interface EncounterEntry extends EncounterShare {
  tier: Rarity;
}

export interface EncounterData {
  version?: 1;
  /** When the records were fetched or recomputed. Null in a file with nothing generated. */
  generatedAt: string | null;
  /**
   * False when the data was generated but its tiers are deliberately not used, because the result did
   * not pass the sanity check (docs/real-rarity.md). The app then keeps the catalogue tiers.
   * Absent means applied.
   */
  applied?: boolean;
  /** Why the tiers are not applied, when `applied` is false. */
  notApplied?: string;
  /** The saved per-site file the records were read from, if not the network. */
  input?: string | null;
  sources?: Record<string, unknown>;
  method?: Record<string, unknown>;
  species: Record<string, EncounterEntry>;
  unresolved?: UnresolvedSpecies[];
}

export interface BuildEncounterOptions {
  catalog: readonly Pick<Species, 'id' | 'scientificName'>[];
  /** The per-site records, by site id. */
  sites: Readonly<Record<string, SiteEncounters>>;
  /** Every dive site with its curated species, whether or not it was asked about. */
  notableSites?: Iterable<NotableSite>;
  generatedAt: string;
  input?: string | null;
  radiusKm: number;
  sourcesAsked?: readonly ('inaturalist' | 'obis')[];
  /** Credit and licence notes written into the file. */
  sources?: Record<string, unknown>;
  options?: { [K in keyof EncounterOptions]?: EncounterOptions[K] | undefined };
  /** Set to write the file with its tiers switched off (see `EncounterData.applied`). */
  notApplied?: string;
}

const definedOnly = <T extends object>(object: T): Partial<T> => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as Partial<T>;

/**
 * The file the script writes: every catalogue animal is either tiered in `species` or listed in
 * `unresolved` with the reason, never both and never neither. Also returns the shares with the
 * counts of used sites, for the log.
 *
 * An animal with a share is tiered by percentile band across the animals that have one
 * (`tiersFromShares`); if fewer than `MIN_SPECIES_FOR_BANDS` have one, none is, and the reason says so.
 */
export function buildEncounterData(build: BuildEncounterOptions): { data: EncounterData; shares: EncounterShares } {
  const options = { ...DEFAULT_ENCOUNTER_OPTIONS, ...definedOnly(build.options ?? {}) };
  const shares = encounterShares(build.catalog, build.sites, build.notableSites ?? [], options);
  const tiers = tiersFromShares(new Map([...shares.shares].map(([id, entry]) => [id, entry.share] as const)));

  const species: Record<string, EncounterEntry> = {};
  const unresolved: UnresolvedSpecies[] = [];
  for (const { id, scientificName } of build.catalog) {
    if (id === UNLISTED_ID) continue;
    const share = shares.shares.get(id);
    const tier = tiers.get(id);
    if (share && tier) {
      species[id] = { share: Math.round(share.share * 10_000) / 10_000, sites: share.sites, recordedAt: share.recordedAt, basins: share.basins, tier };
    } else if (share) {
      unresolved.push({ id, scientificName, reason: `Only ${shares.shares.size} animals could be given a share, fewer than the ${MIN_SPECIES_FOR_BANDS} needed to place any in percentile bands.` });
    } else {
      unresolved.push({ id, scientificName, reason: shares.unresolved.get(id) ?? 'Nothing was worked out for it.' });
    }
  }

  const asked = build.sourcesAsked ?? ['inaturalist', 'obis'];
  const data: EncounterData = {
    version: 1,
    generatedAt: build.generatedAt,
    ...(build.notApplied !== undefined && { applied: false, notApplied: build.notApplied }),
    input: build.input ?? null,
    ...(build.sources && { sources: build.sources }),
    method: {
      summary:
        'For each dive site, iNaturalist (research-grade species_counts, marine groups) and the OBIS checklist say which catalogue animals are recorded within the radius. An animal’s waters are the ocean basins where it is recorded at a used site or listed as notable by a seed site. Its share is the used sites in its waters that have it recorded, divided by the used sites in its waters. Shares are cut into percentile bands across the animals that have one.',
      radiusKm: build.radiusKm,
      sources: asked,
      presence: options.presence,
      minRecordsPerSite: options.minRecords,
      minSiteTaxa: options.minSiteTaxa,
      minSitesInWaters: options.minSites,
      sitesAsked: Object.keys(build.sites).length,
      sitesUsed: shares.usedSites,
      sitesPerBasin: shares.basinSites,
      basins: BASINS.map(({ id, name, rule }) => ({ id, name, rule })),
      bands: RARITY_BANDS,
      bandsOrder: 'from the animal recorded at the largest share of sites in its waters down',
      minSpecies: MIN_SPECIES_FOR_BANDS,
      ties: 'Animals with equal shares share the tier at the middle of their block.',
    },
    species,
    unresolved,
  };
  return { data, shares };
}

// ── Reading the file ─────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTier = (value: unknown): value is Rarity => typeof value === 'string' && (RARITY_ORDER as string[]).includes(value);
const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isGeneratedAt = (value: unknown): value is string | null => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));

function parseEntry(value: unknown): EncounterEntry | null {
  if (!isRecord(value)) return null;
  const { share, sites, recordedAt, basins, tier } = value;
  if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) return null;
  if (!isWholeNumber(sites) || sites < 1 || !isWholeNumber(recordedAt) || recordedAt > sites) return null;
  if (!Array.isArray(basins) || basins.length === 0 || !basins.every(isBasinId) || new Set(basins).size !== basins.length) return null;
  if (!isTier(tier)) return null;
  return { share, sites, recordedAt, basins: [...basins], tier };
}

function parseUnresolved(value: unknown): UnresolvedSpecies[] | null {
  if (!Array.isArray(value)) return null;
  const list: UnresolvedSpecies[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.scientificName !== 'string' || typeof item.reason !== 'string') return null;
    list.push({ id: item.id, scientificName: item.scientificName, reason: item.reason });
  }
  return list;
}

/**
 * The encounter file, checked. Returns null for anything that is not exactly the shape the script
 * writes (or the empty shape that is checked in): not an object, an animal without a valid share,
 * site counts, basins or tier, and so on. A damaged file is never half-used. Never throws.
 */
export function parseEncounterData(json: unknown): EncounterData | null {
  try {
    if (!isRecord(json) || !isRecord(json.species) || !isGeneratedAt(json.generatedAt)) return null;
    if (json.version !== undefined && json.version !== 1) return null;
    if (json.applied !== undefined && typeof json.applied !== 'boolean') return null;
    if (json.notApplied !== undefined && typeof json.notApplied !== 'string') return null;
    if (json.input !== undefined && json.input !== null && typeof json.input !== 'string') return null;
    for (const key of ['sources', 'method'] as const) {
      if (json[key] !== undefined && !isRecord(json[key])) return null;
    }
    const species: Record<string, EncounterEntry> = {};
    for (const [id, value] of Object.entries(json.species)) {
      const entry = parseEntry(value);
      if (!entry) return null;
      species[id] = entry;
    }
    const unresolved = json.unresolved === undefined ? undefined : parseUnresolved(json.unresolved);
    if (unresolved === null) return null;
    return {
      ...(json.version === 1 && { version: 1 as const }),
      generatedAt: json.generatedAt,
      ...(json.applied !== undefined && { applied: json.applied }),
      ...(json.notApplied !== undefined && { notApplied: json.notApplied }),
      ...(json.input !== undefined && { input: json.input as string | null }),
      ...(json.sources !== undefined && { sources: json.sources as Record<string, unknown> }),
      ...(json.method !== undefined && { method: json.method as Record<string, unknown> }),
      species,
      ...(unresolved !== undefined && { unresolved }),
    };
  } catch {
    return null;
  }
}

/** True when the tiers in a parsed file may be used: it was generated and has not been switched off. */
export const encounterTiersApplied = (data: EncounterData): boolean => data.generatedAt !== null && data.applied !== false;
