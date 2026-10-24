import { observationCredit, SOURCE_CREDITS } from '@/lib/external-sightings/attribution';
import { inatExploreUrl, type InatObservation, type InatSpeciesCount, type SiteQuery } from '@/lib/external-sightings/inaturalist';
import { catalogMatcher, normalizeScientificName, type NameMatcher } from '@/lib/external-sightings/names';
import { OBIS_WEBSITE, type ObisTaxon } from '@/lib/external-sightings/obis';
import type {
  RecentSighting,
  SiteSightings,
  SourceId,
  SourceStatus,
  SpeciesEvidence,
  UnmatchedCounts,
} from '@/lib/external-sightings/types';

/** The search radius around a site, in km, unless a caller says otherwise. */
export const DEFAULT_RADIUS_KM = 3;
const MIN_RADIUS_KM = 0.5;
const MAX_RADIUS_KM = 50;

/** The radius to search for a site: the override if it is a sensible number, else the default. */
export function radiusForSite(override?: number): number {
  if (typeof override !== 'number' || !Number.isFinite(override)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, override));
}

/** How many recent observations a summary keeps, and how many of those may be one species. */
export const MAX_RECENT = 20;
export const MAX_RECENT_PER_SPECIES = 3;

export interface InatData {
  counts: InatSpeciesCount[];
  /** The counts had more taxa than the pages read. */
  truncated: boolean;
  /** Why a later page of the counts could not be read: they are those of the pages before it. */
  countsError?: string;
  /** The newest openly licensed observations (empty when none matched, or when they could not be read). */
  observations: InatObservation[];
  /** Why the observations could not be read, when the counts could. */
  observationsError?: string;
}

export interface ObisData {
  taxa: ObisTaxon[];
  truncated: boolean;
}

export type SourceOutcome<T> = { ok: true; data: T } | { ok: false; error: string; offline: boolean };

export interface BuildInput {
  site: SiteQuery & { id: string };
  /** ISO timestamp of this refresh. */
  fetchedAt: string;
  inat: SourceOutcome<InatData>;
  obis: SourceOutcome<ObisData>;
  /** The summary held before this refresh. A source that failed now keeps its data from here. */
  previous?: SiteSightings | null;
  matcher?: NameMatcher;
}

interface InatSlice {
  species: Map<string, { observations: number; lastObservedOn?: string }>;
  recent: RecentSighting[];
  unmatched: number;
}

interface ObisSlice {
  records: Map<string, number>;
  unmatched: number;
}

