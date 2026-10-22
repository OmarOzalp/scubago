import { observationCredit, openLicence, photoCreditFallback } from '@/lib/external-sightings/attribution';
import { isAbortError, ParseError } from '@/lib/external-sightings/errors';
import { haversineKm, isValidLatLng, type LatLng } from '@/lib/external-sightings/geo';
import { buildQuery, fetchJson, hostOf, isRecord, toNumber, toText, type ClientOptions } from '@/lib/external-sightings/http';
import { isAboveSpecies } from '@/lib/external-sightings/names';
import type { OpenLicence, RecentSighting } from '@/lib/external-sightings/types';

/**
 * iNaturalist API v1 (https://api.inaturalist.org/v1/docs/). Written from the documentation, not
 * against the live service: see docs/real-sightings.md.
 */

export const INAT_API = 'https://api.inaturalist.org/v1';
export const INAT_WEBSITE = 'https://www.inaturalist.org';
/** The documented ceiling for per_page is 200 on most endpoints; staying at it is safe everywhere. */
export const SPECIES_COUNTS_PER_PAGE = 200;
/** Pages of species counts read per refresh (200 species each, most-observed first). */
export const MAX_SPECIES_PAGES = 3;
export const OBSERVATIONS_PER_PAGE = 30;
/** How many taxon ids go into the observations request. The catalogue has 120 species. */
export const MAX_TAXON_IDS = 100;
/**
 * The iconic groups every catalogue species falls in (fish, molluscs, reptiles, mammals, and
 * Animalia for the sharks, rays, corals, worms and jellyfish). Leaving out birds, insects,
 * spiders, plants and fungi keeps a site on the coast from filling its pages with land life.
 */
export const MARINE_ICONIC_TAXA = ['Actinopterygii', 'Animalia', 'Mammalia', 'Mollusca', 'Reptilia'] as const;

export interface SiteQuery extends LatLng {
  radiusKm: number;
}

/** GET /observations/species_counts: how many research-grade observations each taxon has near the site. */
export function speciesCountsUrl(site: SiteQuery, page = 1): string {
  return `${INAT_API}/observations/species_counts${buildQuery({
    lat: site.lat,
    lng: site.lng,
    radius: site.radiusKm,
    quality_grade: 'research',
    verifiable: true,
    iconic_taxa: MARINE_ICONIC_TAXA.join(','),
    per_page: SPECIES_COUNTS_PER_PAGE,
    page: page > 1 ? page : undefined,
  })}`;
}

/**
 * GET /observations: the newest openly licensed observations near the site, by the date the animal
 * was seen. `taxonIds` (iNaturalist taxon ids of catalogue species found by the species counts)
 * keeps birds, plants and insects out of a 30-row page.
 */
export function observationsUrl(site: SiteQuery, taxonIds?: readonly number[]): string {
  return `${INAT_API}/observations${buildQuery({
    lat: site.lat,
    lng: site.lng,
    radius: site.radiusKm,
    quality_grade: 'research',
    verifiable: true,
    license: 'cc0,cc-by',
    order_by: 'observed_on',
    order: 'desc',
    per_page: OBSERVATIONS_PER_PAGE,
    taxon_id: taxonIds && taxonIds.length > 0 ? taxonIds.slice(0, MAX_TAXON_IDS).join(',') : undefined,
  })}`;
}

/** The same search on iNaturalist's own website, for "see more there". */
export function inatExploreUrl(site: SiteQuery): string {
  return `${INAT_WEBSITE}/observations${buildQuery({
    lat: site.lat,
    lng: site.lng,
    radius: site.radiusKm,
    quality_grade: 'research',
    verifiable: true,
  })}`;
}

export interface InatSpeciesCount {
  taxonId?: number;
  /** The taxon's scientific name, as iNaturalist writes it. */
  name: string;
  rank?: string;
  count: number;
}

