/**
 * The requests the real-rarity script makes, and how it reads the answers (docs/real-rarity.md).
 * Pure: nothing here touches the network, so tests can check every URL and parser.
 *
 * Written from the documented APIs, not against the live services:
 *   iNaturalist v1  https://api.inaturalist.org/v1/docs/
 *   OBIS v3         https://api.obis.org/
 * See "Not yet verified against the live APIs" in docs/real-rarity.md.
 *
 * Relative imports on purpose, as in scripts/osm-sites/import.ts. The modules reused from
 * src/lib/external-sightings use the app's `@/` alias inside; tsx resolves it from tsconfig.json,
 * so run the script from the repository root.
 */
import { ParseError } from '../../src/lib/external-sightings/errors';
import { boxToWkt } from '../../src/lib/external-sightings/geo';
import { buildQuery, isRecord, toNumber, toText } from '../../src/lib/external-sightings/http';
import { INAT_API } from '../../src/lib/external-sightings/inaturalist';
import { createNameMatcher, normalizeScientificName } from '../../src/lib/external-sightings/names';
import { OBIS_API } from '../../src/lib/external-sightings/obis';
import { SYNONYMS } from '../../src/lib/external-sightings/synonyms';
import type { RealRarityRegion } from '../../src/lib/real-rarity';
import type { Species } from '../../src/lib/types';

/** A box in degrees, south, west, north, east. */
export type RegionBox = readonly [south: number, west: number, north: number, east: number];

/**
 * The regions `--region` can count in. Coarse boxes, so they also hold some land and neighbouring
 * water; a marine animal recorded on the shore is still a record of it in the region.
 *
 * - gbr: the Great Barrier Reef and inner Coral Sea, the same box as the OpenStreetMap dive-site
 *   import (src/lib/site-import.ts).
 * - red-sea: the whole Red Sea with the Gulf of Suez and the Gulf of Aqaba, from the Strait of
 *   Bab-el-Mandeb (12.5 N) to the head of the Gulf of Suez, stopping short of the Mediterranean
 *   (30.2 N) and of the Gulf of Aden.
 */
export const REGION_BOXES: Readonly<Record<RealRarityRegion, { label: string; box: RegionBox }>> = {
  gbr: { label: 'Great Barrier Reef and inner Coral Sea', box: [-24.5, 142.2, -10.7, 154.5] },
  'red-sea': { label: 'Red Sea, Gulf of Suez and Gulf of Aqaba', box: [12.5, 32.2, 30.2, 43.8] },
};

type Catalog = readonly Pick<Species, 'id' | 'scientificName'>[];

/** "manta alfredi" as the APIs want it: "Manta alfredi". */
export function displayName(normalised: string): string {
  return normalised.charAt(0).toUpperCase() + normalised.slice(1);
}

/**
 * Every name to ask the sources about for one species: its own scientific name first, then the
 * renames and lumps the synonym table holds for it (former genera, splits, the four deliberate
 * lumps). A synonym that the matcher gives to a different species is left out, as the app's own
 * matching does, so the names here are exactly the ones the app counts as this animal.
 */
export function namesForSpecies(
  species: Pick<Species, 'id' | 'scientificName'>,
  catalog: Catalog,
  synonyms: Readonly<Record<string, string>> = SYNONYMS,
): string[] {
  const matcher = createNameMatcher(catalog, synonyms);
  const own = normalizeScientificName(species.scientificName);
  const names = own ? [own] : [];
  for (const name of Object.keys(synonyms)) {
    if (synonyms[name] === species.id && !names.includes(name) && matcher.match(name) === species.id) names.push(name);
  }
  return names.map(displayName);
}

// ── iNaturalist ──────────────────────────────────────────────────────────────

/** Research-grade observations only: the same filter as the in-app client. */
const RESEARCH_GRADE = { quality_grade: 'research', verifiable: true } as const;

/** GET /taxa: which taxon a name is. `rank=species` keeps genera and families out. */
export function inatTaxaUrl(name: string): string {
  return `${INAT_API}/taxa${buildQuery({ q: name, rank: 'species', is_active: true, per_page: 10 })}`;
}

