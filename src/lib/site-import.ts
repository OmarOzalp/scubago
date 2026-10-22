import type { DiveSite, DiveType, Difficulty, SiteAccess, SiteExternalId, SiteField, SiteSource } from '@/lib/types';

// Relative on purpose: this file also runs under tsx (scripts/osm-sites/import.ts), as seed-supabase.ts does.
import { REGIONS_BY_ID, regionPath } from '../data/regions';

/**
 * Turning OpenStreetMap dive spots into ScubaGo dive sites (docs/osm-sites.md).
 *
 * Everything here is pure: no network, no files, no clock. The script in scripts/osm-sites fetches
 * and writes; this file decides what an OSM element is, where it sits, and how a new import is
 * merged with the one before. Nothing is typed in by hand: every site comes from an element, and
 * every detail a site shows comes from one of its tags.
 */

/** How the OSM contribution is credited on a site's page (the ODbL asks for "© OpenStreetMap contributors"). */
export const OSM_SOURCE_NAME = 'OpenStreetMap contributors';
export const OSM_LICENCE = 'ODbL 1.0';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

// ── Overpass shapes ──────────────────────────────────────────────────────────

/** One element of an Overpass JSON response, as `out center;` returns it. */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  /** Nodes carry their own position; ways and relations carry `center` instead. */
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version?: number;
  generator?: string;
  osm3s?: { timestamp_osm_base?: string; copyright?: string };
  /** Overpass reports a timeout or an out-of-memory run here, with a 200 status and partial elements. */
  remark?: string;
  elements: OverpassElement[];
}

// ── Where we look ────────────────────────────────────────────────────────────

export type ImportArea = 'gbr' | 'egypt';

export interface ImportAreaDef {
  id: ImportArea;
  label: string;
  country: string;
  /** South, west, north, east: the Overpass bounding box, and also the outer limit of what the transform accepts. */
  bbox: readonly [number, number, number, number];
}

/**
 * The two areas the import covers, one Overpass request each.
 *
 * Great Barrier Reef: the Marine Park runs from 10°41'S to 24°30'S, so the box is that band out to
 * 154.5°E, which takes in the inner Coral Sea reefs (Osprey to Marion, Frederick and Saumarez) but
 * not the outer Coral Sea Marine Park or the Torres Strait.
 *
 * Egypt: a box around the Red Sea coast, the Gulf of Suez and the Gulf of Aqaba, 22°N (the Sudan
 * line) to 30.2°N (Suez) and 32°E to 36.8°E (Daedalus and Zabargad are inside). A rectangle also
 * holds Saudi, Jordanian and Israeli shores, so the final country check is `assignRegion`: a site is
 * Egyptian only if it falls inside one of ScubaGo's Egyptian region shapes below. The Overpass
 * `area["ISO3166-1"="EG"]` filter was left out on purpose: whether OSM's Egypt boundary reaches the
 * offshore reefs can't be checked from here, and a miss would drop Brothers or Daedalus silently.
 */
export const IMPORT_AREAS: readonly ImportAreaDef[] = [
  { id: 'gbr', label: 'Great Barrier Reef and inner Coral Sea', country: 'Australia', bbox: [-24.5, 142.2, -10.7, 154.5] },
  { id: 'egypt', label: 'Egyptian Red Sea, Gulf of Suez and Gulf of Aqaba', country: 'Egypt', bbox: [22.0, 32.0, 30.2, 36.8] },
];

type LatLng = readonly [number, number];

/** A rectangle as a polygon: south, west, north, east. */
const box = (s: number, w: number, n: number, e: number): LatLng[] => [[s, w], [s, e], [n, e], [n, w]];