export interface SpeciesCountsPage {
  counts: InatSpeciesCount[];
  /** total_results, when the response says. */
  total?: number;
  /** How many rows the page held, including ones that could not be read. */
  rows: number;
}

/** Read a species_counts response. Rows that are not the documented shape are skipped; no results array is an error. */
export function parseSpeciesCounts(json: unknown): SpeciesCountsPage {
  if (!isRecord(json) || !Array.isArray(json.results)) throw new ParseError('species_counts has no results');
  const counts: InatSpeciesCount[] = [];
  for (const row of json.results) {
    if (!isRecord(row) || !isRecord(row.taxon)) continue;
    const count = toNumber(row.count);
    const name = toText(row.taxon.name);
    if (count === undefined || count < 1 || !name) continue;
    counts.push({
      taxonId: toNumber(row.taxon.id),
      name,
      rank: toText(row.taxon.rank)?.toLowerCase(),
      count: Math.floor(count),
    });
  }
  return { counts, total: toNumber(json.total_results), rows: json.results.length };
}

export interface SpeciesCountsResult {
  counts: InatSpeciesCount[];
  /** There were more taxa than the pages read. */
  truncated: boolean;
}

/** Read up to `maxPages` pages of species counts. A failure on a later page keeps the earlier ones. */
export async function fetchInatSpeciesCounts(
  site: SiteQuery,
  { fetchImpl, signal, maxPages = MAX_SPECIES_PAGES }: ClientOptions & { maxPages?: number } = {},
): Promise<SpeciesCountsResult> {
  const counts: InatSpeciesCount[] = [];
  const seen = new Set<number>();
  let collected = 0;
  let truncated = false;
  for (let page = 1; page <= maxPages; page += 1) {
    let parsed: SpeciesCountsPage;
    try {
      parsed = parseSpeciesCounts(await fetchJson(speciesCountsUrl(site, page), { fetchImpl, signal }));
    } catch (error) {
      if (page === 1 || isAbortError(error)) throw error;
      truncated = true;
      break;
    }
    for (const count of parsed.counts) {
      if (count.taxonId !== undefined) {
        if (seen.has(count.taxonId)) continue;
        seen.add(count.taxonId);
      }
      counts.push(count);
    }
    collected += parsed.rows;
    const complete = parsed.rows === 0
      || parsed.rows < SPECIES_COUNTS_PER_PAGE
      || (parsed.total !== undefined && collected >= parsed.total);
    if (complete) break;
    if (page === maxPages) truncated = true;
  }
  return { counts, truncated };
}

/** One recent observation as iNaturalist described it, reduced to what may be kept. No coordinates. */
export interface InatObservation {
  id: number;
  /** The identified taxon's scientific name. */
  taxonName: string;
  taxonId?: number;
  /** yyyy-mm-dd the animal was seen (observed_on), never created_at. */
  observedOn: string;
  observer: string;
  observerLogin: string;
  url: string;
  licence: OpenLicence;
  credit: string;
  distanceKm?: number;
  locationObscured: boolean;
  photo?: NonNullable<RecentSighting['photo']>;
}

export interface ObservationsResult {
  observations: InatObservation[];
  /** Rows left out: not research grade, not CC0 or CC BY, no observation date, or unreadable. */
  dropped: number;
}

function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Where the observation was, if iNaturalist says: GeoJSON [lng, lat], else the "lat,lng" string. */
function observationPoint(row: Record<string, unknown>): LatLng | undefined {
  if (isRecord(row.geojson) && Array.isArray(row.geojson.coordinates)) {
    const lng = toNumber(row.geojson.coordinates[0]);
    const lat = toNumber(row.geojson.coordinates[1]);
    if (lat !== undefined && lng !== undefined && isValidLatLng(lat, lng)) return { lat, lng };
  }
  if (typeof row.location === 'string') {
    const [lat, lng] = row.location.split(',').map((part) => toNumber(part));
    if (lat !== undefined && lng !== undefined && isValidLatLng(lat, lng)) return { lat, lng };
  }
  return undefined;
}

