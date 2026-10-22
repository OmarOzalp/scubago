import { RARITY_ORDER } from '@/lib/rarity';
import type { Rarity, Species } from '@/lib/types';

/**
 * Rarity from encounters: how often an animal is recorded at dive sites in its own waters
 * (docs/real-rarity.md). Pure. Nothing here reads the network; the per-site records come from
 * `scripts/real-rarity/encounters.ts`, which asks iNaturalist and OBIS once at build time.
 *
 * This file holds the geography (which biogeographic province, here called a basin, a site is in), an
 * optional grouping of sites into cells, and the share: of the dive sites in the basins where an animal
 * lives, the fraction that has it recorded nearby.
 */

/** The catalogue's id for "something else" (UNLISTED_ID in catalog.ts, which imports from the rarity modules). */
const UNLISTED_ID = 'unlisted';

// ── Ocean basins ─────────────────────────────────────────────────────────────

export const BASIN_IDS = [
  'tropical-indo-pacific',
  'red-sea',
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
    name: 'Tropical Indo-Pacific (without the Red Sea)',
    short: 'Indo-Pacific',
    rule: 'Latitude 32 S to 30 N and longitude east of 20 E or west of 140 W, except the Red Sea: the Indian Ocean (Maldives, Seychelles, East Africa), the Gulf of Aden and Arabian Sea, Southeast Asia and the Coral Triangle, the Great Barrier Reef, the western and central Pacific, Hawaii and French Polynesia, the warm east coast of southern Africa.',
  },
  {
    id: 'red-sea',
    name: 'Red Sea (with the Gulfs of Suez and Aqaba)',
    short: 'Red Sea',
    rule: 'Inside the polygon RED_SEA: latitude 12.5 N to 30.2 N, between lines drawn inland of the Egyptian, Sudanese and Eritrean coast and beyond the Sinai, Jordanian, Saudi and Yemeni coast. It ends at Bab-el-Mandeb: the Gulf of Aden is not in it.',
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
 * The Red Sea with the Gulfs of Suez and Aqaba, as a ring of [longitude, latitude] points, clockwise
 * from the north-west. Its north edge is 30.2 N (Suez and the head of the Gulf of Aqaba are at 29.5 to
 * 30 N; the Mediterranean is north of 31 N) and its south edge 12.5 N, just short of Bab-el-Mandeb
 * (12.6 N, 43.4 E), so the Gulf of Aden (Djibouti, Aden, Socotra) is not in it. The long sides are
 * drawn a few tenths of a degree out from the coast, on the land side along Egypt, Sudan and Eritrea
 * (Hurghada 33.8 E, Marsa Alam 34.9 E, Port Sudan 37.2 E, Massawa 39.5 E) and on the sea side's far
 * shore along Sinai, Arabia and Yemen (Duba 35.7 E, Yanbu 38.1 E, Jeddah 39.2 E, Jizan 42.6 E). They
 * cut across desert and the Danakil, which hold no dive sites. Luxor, Cairo, Riyadh, Alexandria,
 * Aden and Djibouti are outside; Eilat, Aqaba, Dahab, Sharm, Hurghada, the Brothers, Port Sudan,
 * Jeddah and the Farasan Islands are inside (the tests check each).
 */
const RED_SEA: readonly (readonly [lng: number, lat: number])[] = [
  [32.0, 30.2],
  [35.6, 30.2],
  [35.6, 28.0],
  [36.3, 27.0],
  [37.2, 25.5],
  [38.6, 24.0],
  [39.6, 22.0],
  [41.0, 20.0],
  [42.2, 18.0],
  [43.3, 16.0],
  [43.7, 14.5],
  [43.9, 12.5],
  [41.7, 12.5],
  [39.4, 15.0],
  [37.0, 18.0],
  [36.4, 20.0],
  [35.5, 22.0],
  [34.8, 24.0],
  [33.9, 25.8],
  [33.3, 27.0],
  [32.6, 28.0],
  [32.1, 29.0],
];

/** Ray casting: true when the point is inside the ring. The Red Sea does not cross the antimeridian, so longitude is plain. */
function insideRing(lng: number, lat: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];
    if (latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

/**
 * The biogeographic province (here called a basin) of a point, by explicit latitude and longitude
 * rules (`BASINS[].rule` says them in words). The Red Sea polygon is tried first, because its fauna is
 * its own: it has endemic reef fishes, and widespread Indo-Pacific animals such as the palette
 * surgeonfish (blue tang) and the ocellaris clownfish are not in it.
 * Then the tropical basins, in this order; whatever is left is temperate or cold and goes to the
 * southern basin (south of the equator), the North Pacific (east of 100 E or west of 100 W) or the
 * North Atlantic (between). Null for coordinates that are not numbers on Earth.
 *
 * The limits are the poleward edge of tropical water, not of the tropics: the Red Sea runs to 30 N
 * and southern Africa’s warm coast to 32 S, while California’s kelp (33 N), Sydney (34 S) and the
 * Mediterranean (30.5 N and up) are temperate. An inland point (a quarry, a lake) falls into whichever
 * rule its coordinates satisfy; it returns no marine records and is dropped by the site filter.
 *
 * The Western Indian Ocean (Maldives, East Africa, Seychelles) is deliberately not split from the
 * Coral Triangle and the Pacific: the data holds five used sites there (docs/real-rarity.md).
 */
export function basinOf(lat: number, lng: number): BasinId | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (insideRing(lng, lat, RED_SEA)) return 'red-sea';
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

/**
 * The reach of the optional cell grouping (`cellKm`, `--cells <km>`): dive sites within this many km of
 * each other, directly or through a chain of such sites, are one place, a cell (see `groupIntoCells`).
 * 10 km is twice the 5 km search radius: it links exactly the sites whose search circles touch, which
 * read the same records. **Off by default** (`cellKm: 0`): the share counts dive sites. It is kept for
 * analysis; docs/real-rarity.md has what it gave and why it is not what ships.
 */
export const DEFAULT_CELL_KM = 10;

/**
 * An animal needs at least this many used sites in its waters to be given a share. (With cells on, this
 * many cells.) One site moves a share by 1/n: 9 points at 11 sites (the Caribbean today), 2.5 at 40.
 * `--stability` (scripts/real-rarity/stability.ts) shows how many tiers one site moves, by the size of the
 * animal’s waters; docs/real-rarity.md has the table and what it says about the small Caribbean and
 * cold-water samples.
 */
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
  /** Fewest used sites (cells, with `cellKm`) that an animal’s waters must hold. */
  minSites?: number;
  /** 0 (the default) counts dive sites. Above 0, sites within this many km of each other (directly or through others) are one cell, and cells are counted instead. */
  cellKm?: number;
}

export const DEFAULT_ENCOUNTER_OPTIONS: Required<EncounterOptions> = {
  presence: 'either',
  minRecords: MIN_RECORDS_PER_SITE,
  minSiteTaxa: MIN_SITE_TAXA,
  minSites: MIN_SITES_IN_WATERS,
  cellKm: 0,
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

// ── Cells ────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371.0088;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points in km (haversine). Correct across the antimeridian and at the poles. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Groups points into cells by single linkage: two points are in one cell when they are within `cellKm` of
 * each other, directly or through a chain of points each within `cellKm` of the next. Returns, for each
 * point, the index of the first point of its cell (so equal numbers mean one cell).
 *
 * Why this and not a fixed grid: a place mapped with a dozen dive sites (Hurghada, the Cod Hole) must
 * count once however densely it is mapped, and a grid cannot promise that. Measured on random pairs, a
 * 10 km grid puts 3 km apart in different cells 36% of the time, where a line happens to fall between
 * them, and its edges make the count of cells depend on where the grid starts. Here any two sites within
 * 10 km are one cell, always: 10 km is twice the 5 km search radius, so a pair closer than that has
 * overlapping search circles and reads some of the same records, and a pair farther than that and
 * unlinked does not. The count does not depend on the order of the points.
 *
 * The price is chaining: sites each 8 km from the next along a coast are one cell however long the
 * coast is. In the 329 sites the largest cell holds 46 sites over 32 km and the widest spans 52 km;
 * `largestCell` and `widestCell` in the file and in the log report both on every run, so a chain that
 * grows with a bigger import is seen.
 */
export function groupIntoCells(points: readonly { lat: number; lng: number }[], cellKm: number = DEFAULT_CELL_KM): number[] {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    for (let node = i; parent[node] !== root; ) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  // Sweep south to north: a point can only be within `cellKm` of those within `cellKm` of latitude (110.5 km
  // is shorter than a degree of latitude anywhere, so the band is never too narrow).
  const band = cellKm / 110.5;
  const order = points.map((_, i) => i).sort((a, b) => points[a].lat - points[b].lat || a - b);
  for (let i = 0; i < order.length; i++) {
    const a = points[order[i]];
    for (let j = i + 1; j < order.length && points[order[j]].lat - a.lat <= band; j++) {
      const b = points[order[j]];
      if (distanceKm(a.lat, a.lng, b.lat, b.lng) <= cellKm) {
        const [rootA, rootB] = [find(order[i]), find(order[j])];
        if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB); // the root is the lowest index of the cell
      }
    }
  }
  return points.map((_, i) => find(i));
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
  /** Used dive sites in the animal’s waters (cells, `groupIntoCells`, when `cellKm` is above 0). */
  sites: number;
  /** Of those, the ones where it is recorded (a cell counts when any used site in it records the animal). */
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
  /** Cells with a used site in each basin (a cell cut by a basin edge counts in both). */
  basinCells: Record<BasinId, number>;
  skippedSites: SkippedSite[];
  usedSites: number;
  /** Cells with a used site, summed over the basins. */
  usedCells: number;
  /** The cell holding the most used sites, and the greatest distance between two of them. */
  largestCell: { sites: number; spanKm: number };
  /** The cell with the greatest distance between two of its sites, and how many it holds: how far chaining has gone. */
  widestCell: { sites: number; spanKm: number };
}

const emptyBasinCounts = (): Record<BasinId, number> => Object.fromEntries(BASIN_IDS.map((id) => [id, 0])) as Record<BasinId, number>;

const names = (basins: readonly BasinId[]) => basins.map((id) => BASINS_BY_ID.get(id)?.short ?? id).join(', ');

/**
 * Each catalogue animal’s encounter share.
 *
 * 1. **Used sites.** A site is used when its sources answered and listed at least `minSiteTaxa`
 *    species-level taxa, and its coordinates fall in a basin.
 * 2. **Cells (optional).** With `cellKm` above 0, used sites within `cellKm` of each other, directly or
 *    through a chain (`groupIntoCells`), are one cell within their basin, and cells are counted instead
 *    of sites: a place mapped with a dozen dive sites then counts once, and an animal is recorded in a
 *    cell when it is recorded at any used site in it. Off by default, so each site counts.
 * 3. **Its waters.** The basins of the used sites where the animal is recorded, plus the basins of
 *    every site that lists it among its `notableSpecies` (the app’s own curation, so an animal the
 *    data never records is still placed where it is known to live). Only basins with a used site count.
 * 4. **The share** is (sites in its waters where it is recorded) ÷ (used sites in its waters), or the
 *    same over cells.
 *
 * An animal with no waters, or fewer than `minSites` sites (cells) in them, is unresolved and keeps its
 * catalogue tier: no data says the data is thin, not that the animal is rare.
 */
export function encounterShares(
  catalog: readonly Pick<Species, 'id'>[],
  sites: Readonly<Record<string, SiteEncounters>> | ReadonlyMap<string, SiteEncounters>,
  notableSites: Iterable<NotableSite> = [],
  options: EncounterOptions = {},
): EncounterShares {
  const { presence, minRecords, minSiteTaxa, minSites, cellKm } = { ...DEFAULT_ENCOUNTER_OPTIONS, ...options };
  const entries = sites instanceof Map ? [...sites.entries()] : Object.entries(sites);

  const used: { id: string; basin: BasinId; cell: string; site: SiteEncounters }[] = [];
  const skippedSites: SkippedSite[] = [];
  const basinSites = emptyBasinCounts();
  const usable: { id: string; basin: BasinId; site: SiteEncounters }[] = [];
  for (const [id, site] of entries) {
    const basin = basinOf(site.lat, site.lng);
    const effort = siteEffort(site, presence);
    if (!basin) skippedSites.push({ id, reason: 'Its coordinates are not on Earth.' });
    else if (effort === undefined) skippedSites.push({ id, reason: 'The sources asked for did not answer for it.' });
    else if (effort < minSiteTaxa) skippedSites.push({ id, reason: `Only ${effort} taxa are recorded near it, fewer than the ${minSiteTaxa} that make a site worth counting.` });
    else {
      usable.push({ id, basin, site });
      basinSites[basin] += 1;
    }
  }
  // Cells are made within a province: a chain does not cross a province line, and a cell cut by one counts in both.
  const basinCells = emptyBasinCounts();
  let largestCell = { sites: 0, spanKm: 0 };
  let widestCell = { sites: 0, spanKm: 0 };
  for (const basin of BASIN_IDS) {
    const here = usable.filter((entry) => basin === entry.basin);
    const cellOfSite = cellKm > 0 ? groupIntoCells(here.map(({ site }) => site), cellKm) : here.map((_, i) => i); // off: every site is its own cell
    const members = new Map<number, typeof here>();
    here.forEach((entry, i) => {
      used.push({ ...entry, cell: `${basin}/${cellOfSite[i]}` });
      const group = members.get(cellOfSite[i]);
      if (group) group.push(entry);
      else members.set(cellOfSite[i], [entry]);
    });
    basinCells[basin] = members.size;
    for (const group of members.values()) {
      let spanKm = 0;
      for (const a of group) for (const b of group) spanKm = Math.max(spanKm, distanceKm(a.site.lat, a.site.lng, b.site.lat, b.site.lng));
      const found = { sites: group.length, spanKm: Math.round(spanKm) };
      if (found.sites > largestCell.sites) largestCell = found;
      if (found.spanKm > widestCell.spanKm || (found.spanKm === widestCell.spanKm && found.sites > widestCell.sites)) widestCell = found;
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
    const basins = BASIN_IDS.filter((basin) => waters.has(basin) && basinCells[basin] > 0);
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
    const cells = new Set(inWaters.map(({ cell }) => cell));
    if (cells.size < minSites) {
      const noun = cellKm > 0 ? `dive area${cells.size === 1 ? '' : 's'} (cells of sites within ${cellKm} km)` : `dive site${cells.size === 1 ? '' : 's'}`;
      unresolved.set(id, `Only ${cells.size} usable ${noun} in its waters (${names(basins)}); at least ${minSites} are needed.`);
      continue;
    }
    const recordedCells = new Set(inWaters.filter(({ site }) => isRecordedAt(site, id, presence, minRecords)).map(({ cell }) => cell));
    shares.set(id, { share: recordedCells.size / cells.size, sites: cells.size, recordedAt: recordedCells.size, basins });
  }
  const usedCells = BASIN_IDS.reduce((sum, basin) => sum + basinCells[basin], 0);
  return { shares, unresolved, basinSites, basinCells, skippedSites, usedSites: used.length, usedCells, largestCell, widestCell };
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
        'For each dive site, iNaturalist (research-grade species_counts, marine groups) and the OBIS checklist say which catalogue animals are recorded within the radius. An animal’s waters are the biogeographic basins (the Red Sea is its own) where it is recorded at a used site or listed as notable by a seed site. Its share is the used sites in its waters that have it recorded, divided by the used sites in its waters (when cellKm is above 0, the same over cells of sites within cellKm of each other). Shares are cut into percentile bands across the animals that have one.',
      radiusKm: build.radiusKm,
      sources: asked,
      presence: options.presence,
      minRecordsPerSite: options.minRecords,
      minSiteTaxa: options.minSiteTaxa,
      minSitesInWaters: options.minSites,
      cellKm: options.cellKm,
      sitesAsked: Object.keys(build.sites).length,
      sitesUsed: shares.usedSites,
      sitesPerBasin: shares.basinSites,
      ...(options.cellKm > 0 && { cellsUsed: shares.usedCells, cellsPerBasin: shares.basinCells, largestCell: shares.largestCell, widestCell: shares.widestCell }),
      basins: BASINS.map(({ id, name, rule }) => ({ id, name, rule })),
      bands: RARITY_BANDS,
      bandsOrder: 'from the animal recorded at the largest share of the sites in its waters down',
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