function inatArea(region?: RealRarityRegion) {
  if (!region) return {};
  const [south, west, north, east] = REGION_BOXES[region].box;
  return { nelat: north, nelng: east, swlat: south, swlng: west };
}

/**
 * GET /observations, asking for no rows: only `total_results`, the research-grade observations of
 * these taxa (and everything below them, such as subspecies). `perPage` is 0, or 1 where a server
 * refuses 0.
 */
export function inatObservationsUrl(taxonIds: readonly number[], region?: RealRarityRegion, perPage = 0): string {
  return `${INAT_API}/observations${buildQuery({ taxon_id: taxonIds.join(','), ...RESEARCH_GRADE, ...inatArea(region), per_page: perPage })}`;
}

/** GET /observations/observers: `total_results` is how many different people made those observations. */
export function inatObserversUrl(taxonIds: readonly number[], region?: RealRarityRegion, perPage = 0): string {
  return `${INAT_API}/observations/observers${buildQuery({ taxon_id: taxonIds.join(','), ...RESEARCH_GRADE, ...inatArea(region), per_page: perPage })}`;
}

export interface ResolvedTaxon {
  id: number;
  /** The taxon's own name, as iNaturalist writes it. */
  name: string;
  /** The name asked for was the taxon's own, or another name of it (a synonym). */
  via: 'name' | 'synonym';
}

/**
 * The taxon a name resolves to, from a /taxa response, or null when none does.
 * A result counts only if it is a species, is active, and either is called the name asked for or
 * lists it as another name (`matched_term`). Anything else is a fuzzy hit and is not trusted.
 * The taxon's own name beats a synonym match; then the one with more observations.
 */
export function pickTaxon(json: unknown, wantedName: string): ResolvedTaxon | null {
  if (!isRecord(json) || !Array.isArray(json.results)) throw new ParseError('taxa has no results');
  const wanted = normalizeScientificName(wantedName);
  if (!wanted) return null;
  let best: (ResolvedTaxon & { observations: number }) | null = null;
  for (const row of json.results) {
    if (!isRecord(row) || row.is_active === false) continue;
    if (toText(row.rank)?.toLowerCase() !== 'species') continue;
    const id = toNumber(row.id);
    const name = toText(row.name);
    if (id === undefined || !Number.isInteger(id) || id < 1 || !name) continue;
    const own = normalizeScientificName(name) === wanted;
    const synonym = !own && normalizeScientificName(row.matched_term) === wanted;
    if (!own && !synonym) continue;
    const candidate = { id, name, via: own ? ('name' as const) : ('synonym' as const), observations: toNumber(row.observations_count) ?? 0 };
    if (!best || (candidate.via === 'name' && best.via === 'synonym') || (candidate.via === best.via && candidate.observations > best.observations)) best = candidate;
  }
  return best && { id: best.id, name: best.name, via: best.via };
}

/** `total_results` from an observations or observers response. */
export function parseInatTotal(json: unknown): number {
  const total = isRecord(json) ? toNumber(json.total_results) : undefined;
  if (total === undefined || total < 0) throw new ParseError('The response has no total_results');
  return Math.floor(total);
}

// ── OBIS ─────────────────────────────────────────────────────────────────────

/**
 * GET /occurrence, asking for no rows: only `total`, the records of any of these names. Several
 * names are sent as one comma-separated list, so a record is counted once however many of the names
 * it fits (adding up one request per name could count a renamed species twice). `size` is 0, or 1
 * where a server refuses 0.
 */
export function obisCountUrl(names: readonly string[], region?: RealRarityRegion, size = 0): string {
  let geometry: string | undefined;
  if (region) {
    const [south, west, north, east] = REGION_BOXES[region].box;
    geometry = boxToWkt({ south, north, west, east });
  }
  return `${OBIS_API}/occurrence${buildQuery({ scientificname: names.join(','), geometry, size })}`;
}

/** `total` from an /occurrence response. */
export function parseObisTotal(json: unknown): number {
  const total = isRecord(json) ? toNumber(json.total) : undefined;
  if (total === undefined || total < 0) throw new ParseError('The response has no total');
  return Math.floor(total);
}