const HIDING = new Set(['obscured', 'private']);

function isObscured(row: Record<string, unknown>): boolean {
  if (row.obscured === true) return true;
  return [row.geoprivacy, row.taxon_geoprivacy].some((value) => typeof value === 'string' && HIDING.has(value.trim().toLowerCase()));
}

/**
 * The first photo that may be shown: its own licence is CC0 or CC BY, and it is served from the
 * open-data bucket (iNaturalist's other photo hosts are for photos that are not openly licensed).
 */
function openPhoto(photos: unknown, observer: string): InatObservation['photo'] {
  if (!Array.isArray(photos)) return undefined;
  for (const photo of photos) {
    if (!isRecord(photo)) continue;
    const licence = openLicence(photo.license_code);
    const url = toText(photo.url);
    if (!licence || !url || !url.toLowerCase().startsWith('https://') || !hostOf(url).startsWith('inaturalist-open-data.')) continue;
    return { url, licence, attribution: toText(photo.attribution) ?? photoCreditFallback(observer, licence) };
  }
  return undefined;
}

/**
 * Read a /observations response and keep only what may be shown:
 * - research grade, and CC0 or CC BY at the observation level (anything else is dropped);
 * - the observation date (observed_on); a row without one is dropped, and created_at is never read;
 * - the observer's name and login, and the observation page;
 * - a small photo only if the photo's own licence is CC0 or CC BY;
 * - a distance from the site in whole km, not the coordinates, and none for obscured locations.
 */
export function parseObservations(json: unknown, site: LatLng): ObservationsResult {
  if (!isRecord(json) || !Array.isArray(json.results)) throw new ParseError('observations has no results');
  const observations: InatObservation[] = [];
  let dropped = 0;
  for (const row of json.results) {
    const observation = readObservation(row, site);
    if (observation) observations.push(observation);
    else dropped += 1;
  }
  return { observations, dropped };
}

function readObservation(row: unknown, site: LatLng): InatObservation | undefined {
  if (!isRecord(row)) return undefined;
  const id = toNumber(row.id);
  if (id === undefined || !Number.isInteger(id) || id <= 0) return undefined;
  if (typeof row.quality_grade === 'string' && row.quality_grade !== 'research') return undefined;
  const licence = openLicence(row.license_code);
  if (!licence) return undefined;

  const observedOn = toText(row.observed_on) ?? (isRecord(row.observed_on_details) ? toText(row.observed_on_details.date) : undefined);
  if (!observedOn || !isRealDate(observedOn)) return undefined;

  if (!isRecord(row.taxon)) return undefined;
  const taxonName = toText(row.taxon.name);
  if (!taxonName || isAboveSpecies(row.taxon.rank)) return undefined;

  if (!isRecord(row.user)) return undefined;
  const observerLogin = toText(row.user.login);
  if (!observerLogin) return undefined;
  const observer = toText(row.user.name) ?? observerLogin;

  const obscured = isObscured(row);
  const point = obscured ? undefined : observationPoint(row);
  return {
    id,
    taxonName,
    taxonId: toNumber(row.taxon.id),
    observedOn,
    observer,
    observerLogin,
    url: `${INAT_WEBSITE}/observations/${id}`,
    licence,
    credit: observationCredit(observer, licence),
    distanceKm: point ? Math.max(1, Math.ceil(haversineKm(site, point))) : undefined,
    locationObscured: obscured,
    photo: openPhoto(row.photos, observer),
  };
}

/** Read the newest openly licensed observations near the site. */
export async function fetchInatObservations(
  site: SiteQuery,
  taxonIds: readonly number[] | undefined,
  { fetchImpl, signal }: ClientOptions = {},
): Promise<ObservationsResult> {
  return parseObservations(await fetchJson(observationsUrl(site, taxonIds), { fetchImpl, signal }), site);
}
