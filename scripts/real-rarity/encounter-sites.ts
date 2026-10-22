/**
 * The per-site half of the encounter script (docs/real-rarity.md): ask iNaturalist and OBIS what is
 * recorded near one dive site, reduce it to the catalogue animals, and read and write the per-site
 * file. Kept apart from the entry point so tests can run it with a stand-in for the network.
 *
 * Relative imports on purpose (see requests.ts). Run from the repository root.
 */
import { buildSiteSightings } from '../../src/lib/external-sightings/summary';
import type { FetchImpl } from '../../src/lib/external-sightings/http';
import { fetchInatSpeciesCounts, type InatSpeciesCount } from '../../src/lib/external-sightings/inaturalist';
import { createNameMatcher, type NameMatcher } from '../../src/lib/external-sightings/names';
import { CHECKLIST_SIZE, fetchObisChecklist, type ObisTaxon } from '../../src/lib/external-sightings/obis';
import { SYNONYMS } from '../../src/lib/external-sightings/synonyms';
import { SPECIES } from '../../src/data/species';
import type { SiteEncounters, SiteSpeciesCounts } from '../../src/lib/encounter-rarity';
import type { Species } from '../../src/lib/types';
import type { PoliteClient } from './client';

/** How far from a dive site an animal can be and still count as recorded there, in km. See "The radius" in docs/real-rarity.md. */
export const DEFAULT_RADIUS_KM = 5;

/**
 * iNaturalist species counts are read up to this many pages of 200 taxa, most observed first. The
 * in-app client reads 3; a busy coast (a pier in California) lists more, and the catalogue animals
 * seen only a few times sit at the tail, so the script reads more.
 */
export const DEFAULT_MAX_PAGES = 20;

/**
 * Names iNaturalist uses today for catalogue animals that `src/lib/external-sightings/synonyms.ts` does
 * not know yet: the three cuttlefish it moved to *Ascarosepion* (checked on 2026-10-22 by looking up
 * the taxon id of every catalogue animal in src/data/real-rarity.json; these were the only three of 129
 * taxa whose current name the matcher did not recognise). Without them the species counts list these
 * animals under a name nothing matches, and they would read as recorded nowhere. The app's synonym
 * table now carries them too; they stay here so the script keeps working if it is run against an older table.
 */
export const CURRENT_INATURALIST_NAMES: Readonly<Record<string, string>> = {
  'ascarosepion latimanus': 'broadclub-cuttlefish',
  'ascarosepion apama': 'giant-cuttlefish',
  'ascarosepion pfefferi': 'flamboyant-cuttlefish',
};

/** The matcher the script uses: the app’s catalogue and synonym table, plus the current iNaturalist names above. */
export function encounterMatcher(catalog: readonly Pick<Species, 'id' | 'scientificName'>[] = SPECIES): NameMatcher {
  return createNameMatcher(catalog, { ...SYNONYMS, ...CURRENT_INATURALIST_NAMES });
}

export interface SiteInput {
  id: string;
  lat: number;
  lng: number;
}

export interface CollectOptions {
  radiusKm: number;
  /** Ask the OBIS checklist as well as iNaturalist. */
  obis: boolean;
  maxPages: number;
  matcher?: NameMatcher;
}

/** A FetchImpl over the polite client, so the reused `fetchInatSpeciesCounts` and `fetchObisChecklist` go through its queue, retries and User-Agent. */
export function politeFetch(client: PoliteClient): FetchImpl {
  return async (url) => {
    const json = await client.getJson(url);
    return { ok: true, status: 200, json: async () => json };
  };
}

/** Taxa at species rank, or of no stated rank (a subspecies row repeats its species). */
const speciesRank = (rank: string | undefined) => rank === undefined || rank === 'species';

export interface SiteReading {
  record: SiteEncounters;
  /** Taxa the sources listed that are in no catalogue animal (not an error; a count for the log). */
  unmatched: { inaturalist: number; obis: number };
}

/**
 * What is recorded near one site, from iNaturalist `species_counts` (research grade, the marine
 * iconic groups) and, when asked, the OBIS checklist (`size=1000`), matched to the catalogue by
 * `buildSiteSightings`, the same code the app uses for a site’s page. A request that still fails
 * after the client’s retries throws; the site is then not counted.
 */