function newer(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function inatSliceFromData(data: InatData, matcher: NameMatcher): InatSlice {
  const species = new Map<string, { observations: number; lastObservedOn?: string }>();
  const unmatched = new Set<string>();
  // A subspecies row repeats observations the species row already holds; count the species once.
  const speciesRows = new Set(
    data.counts.filter((row) => row.rank === 'species').map((row) => normalizeScientificName(row.name)),
  );
  for (const row of data.counts) {
    const key = normalizeScientificName(row.name);
    if (row.rank && row.rank !== 'species' && key && speciesRows.has(key)) continue;
    const found = matcher.classify([row.name], row.rank);
    if (found.kind === 'matched') {
      const entry = species.get(found.speciesId) ?? { observations: 0 };
      entry.observations += row.count;
      species.set(found.speciesId, entry);
    } else if (found.kind === 'unmatched' && key) {
      unmatched.add(key);
    }
  }

  const seen = new Set<number>();
  const matched: RecentSighting[] = [];
  for (const observation of data.observations) {
    if (seen.has(observation.id)) continue;
    seen.add(observation.id);
    const found = matcher.classify([observation.taxonName]);
    if (found.kind !== 'matched') continue;
    matched.push(toRecent(observation, found.speciesId));
  }
  matched.sort((a, b) => (a.observedOn === b.observedOn ? b.observationId - a.observationId : a.observedOn < b.observedOn ? 1 : -1));
  for (const item of matched) {
    const entry = species.get(item.speciesId);
    // A species seen in the recent list always has at least one observation.
    if (entry) entry.lastObservedOn = newer(entry.lastObservedOn, item.observedOn);
    else species.set(item.speciesId, { observations: 1, lastObservedOn: item.observedOn });
  }
  return { species, recent: capRecent(matched), unmatched: unmatched.size };
}

function toRecent(observation: InatObservation, speciesId: string): RecentSighting {
  return {
    source: 'inaturalist',
    observationId: observation.id,
    speciesId,
    observedOn: observation.observedOn,
    observer: observation.observer,
    observerLogin: observation.observerLogin,
    url: observation.url,
    licence: observation.licence,
    credit: observationCredit(observation.observer, observation.licence),
    ...(observation.distanceKm !== undefined ? { distanceKm: observation.distanceKm } : {}),
    ...(observation.locationObscured ? { locationObscured: true } : {}),
    ...(observation.photo ? { photo: observation.photo } : {}),
  };
}

/** Newest first (input is sorted), at most MAX_RECENT_PER_SPECIES of one species, at most MAX_RECENT in all. */
function capRecent(sorted: readonly RecentSighting[]): RecentSighting[] {
  const perSpecies = new Map<string, number>();
  const kept: RecentSighting[] = [];
  for (const item of sorted) {
    const n = perSpecies.get(item.speciesId) ?? 0;
    if (n >= MAX_RECENT_PER_SPECIES) continue;
    perSpecies.set(item.speciesId, n + 1);
    kept.push(item);
    if (kept.length >= MAX_RECENT) break;
  }
  return kept;
}

function obisSliceFromData(data: ObisData, matcher: NameMatcher): ObisSlice {
  const records = new Map<string, number>();
  const unmatched = new Set<string>();
  // OBIS counts a record under the taxon it was identified as, so a subspecies row adds to its species.
  for (const taxon of data.taxa) {
    const found = matcher.classify(taxon.names, taxon.rank);
    if (found.kind === 'matched') {
      records.set(found.speciesId, (records.get(found.speciesId) ?? 0) + taxon.records);
    } else if (found.kind === 'unmatched') {
      const key = taxon.names.map(normalizeScientificName).find((name) => name !== null);
      if (key) unmatched.add(key);
    }
  }
  return { records, unmatched: unmatched.size };
}

function inatSliceFromSummary(summary: SiteSightings): InatSlice {
  const species = new Map<string, { observations: number; lastObservedOn?: string }>();
  for (const entry of summary.species) {
    if (entry.inaturalist) species.set(entry.speciesId, { ...entry.inaturalist });
  }
  return { species, recent: summary.recent, unmatched: summary.unmatched.inaturalist };
}

function obisSliceFromSummary(summary: SiteSightings): ObisSlice {
  const records = new Map<string, number>();
  for (const entry of summary.species) {
    if (entry.obis) records.set(entry.speciesId, entry.obis.records);
  }
  return { records, unmatched: summary.unmatched.obis };
}

function sourceStatus(
  id: SourceId,
  site: SiteQuery,
  fetchedAt: string,
  result: { ok: boolean; error?: string; truncated?: boolean; recentFailed?: boolean },
): SourceStatus {
  const credit = SOURCE_CREDITS[id];
  return {
    id,
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
    fetchedAt,
    attribution: credit.attribution,
    licenceNote: credit.licenceNote,
    url: id === 'inaturalist' ? inatExploreUrl(site) : OBIS_WEBSITE,
    ...(result.truncated ? { truncated: true } : {}),
    ...(result.recentFailed ? { recentFailed: true } : {}),
  };
}

function hadData(previous: SiteSightings | null | undefined, id: SourceId): SourceStatus | undefined {
  return previous?.sources.find((source) => source.id === id && source.ok);
}

/** Best evidence first: seen by both sources, then more iNaturalist observations, then more OBIS records. */
function compareEvidence(a: SpeciesEvidence, b: SpeciesEvidence): number {
  const sources = (e: SpeciesEvidence) => (e.inaturalist ? 1 : 0) + (e.obis ? 1 : 0);
  return (
    sources(b) - sources(a)
    || (b.inaturalist?.observations ?? 0) - (a.inaturalist?.observations ?? 0)
    || (b.obis?.records ?? 0) - (a.obis?.records ?? 0)
    || (a.speciesId < b.speciesId ? -1 : 1)
  );
}

/**
 * Merge what the two sources said into one summary for a site. A source that failed contributes
 * nothing, unless the previous summary held its data, in which case that data is kept and the
 * source reports the failure as `error` (see SourceStatus). Pure: no I/O, no clock.
 */
export function buildSiteSightings({ site, fetchedAt, inat, obis, previous, matcher = catalogMatcher }: BuildInput): SiteSightings {
  const statuses: SourceStatus[] = [];

  let inatSlice: InatSlice | undefined;
  if (inat.ok) {
    inatSlice = inatSliceFromData(inat.data, matcher);
    // The counts are fresh but the recent list could not be read: keep the last one we had.
    if (inat.data.observationsError && previous && hadData(previous, 'inaturalist')) {
      inatSlice.recent = previous.recent;
      for (const item of previous.recent) {
        const entry = inatSlice.species.get(item.speciesId);
        if (entry) entry.lastObservedOn = newer(entry.lastObservedOn, item.observedOn);
      }
    }
    // Either error makes the answer partial, so it is tried again within the hour (cache.ts).
    const error = [inat.data.countsError, inat.data.observationsError].filter(Boolean).join(' ');
    statuses.push(sourceStatus('inaturalist', site, fetchedAt, { ok: true, error, truncated: inat.data.truncated, recentFailed: !!inat.data.observationsError }));
  } else {
    const kept = hadData(previous, 'inaturalist');
    if (previous && kept) {
      inatSlice = inatSliceFromSummary(previous);
      statuses.push({ ...kept, error: inat.error });
    } else {
      statuses.push(sourceStatus('inaturalist', site, fetchedAt, { ok: false, error: inat.error }));
    }
  }

  let obisSlice: ObisSlice | undefined;
  if (obis.ok) {
    obisSlice = obisSliceFromData(obis.data, matcher);
    statuses.push(sourceStatus('obis', site, fetchedAt, { ok: true, truncated: obis.data.truncated }));
  } else {
    const kept = hadData(previous, 'obis');
    if (previous && kept) {
      obisSlice = obisSliceFromSummary(previous);
      statuses.push({ ...kept, error: obis.error });
    } else {
      statuses.push(sourceStatus('obis', site, fetchedAt, { ok: false, error: obis.error }));
    }
  }

  const ids = new Set<string>([...(inatSlice?.species.keys() ?? []), ...(obisSlice?.records.keys() ?? [])]);
  const species: SpeciesEvidence[] = [];
  for (const speciesId of ids) {
    const fromInat = inatSlice?.species.get(speciesId);
    const records = obisSlice?.records.get(speciesId);
    species.push({
      speciesId,
      ...(fromInat ? { inaturalist: { observations: fromInat.observations, ...(fromInat.lastObservedOn ? { lastObservedOn: fromInat.lastObservedOn } : {}) } } : {}),
      ...(records !== undefined ? { obis: { records } } : {}),
    });
  }
  species.sort(compareEvidence);

  const unmatched: UnmatchedCounts = { inaturalist: inatSlice?.unmatched ?? 0, obis: obisSlice?.unmatched ?? 0 };
  return {
    siteId: site.id,
    radiusKm: site.radiusKm,
    fetchedAt,
    sources: statuses,
    species,
    recent: inatSlice?.recent ?? [],
    unmatched,
  };
}