/** Ray casting; points on an edge may fall either way, which is fine for regions this coarse. */
function inPolygon(lat: number, lng: number, polygon: readonly LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    if (latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

const inBox = (lat: number, lng: number, [s, w, n, e]: readonly [number, number, number, number]) => lat >= s && lat <= n && lng >= w && lng <= e;

// ── Great Barrier Reef regions ───────────────────────────────────────────────

/**
 * Where the Great Barrier Reef Marine Park's four management areas meet, as latitudes. These are
 * ScubaGo's approximation from GBRMPA's descriptions of the areas, not the official polygons:
 * Far Northern runs from the Park's northern edge to just south of the Howick Group (so Lizard
 * Island is in Cairns/Cooktown); Cairns/Cooktown to just south of Mission Beach; Townsville/Whitsunday
 * to Midge Point, south of Proserpine; Mackay/Capricorn on to the Park's southern edge at 24°30'S.
 */
export const GBR_BAND_EDGES = { farNorthernSouth: -14.6, cairnsSouth: -18.0, whitsundaySouth: -20.65 } as const;

export function gbrManagementArea(lat: number): string {
  if (lat > GBR_BAND_EDGES.farNorthernSouth) return 'gbr-far-northern';
  if (lat > GBR_BAND_EDGES.cairnsSouth) return 'gbr-cairns-cooktown';
  if (lat > GBR_BAND_EDGES.whitsundaySouth) return 'gbr-townsville-whitsunday';
  return 'gbr-mackay-capricorn';
}

/**
 * A rough line along the outer edge of the Great Barrier Reef (latitude, longitude): east of it
 * is the Coral Sea. It runs outside the outer barrier reefs (Ribbon Reefs, Agincourt, Moore, Hardy,
 * the Swain Reefs) and inside the Coral Sea reefs (Osprey, Bougainville, Holmes, Flinders, Marion,
 * Saumarez). Approximate; the Marine Park boundary from GBRMPA would replace it.
 */
const CORAL_SEA_EDGE: readonly LatLng[] = [
  [-10.7, 145.2], [-13.0, 145.6], [-14.0, 146.0], [-16.0, 146.4], [-17.0, 147.0],
  [-18.0, 148.2], [-19.8, 149.7], [-21.0, 153.0], [-22.0, 153.4], [-24.5, 153.8],
];

/** The longitude of the Coral Sea line at a latitude, interpolated between its points. */
export function coralSeaEdgeLng(lat: number): number {
  for (let i = 1; i < CORAL_SEA_EDGE.length; i++) {
    const [lat0, lng0] = CORAL_SEA_EDGE[i - 1];
    const [lat1, lng1] = CORAL_SEA_EDGE[i];
    if (lat <= lat0 && lat >= lat1) return lng0 + ((lat0 - lat) / (lat0 - lat1)) * (lng1 - lng0);
  }
  return lat > CORAL_SEA_EDGE[0][0] ? CORAL_SEA_EDGE[0][1] : CORAL_SEA_EDGE[CORAL_SEA_EDGE.length - 1][1];
}

// ── Red Sea regions ──────────────────────────────────────────────────────────

/**
 * ScubaGo's own grouping of Egypt's waters, tried in this order (the first shape a point falls in
 * wins), as boxes and polygons of latitude and longitude. Together they are also the country
 * check: a point outside every one of them is not treated as Egyptian.
 *
 * - Offshore: the Brothers (26.15–26.45°N, 34.65–35.05°E), Elphinstone (25.2–25.4°N), Daedalus
 *   (24.8–25.05°N, 35.7–36.05°E), and everything east of 36°E between 22° and 23.8°N, which holds
 *   Rocky Island, Zabargad and St John's.
 * - Gulf of Suez: 28–30.2°N, west of 33.9°E.
 * - Sinai: 27.55–29.5°N, east of 34.15°E, cut off on the sea side by a line drawn roughly down the
 *   middle of the Gulf of Aqaba (west of it Egypt, east of it Saudi Arabia), ending at Taba.
 * - Hurghada: 26.45–28°N, 33–34.4°E: Hurghada, El Gouna, Giftun, Gubal and Safaga, and the
 *   Strait of Gubal where the Sinai box leaves off.
 * - Southern: Marsa Alam, Fury Shoals and the coast on to Berenice, down to 22°N and out to a line
 *   running roughly along the middle of the Red Sea.
 */
const EGYPT_AREAS: readonly { regionId: string; polygon: readonly LatLng[] }[] = [
  { regionId: 'red-sea-offshore', polygon: box(26.15, 34.65, 26.45, 35.05) },
  { regionId: 'red-sea-offshore', polygon: box(25.2, 34.78, 25.4, 34.98) },
  { regionId: 'red-sea-offshore', polygon: box(24.8, 35.7, 25.05, 36.05) },
  { regionId: 'red-sea-offshore', polygon: box(22.0, 36.0, 23.8, 36.8) },
  { regionId: 'gulf-of-suez', polygon: box(28.0, 32.0, 30.2, 33.9) },
  { regionId: 'red-sea-sinai', polygon: [[27.55, 34.15], [27.55, 34.72], [28.0, 34.8], [28.45, 34.66], [29.0, 34.78], [29.5, 34.91], [29.5, 34.15]] },
  { regionId: 'red-sea-hurghada', polygon: box(26.45, 33.0, 28.0, 34.4) },
  { regionId: 'red-sea-southern', polygon: [[26.45, 33.0], [26.45, 35.4], [25.4, 35.7], [24.5, 36.2], [22.0, 36.2], [22.0, 33.0]] },
];

/** Every region id `assignRegion` can give. */
export const IMPORT_REGION_IDS: readonly string[] = [
  ...new Set(['gbr-far-northern', 'gbr-cairns-cooktown', 'gbr-townsville-whitsunday', 'gbr-mackay-capricorn', 'coral-sea', ...EGYPT_AREAS.map((a) => a.regionId)]),
];

/** Which region a position belongs to, and in which import area; null when it is in neither. */
export function assignRegion(lat: number, lng: number): { area: ImportArea; country: string; regionId: string } | null {
  const [gbr, egypt] = IMPORT_AREAS;
  if (inBox(lat, lng, gbr.bbox)) {
    const regionId = lng >= coralSeaEdgeLng(lat) ? 'coral-sea' : gbrManagementArea(lat);
    return { area: 'gbr', country: gbr.country, regionId };
  }
  if (inBox(lat, lng, egypt.bbox)) {
    const hit = EGYPT_AREAS.find((a) => inPolygon(lat, lng, a.polygon));
    if (hit) return { area: 'egypt', country: egypt.country, regionId: hit.regionId };
  }
  return null;
}

/** Which import area a region id belongs to (the GBR bands and the Coral Sea, or an Egyptian one). */
export function areaOfRegion(regionId: string | undefined): ImportArea {
  return regionId === 'coral-sea' || regionId?.startsWith('gbr-') ? 'gbr' : 'egypt';
}

// ── What an OSM element is ───────────────────────────────────────────────────

export type SkipReason =
  | 'not-a-dive-spot'
  | 'dive-business'
  | 'inland-water'
  | 'unnamed'
  | 'no-position'
  | 'outside-area';

export type ElementResult =
  | { ok: true; site: DiveSite; area: ImportArea }
  | { ok: false; reason: SkipReason; ref: string; name?: string };

/** "node/123": how OSM and the site's external id write an element. */
export const osmRef = (element: Pick<OverpassElement, 'type' | 'id'>): string => `${element.type}/${element.id}`;

/** The stable ScubaGo id of an element; sightings and dives refer to it, so it never changes. */
export const osmSiteId = (element: Pick<OverpassElement, 'type' | 'id'>): string => `osm-${element.type}-${element.id}`;

const has = (value: string | undefined) => value !== undefined && value !== '' && value.toLowerCase() !== 'no';

/** The values of a semicolon- or comma-separated tag, lower-cased and trimmed. */
const listOf = (value: string | undefined): string[] =>
  (value ?? '').split(/[;,]/).map((v) => v.trim().toLowerCase()).filter(Boolean);

const LODGING = new Set(['hotel', 'resort', 'hostel', 'guest_house', 'motel', 'apartment', 'chalet', 'camp_site', 'caravan_site']);
const LEISURE_BUSINESS = new Set(['resort', 'marina', 'sports_centre', 'fitness_centre', 'water_park']);
const INLAND_WATER = new Set(['lake', 'pond', 'reservoir', 'river', 'canal', 'stream', 'basin', 'oxbow', 'moat']);
/** Names that belong to a dive business rather than a place: "Blue Planet Dive Centre", "Down Under Diving". */
const BUSINESS_NAME = /\b(?:dive|diving|scuba)\s+(?:cent(?:er|re)|club|shop|school|academy|resort|college|base|cruises?|charters?|tours?|travel)\b|\b(?:diving|scuba)\s*$/i;

/**
 * What the tags say the element is. The OSM wiki marks a dive spot with `sport=scuba_diving` and
 * `scuba_diving:divespot=yes`, but real dive sites in the Great Barrier Reef and the Red Sea are almost
 * all tagged `sport=scuba_diving` alone, often with `tourism=attraction`, a `mooring` or a
 * `scuba_diving:entry:*` key (checked against the live data, October 2026). Dive centres, shops and
 * clubs carry `sport=scuba_diving` too, so:
 *
 * - anything that is also a business (an `amenity`, `shop`, `club`, `office`, `craft` or `building`
 *   tag, a lodging, a resort or marina), or is named like one ("… Dive Centre", "… Diving"), is a
 *   business, even with `divespot=yes`;
 * - `divespot=no` is not a dive spot;
 * - anything else tagged `sport=scuba_diving` or `divespot=yes` is a dive spot.
 */
export function classifyTags(tags: Record<string, string>): 'spot' | SkipReason {
  const business =
    ['amenity', 'shop', 'club', 'office', 'craft', 'building'].some((key) => has(tags[key])) ||
    LODGING.has(tags.tourism ?? '') ||
    LEISURE_BUSINESS.has(tags.leisure ?? '') ||
    BUSINESS_NAME.test(tags['name:en'] ?? tags.name ?? '');
  if (business) return 'dive-business';

  const divespot = (tags['scuba_diving:divespot'] ?? '').toLowerCase();
  const spot = divespot === 'yes' || (divespot !== 'no' && listOf(tags.sport).includes('scuba_diving'));
  if (!spot) return 'not-a-dive-spot';

  if (INLAND_WATER.has(tags.water ?? '') || tags.landuse === 'quarry' || tags.landuse === 'reservoir' || tags.leisure === 'swimming_pool') {
    return 'inland-water';
  }
  return 'spot';
}

/** The name to show: `name:en`, else `name`, with stray whitespace tidied; null when there is none. */
export function siteNameOf(tags: Record<string, string>): string | null {
  const name = (tags['name:en'] ?? tags.name ?? '').replace(/\s+/g, ' ').trim();
  return name || null;
}

const MAX_DEPTH_M = 150;

function depthParts(part: string): number[] | null {
  let text = part.trim().toLowerCase();
  let factor = 1;
  const unit = /\s*(metres|meters|metre|meter|m|feet|foot|ft|')$/.exec(text);
  if (unit) {
    if (unit[1] === 'feet' || unit[1] === 'foot' || unit[1] === 'ft' || unit[1] === "'") factor = 0.3048;
    text = text.slice(0, unit.index).trim();
  }
  const match = /^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?$/.exec(text);
  if (!match) return null;
  return [match[1], match[2]].filter((n): n is string => n !== undefined).map((n) => Math.round(Number(n) * factor * 10) / 10);
}

/**
 * A depth tag in metres: "30", "30 m", "18-32" or "100 ft" (feet are converted). A range gives
 * both ends. Anything unreadable, zero, or deeper than the 150 m the database allows gives null.
 */
export function parseDepthM(value: string | undefined): { min?: number; max: number } | null {
  if (!value) return null;
  const numbers: number[] = [];
  for (const part of value.split(';')) {
    const parsed = depthParts(part);
    if (!parsed) return null;
    numbers.push(...parsed);
  }
  if (numbers.length === 0) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (max <= 0 || max > MAX_DEPTH_M) return null;
  return min < max ? { min, max } : { max };
}

const DIVE_TYPE_ORDER: readonly DiveType[] = ['reef', 'wall', 'wreck', 'drift', 'pinnacle', 'bommie', 'muck', 'cave', 'swim-through', 'pier'];

/**
 * Dive types the tags state. `historic=wreck` is a wreck, `natural=reef` a reef and
 * `natural=cave_entrance` a cave. `scuba_diving:type` (a value or a list) and the older
 * `scuba_diving:type:wreck=yes` style name the others; the wiki's talk page calls these legacy, so
 * they only ever add a type, never take one away.
 */
export function diveTypesFromTags(tags: Record<string, string>): DiveType[] {
  const found = new Set<DiveType>();
  if (tags.historic === 'wreck' || tags['seamark:type'] === 'wreck') found.add('wreck');
  if (tags.natural === 'reef') found.add('reef');
  if (tags.natural === 'cave_entrance') found.add('cave');
  for (const value of listOf(tags['scuba_diving:type'])) {
    const type = DIVE_TYPE_ORDER.find((t) => t === value);
    if (type) found.add(type);
  }
  for (const type of DIVE_TYPE_ORDER) if (tags[`scuba_diving:type:${type}`]?.toLowerCase() === 'yes') found.add(type);
  return DIVE_TYPE_ORDER.filter((t) => found.has(t));
}

/** How a diver gets in, from `scuba_diving:entry` ("boat", "shore", "beach", "liveaboard"; lists allowed). */
export function accessFromTags(tags: Record<string, string>): SiteAccess[] {
  const found = new Set<SiteAccess>();
  for (const value of listOf(tags['scuba_diving:entry'])) {
    if (value === 'boat') found.add('boat');
    else if (value === 'shore' || value === 'beach') found.add('shore');
    else if (value === 'liveaboard') found.add('liveaboard');
  }
  return (['boat', 'shore', 'liveaboard'] as const).filter((a) => found.has(a));
}

const DIFFICULTY_WORDS: Record<string, Difficulty> = {
  beginner: 'beginner', easy: 'beginner', novice: 'beginner',
  intermediate: 'intermediate', medium: 'intermediate',
  advanced: 'advanced', hard: 'advanced', difficult: 'advanced',
  technical: 'technical', expert: 'technical',
};

/** The level from `scuba_diving:difficulty`, when it says one of the words we know. */
export function difficultyFromTags(tags: Record<string, string>): Difficulty | undefined {
  return DIFFICULTY_WORDS[(tags['scuba_diving:difficulty'] ?? '').trim().toLowerCase()];
}

const KIND_WORD: Record<DiveType, string> = {
  reef: 'reef', wall: 'wall', wreck: 'wreck', drift: 'drift', pinnacle: 'pinnacle', bommie: 'bommie',
  muck: 'muck', cave: 'cave', 'swim-through': 'swim-through', pier: 'pier',
};

const WHERE: Record<string, string> = {
  'gbr-far-northern': 'in the Far Northern part of the Great Barrier Reef',
  'gbr-cairns-cooktown': 'in the Cairns/Cooktown part of the Great Barrier Reef',
  'gbr-townsville-whitsunday': 'in the Townsville/Whitsunday part of the Great Barrier Reef',
  'gbr-mackay-capricorn': 'in the Mackay/Capricorn part of the Great Barrier Reef',
  'coral-sea': 'in the Coral Sea',
  'red-sea-sinai': 'off Sinai in the Red Sea',
  'red-sea-hurghada': 'near Hurghada in the Red Sea',
  'red-sea-southern': 'in the southern Egyptian Red Sea',
  'red-sea-offshore': 'offshore in the Egyptian Red Sea',
  'gulf-of-suez': 'in the Gulf of Suez',
};

/**
 * A one-line description made only of what is known: the dive types the tags state and the region
 * we placed it in, "A wreck dive near Hurghada in the Red Sea." It never uses OSM's own `description`
 * text, which is somebody else's prose.
 */
export function blurbFor(diveTypes: readonly DiveType[], regionId: string): string {
  const kind =
    diveTypes.length === 1 ? `A ${KIND_WORD[diveTypes[0]]} dive`
      : diveTypes.length === 2 ? `A ${KIND_WORD[diveTypes[0]]} and ${KIND_WORD[diveTypes[1]]} dive`
        : 'A dive site';
  return `${kind} ${WHERE[regionId] ?? 'in the sea'}.`;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Turn one Overpass element into a dive site, or say why it isn't one. `retrievedOn` is the date
 * (yyyy-mm-dd) the data was fetched, recorded on the site's source.
 */
export function osmElementToSite(element: OverpassElement, retrievedOn: string): ElementResult {
  const ref = osmRef(element);
  const tags = element.tags ?? {};
  const name = siteNameOf(tags) ?? undefined;
  const kind = classifyTags(tags);
  if (kind !== 'spot') return { ok: false, reason: kind, ref, name };
  if (!name) return { ok: false, reason: 'unnamed', ref };

  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'no-position', ref, name };
  }
  const place = assignRegion(lat, lng);
  if (!place || !REGIONS_BY_ID.has(place.regionId)) return { ok: false, reason: 'outside-area', ref, name };

  const depth = parseDepthM(tags['scuba_diving:maxdepth']) ?? parseDepthM(tags.depth);
  const diveTypes = diveTypesFromTags(tags);
  const access = accessFromTags(tags);
  const difficulty = difficultyFromTags(tags);

  // Name, position and region all come from OSM, so 'region' is always credited; the rest only when a tag gave it.
  const fields: SiteField[] = ['region'];
  if (depth) fields.push('depth');
  if (difficulty) fields.push('difficulty');
  if (diveTypes.length) fields.push('dive_types');
  if (access.length) fields.push('access');
  const source: SiteSource = {
    fields,
    source: OSM_SOURCE_NAME,
    url: `https://www.openstreetmap.org/${ref}`,
    license: OSM_LICENCE,
    retrieved: retrievedOn,
  };

  const site: DiveSite = {
    id: osmSiteId(element),
    name,
    lat: round5(lat),
    lng: round5(lng),
    region: regionPath(place.regionId) ?? '',
    country: place.country,
    blurb: blurbFor(diveTypes, place.regionId),
    notableSpecies: [],
    source: 'seed',
    regionId: place.regionId,
    ...(depth?.min !== undefined ? { depthMinM: depth.min } : {}),
    ...(depth ? { depthMaxM: depth.max } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(diveTypes.length ? { diveTypes } : {}),
    ...(access.length ? { access } : {}),
    sources: [source],
    externalIds: [{ scheme: 'osm', id: ref, relation: 'same_as' }],
  };
  return { ok: true, site, area: place.area };
}

// ── Duplicates ───────────────────────────────────────────────────────────────

/** Elements this close with the same name are one place mapped twice (a node and a way, say). */
export const WITHIN_IMPORT_M = 150;
/** An imported site this close to a seed is the seed, whatever it is called. */
export const SEED_NEAR_M = 300;
/** An imported site this close to a seed, with a similar name, is the seed (seed positions are approximate). */
export const SEED_NAME_M = 1500;

/** Metres between two points (haversine). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Words that don't tell two names apart: "the", "and", "reef", "dive site", and the prefixes of ship names. */
const NAME_NOISE = new Set(['the', 'and', 'reef', 'dive', 'site', 'ss', 'mv', 'ms', 'hmas', 'hms', 'uss', 'usat', 'sv']);

/** A name as matching compares it: accents, case, punctuation and the noise words above removed. */
export function normaliseSiteName(name: string): string {
  const tokens = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`´]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const kept = tokens.filter((t) => !NAME_NOISE.has(t));
  return (kept.length > 0 ? kept : tokens).join(' ');
}

/** Edit distance (insert, delete, replace), for names a letter apart. */
function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

/**
 * Whether two names are close enough to be one place: the same once normalised, or one holds all
 * the words of the other ("Blue Hole" and "Dahab Blue Hole"; a lone word needs four letters), or
 * they differ by a single letter in a name of six or more.
 */
export function namesSimilar(a: string, b: string): boolean {
  const na = normaliseSiteName(a);
  const nb = normaliseSiteName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = na.split(' ');
  const wb = nb.split(' ');
  const [small, large] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (small.every((w) => large.includes(w)) && (small.length > 1 || small[0].length >= 4)) return true;
  const ca = na.replace(/ /g, '');
  const cb = nb.replace(/ /g, '');
  return Math.min(ca.length, cb.length) >= 6 && levenshtein(ca, cb) <= 1;
}

const osmRefOfSite = (site: Pick<DiveSite, 'externalIds'>): string | undefined => site.externalIds?.find((e) => e.scheme === 'osm')?.id;

/** Which of two duplicates to keep: one already imported before, else a node over a way over a relation, else the lower OSM id. */
function keeperRank(site: DiveSite, preferIds: ReadonlySet<string>): [number, number, number] {
  const ref = osmRefOfSite(site) ?? '';
  const [type, id] = ref.split('/');
  const typeRank = type === 'node' ? 0 : type === 'way' ? 1 : 2;
  return [preferIds.has(site.id) ? 0 : 1, typeRank, Number(id) || 0];
}

export interface DuplicateGroup {
  kept: string;
  dropped: string[];
  name: string;
}

/**
 * Merge elements that are one place mapped more than once: within 150 m and the same normalised
 * name. The one kept is a site imported before (`preferIds`, so its id and any sightings stay put),
 * else a node over a way over a relation. The others are dropped, with no trace in the output
 * beyond the returned `merged` list.
 */
export function dedupeWithinImport(
  sites: readonly DiveSite[],
  options: { preferIds?: ReadonlySet<string> } = {},
): { sites: DiveSite[]; merged: DuplicateGroup[] } {
  const preferIds = options.preferIds ?? new Set<string>();
  const byName = new Map<string, DiveSite[]>();
  for (const site of sites) {
    const key = normaliseSiteName(site.name) || site.name.toLowerCase();
    const list = byName.get(key);
    if (list) list.push(site);
    else byName.set(key, [site]);
  }

  const dropped = new Set<string>();
  const merged: DuplicateGroup[] = [];
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    // Connected groups: A near B and B near C is one place even if A and C are a little further apart.
    const seen = new Set<string>();
    for (const start of list) {
      if (seen.has(start.id)) continue;
      const group: DiveSite[] = [];
      const queue = [start];
      seen.add(start.id);
      while (queue.length > 0) {
        const current = queue.pop() as DiveSite;
        group.push(current);
        for (const other of list) {
          if (!seen.has(other.id) && distanceM(current.lat, current.lng, other.lat, other.lng) <= WITHIN_IMPORT_M) {
            seen.add(other.id);
            queue.push(other);
          }
        }
      }
      if (group.length < 2) continue;
      group.sort((a, b) => {
        const ra = keeperRank(a, preferIds);
        const rb = keeperRank(b, preferIds);
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || (a.id < b.id ? -1 : 1);
      });
      for (const loser of group.slice(1)) dropped.add(loser.id);
      merged.push({ kept: group[0].id, dropped: group.slice(1).map((s) => s.id).sort(), name: group[0].name });
    }
  }
  merged.sort((a, b) => (a.kept < b.kept ? -1 : 1));
  return { sites: sites.filter((s) => !dropped.has(s.id)), merged };
}

export interface SeedMatch {
  importedId: string;
  seedId: string;
  distanceM: number;
  /** 'near': inside 300 m. 'name': inside 1.5 km with a similar name. */
  basis: 'near' | 'name';
}

/**
 * Which imported sites are really a seed site. A seed matches within 300 m whatever it is called,
 * or within 1.5 km when the names are similar. Each imported site matches at most one seed, the
 * nearest that qualifies.
 */
export function matchSeeds(imported: readonly DiveSite[], seeds: readonly DiveSite[]): SeedMatch[] {
  const matches: SeedMatch[] = [];
  const maxDegrees = SEED_NAME_M / 111000 + 0.002;
  for (const site of imported) {
    let best: SeedMatch | null = null;
    for (const seed of seeds) {
      // A cheap latitude test first: most pairs are on the other side of the world.
      if (Math.abs(seed.lat - site.lat) > maxDegrees) continue;
      const d = distanceM(site.lat, site.lng, seed.lat, seed.lng);
      const basis = d <= SEED_NEAR_M ? 'near' : d <= SEED_NAME_M && namesSimilar(site.name, seed.name) ? 'name' : null;
      if (basis && (!best || d < best.distanceM)) best = { importedId: site.id, seedId: seed.id, distanceM: Math.round(d), basis };
    }
    if (best) matches.push(best);
  }
  return matches;
}

// ── A whole import ───────────────────────────────────────────────────────────

export interface SkippedElement {
  ref: string;
  reason: SkipReason | 'repeated-element';
  name?: string;
}

export interface ImportResult {
  /** The sites kept, sorted by id. */
  sites: DiveSite[];
  skipped: SkippedElement[];
  skippedByReason: Partial<Record<SkippedElement['reason'], number>>;
  /** Elements accepted as dive spots, per import area, before duplicates were merged. */
  acceptedByArea: Record<ImportArea, number>;
  /** Sites kept, per region id. */
  byRegion: Record<string, number>;
  merged: DuplicateGroup[];
}

export const sortById = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * Transform every element of an Overpass response, merge elements that are one place, and sort
 * by id. An element that appears twice (the same id in two responses) counts once.
 */
export function importElements(
  elements: readonly OverpassElement[],
  options: { retrievedOn: string; preferIds?: ReadonlySet<string> },
): ImportResult {
  const skipped: SkippedElement[] = [];
  const accepted: DiveSite[] = [];
  const acceptedByArea: Record<ImportArea, number> = { gbr: 0, egypt: 0 };
  const seen = new Set<string>();
  for (const element of elements) {
    const ref = osmRef(element);
    if (seen.has(ref)) {
      skipped.push({ ref, reason: 'repeated-element' });
      continue;
    }
    seen.add(ref);
    const result = osmElementToSite(element, options.retrievedOn);
    if (result.ok) {
      accepted.push(result.site);
      acceptedByArea[result.area]++;
    } else {
      skipped.push({ ref: result.ref, reason: result.reason, name: result.name });
    }
  }

  const { sites, merged } = dedupeWithinImport(accepted, { preferIds: options.preferIds });
  const skippedByReason: ImportResult['skippedByReason'] = {};
  for (const s of skipped) skippedByReason[s.reason] = (skippedByReason[s.reason] ?? 0) + 1;
  const byRegion: Record<string, number> = {};
  for (const s of sites) if (s.regionId) byRegion[s.regionId] = (byRegion[s.regionId] ?? 0) + 1;
  return { sites: sortById(sites), skipped, skippedByReason, acceptedByArea, byRegion, merged };
}

// ── Merging with the file from last time ─────────────────────────────────────

/** A site as stored in src/data/osm-sites.json: a dive site, and whether OSM has stopped listing it. */
export type OsmSiteRecord = DiveSite & {
  /** True once an import no longer found the element. The site stays in the file so old sightings keep it. */
  retired?: true;
  /** yyyy-mm-dd of the import that first missed it. */
  retiredOn?: string;
};

/** The dive site inside a stored record (without the retirement marks). */
export function siteOfRecord(record: OsmSiteRecord): DiveSite {
  const { retired: _retired, retiredOn: _retiredOn, ...site } = record;
  return site;
}

export interface MergeStats {
  added: string[];
  updated: string[];
  unchanged: number;
  /** Sites OSM no longer lists, retired by this import. */
  retired: string[];
  /** Sites that had been retired and are listed again. */
  revived: string[];
}

/** The same site, ignoring the date it was checked, so a re-run on another day isn't a change. */
function withoutRetrieved(site: DiveSite): string {
  return JSON.stringify({ ...site, sources: site.sources?.map(({ retrieved: _retrieved, ...rest }) => rest) });
}

/**
 * Combine this import (`fresh`) with the stored file (`previous`). A site is never removed: ids are
 * what sightings and dives point at. One OSM stopped listing is kept with `retired: true`, and
 * listed again if it comes back. Sites still listed take their newest details. Sorted by id.
 */
export function mergeWithPrevious(
  previous: readonly OsmSiteRecord[],
  fresh: readonly DiveSite[],
  options: { retiredOn: string },
): { records: OsmSiteRecord[]; stats: MergeStats } {
  const stats: MergeStats = { added: [], updated: [], unchanged: 0, retired: [], revived: [] };
  const before = new Map(previous.map((r) => [r.id, r]));
  const freshIds = new Set(fresh.map((s) => s.id));
  const records: OsmSiteRecord[] = [];

  for (const site of fresh) {
    const old = before.get(site.id);
    if (!old) stats.added.push(site.id);
    else if (old.retired) stats.revived.push(site.id);
    else if (withoutRetrieved(siteOfRecord(old)) === withoutRetrieved(site)) stats.unchanged++;
    else stats.updated.push(site.id);
    records.push(site);
  }
  for (const old of previous) {
    if (freshIds.has(old.id)) continue;
    if (old.retired) {
      records.push(old);
    } else {
      stats.retired.push(old.id);
      records.push({ ...old, retired: true, retiredOn: options.retiredOn });
    }
  }
  return { records: sortById(records), stats };
}

/**
 * Whether an import looks cut short, which would retire most of the file by mistake: it found
 * under half of the sites listed last time (when that was twenty or more).
 */
export function looksTruncated(previousLive: number, found: number): boolean {
  return previousLive >= 20 && found < previousLive / 2;
}

// ── Merging into the app's site list ─────────────────────────────────────────

export interface MergedSites {
  /** What the app lists: the seeds, with OSM ids attached to those OSM also maps, then the imported sites that are new and live. */
  sites: DiveSite[];
  /** Every site that has ever been listed, retired and duplicate ones too, so an old id still resolves. */
  byId: Map<string, DiveSite>;
  retiredIds: Set<string>;
  /** Imported sites that are really a seed. They are not listed again. */
  duplicates: SeedMatch[];
}

/**
 * The app's site list from the curated seeds and the stored OSM import. Retired sites and
 * duplicates of a seed are left out of `sites` but kept in `byId`. A seed OSM also maps gains the
 * element as an `osm` external id; its own lines are never touched (a copy is returned).
 */
export function mergeSites(seeds: readonly DiveSite[], imported: readonly OsmSiteRecord[]): MergedSites {
  const live = sortById(imported.filter((r) => !r.retired).map(siteOfRecord));
  const retired = imported.filter((r) => r.retired).map(siteOfRecord);
  const seedIds = new Set(seeds.map((s) => s.id));
  const candidates = live.filter((s) => !seedIds.has(s.id));

  const duplicates = matchSeeds(candidates, seeds);
  const duplicateIds = new Set(duplicates.map((d) => d.importedId));
  const extra = new Map<string, SiteExternalId[]>();
  for (const d of duplicates) {
    const ref = osmRefOfSite(candidates.find((s) => s.id === d.importedId) ?? {});
    if (!ref) continue;
    const list = extra.get(d.seedId) ?? [];
    list.push({ scheme: 'osm', id: ref, relation: 'same_as' });
    extra.set(d.seedId, list);
  }

  const mergedSeeds = seeds.map((seed) => {
    const add = (extra.get(seed.id) ?? []).filter((e) => !seed.externalIds?.some((x) => x.scheme === e.scheme && x.id === e.id));
    return add.length > 0 ? { ...seed, externalIds: [...(seed.externalIds ?? []), ...add] } : seed;
  });
  const listed = candidates.filter((s) => !duplicateIds.has(s.id));
  const sites = [...mergedSeeds, ...listed];

  const byId = new Map<string, DiveSite>();
  for (const s of retired) if (!seedIds.has(s.id)) byId.set(s.id, s);
  for (const s of candidates) byId.set(s.id, s);
  for (const s of sites) byId.set(s.id, s);
  return { sites, byId, retiredIds: new Set(retired.map((s) => s.id)), duplicates };
}