export async function collectSite(client: PoliteClient, site: SiteInput, options: CollectOptions): Promise<SiteReading> {
  const fetchImpl = politeFetch(client);
  const query = { lat: site.lat, lng: site.lng, radiusKm: options.radiusKm };
  const inat = await fetchInatSpeciesCounts(query, { fetchImpl, maxPages: options.maxPages });
  let obisTaxa: ObisTaxon[] | undefined;
  if (options.obis) obisTaxa = (await fetchObisChecklist(query, { fetchImpl })).taxa;

  const summary = buildSiteSightings({
    site: { id: site.id, ...query },
    fetchedAt: new Date(0).toISOString(),
    inat: { ok: true, data: { counts: inat.counts, truncated: inat.truncated, observations: [] } },
    obis: obisTaxa
      ? { ok: true, data: { taxa: obisTaxa, truncated: obisTaxa.length >= CHECKLIST_SIZE } }
      : { ok: false, error: 'not asked', offline: false },
    matcher: options.matcher ?? encounterMatcher(),
  });

  const species: Record<string, SiteSpeciesCounts> = {};
  for (const entry of summary.species) {
    species[entry.speciesId] = {
      ...(entry.inaturalist && { inaturalist: entry.inaturalist.observations }),
      ...(entry.obis && { obis: entry.obis.records }),
    };
  }
  const record: SiteEncounters = {
    lat: site.lat,
    lng: site.lng,
    inaturalist: { taxa: inat.counts.filter((row: InatSpeciesCount) => speciesRank(row.rank)).length, truncated: inat.truncated },
    ...(obisTaxa && { obis: { taxa: obisTaxa.filter((taxon) => speciesRank(taxon.rank)).length, truncated: obisTaxa.length >= CHECKLIST_SIZE } }),
    species,
  };
  return { record, unmatched: summary.unmatched };
}

// ── The per-site file ────────────────────────────────────────────────────────

/** `src/data/encounter-rarity.sites.json`, and the checkpoint of a run in progress. */
export interface SitesFile {
  version: 1;
  /** When the sites were asked. Null in a checkpoint. */
  generatedAt: string | null;
  /** True in a checkpoint (a run that has not finished). */
  partial?: boolean;
  radiusKm: number;
  /** Whether the OBIS checklist was asked as well as iNaturalist. */
  obis: boolean;
  maxPages: number;
  sites: Record<string, SiteEncounters>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function parseTally(value: unknown): SiteEncounters['inaturalist'] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isCount(value.taxa) || typeof value.truncated !== 'boolean') return null;
  return { taxa: value.taxa, truncated: value.truncated };
}

function parseSite(value: unknown): SiteEncounters | null {
  if (!isRecord(value) || typeof value.lat !== 'number' || typeof value.lng !== 'number') return null;
  if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng) || Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) return null;
  if (!isRecord(value.species)) return null;
  const inaturalist = parseTally(value.inaturalist);
  const obis = parseTally(value.obis);
  if (inaturalist === null || obis === null) return null;
  const species: Record<string, SiteSpeciesCounts> = {};
  for (const [id, counts] of Object.entries(value.species)) {
    if (!isRecord(counts)) return null;
    const { inaturalist: inat, obis: records } = counts;
    if ((inat !== undefined && !isCount(inat)) || (records !== undefined && !isCount(records))) return null;
    species[id] = { ...(inat !== undefined && { inaturalist: inat }), ...(records !== undefined && { obis: records }) };
  }
  return { lat: value.lat, lng: value.lng, ...(inaturalist && { inaturalist }), ...(obis && { obis }), species };
}

export interface ParsedSitesFile {
  file: SitesFile;
  /** Site ids whose entries could not be read, and were skipped. */
  ignored: string[];
}

/** A per-site file or checkpoint, checked. Null when it is not one. An entry that is malformed is skipped and named in `ignored`. Never throws. */
export function parseSitesFile(json: unknown): ParsedSitesFile | null {
  try {
    if (!isRecord(json) || json.version !== 1 || !isRecord(json.sites)) return null;
    if (typeof json.radiusKm !== 'number' || !(json.radiusKm > 0) || typeof json.obis !== 'boolean') return null;
    if (json.generatedAt !== null && json.generatedAt !== undefined && (typeof json.generatedAt !== 'string' || !Number.isFinite(Date.parse(json.generatedAt)))) return null;
    const sites: Record<string, SiteEncounters> = {};
    const ignored: string[] = [];
    for (const [id, value] of Object.entries(json.sites)) {
      const site = parseSite(value);
      if (site) sites[id] = site;
      else ignored.push(id);
    }
    return {
      file: {
        version: 1,
        generatedAt: (json.generatedAt as string | null | undefined) ?? null,
        ...(json.partial === true && { partial: true }),
        radiusKm: json.radiusKm,
        obis: json.obis,
        maxPages: isCount(json.maxPages) && json.maxPages > 0 ? json.maxPages : DEFAULT_MAX_PAGES,
        sites,
      },
      ignored,
    };
  } catch {
    return null;
  }
}

/** One site per line, so a re-run shows up as a small diff. */
export function sitesToJson(file: SitesFile): string {
  const lines = Object.entries(file.sites).map(([id, site]) => `    ${JSON.stringify(id)}: ${JSON.stringify(site)}`);
  const head = JSON.stringify({ ...file, sites: '@@sites@@' }, null, 2);
  return `${head.replace('"@@sites@@"', () => (lines.length ? `{\n${lines.join(',\n')}\n  }` : '{}'))}\n`;
}
