import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { listCachedSiteIds, readCachedSummaries } from '@/lib/external-sightings/cache';
import type { SiteSightings } from '@/lib/external-sightings/types';
import type { DiveSite } from '@/lib/types';

/**
 * Where public records (iNaturalist, OBIS) place one species, read from the site summaries that are
 * already saved on this phone. It never asks the network: a summary is saved when a dive site's
 * page is opened (docs/real-sightings.md), so this only knows the sites the diver has looked at.
 */

export type SpeciesRecordsStatus = 'loading' | 'ready' | 'empty' | 'error';

/** The part of a dive site the list needs. */
export type RecordSite = Pick<DiveSite, 'id' | 'name' | 'region' | 'country'>;

/** One site whose saved summary records the species. */
export interface SpeciesSiteRecord {
  siteId: string;
  name: string;
  region: string;
  country: string;
  /** How far from the site the sources looked (km). */
  radiusKm: number;
  /** iNaturalist research-grade observations within the radius; absent when iNaturalist has none. */
  observations?: number;
  /** OBIS records inside the search box; absent when OBIS has none. */
  records?: number;
  /** yyyy-mm-dd of the newest openly licensed observation the app holds, when it holds one. */
  newestOn?: string;
}

/** What one saved summary says about the species, before it is matched to a dive site. */
export interface CachedSpeciesRecord {
  siteId: string;
  radiusKm: number;
  /** At least one source answered for this site, so a missing record means "none found", not "not looked". */
  answered: boolean;
  observations?: number;
  records?: number;
  newestOn?: string;
}

export interface UseSpeciesRecords {
  /**
   * 'loading': the saved summaries have not been read yet. 'ready': at least one site records the
   * species. 'empty': none does. 'error': the saved summaries could not be read.
   */
  status: SpeciesRecordsStatus;
  /** Sites that record the species, most observations first. Never made up: only what is saved. */
  sites: SpeciesSiteRecord[];
  /** How many saved summaries (for known sites that a source answered for) were looked through. */
  checked: number;
}

export interface UseSpeciesRecordsOptions {
  /** Replace the cache read, for tests. Keep it the same function between renders. */
  read?: () => Promise<SiteSightings[]>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: unknown): value is string => typeof value === 'string' && ISO_DATE.test(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Every summary on this phone, in the cache's order. Storage that cannot be read gives none (cache.ts never throws). */
export async function readAllCachedSummaries(): Promise<SiteSightings[]> {
  return readCachedSummaries(await listCachedSiteIds());
}

/**
 * What each saved summary says about one species. One entry per summary, including those that do
 * not record it, so the caller can say how many were looked through. Pure.
 */
export function recordsFromSummaries(speciesId: string, summaries: readonly SiteSightings[]): CachedSpeciesRecord[] {
  return summaries.map((summary) => {
    const evidence = summary.species.find((entry) => entry.speciesId === speciesId);
    const observations = evidence?.inaturalist?.observations;
    const records = evidence?.obis?.records;
    // The newest day we hold: the evidence's own, or the newest recent observation of this animal.
    const days = [
      evidence?.inaturalist?.lastObservedOn,
      ...summary.recent.filter((entry) => entry.speciesId === speciesId).map((entry) => entry.observedOn),
    ].filter(isDate);
    const newestOn = days.length > 0 ? days.reduce((a, b) => (a >= b ? a : b)) : undefined;
    const hasEvidence = isCount(observations) || isCount(records);
    return {
      siteId: summary.siteId,
      radiusKm: summary.radiusKm,
      answered: hasEvidence || summary.sources.some((source) => source.ok),
      ...(isCount(observations) ? { observations } : {}),
      ...(isCount(records) ? { records } : {}),
      ...(hasEvidence && newestOn ? { newestOn } : {}),
    };
  });
}

/**
 * Matches saved summaries to the dive sites the app knows, keeps those that record the species and
 * orders them by evidence (most iNaturalist observations, then most OBIS records, then name). A
 * summary of a site that is no longer known cannot be named or opened, so it is left out and not
 * counted. Pure.
 */
export function joinSiteRecords(
  records: readonly CachedSpeciesRecord[],
  sites: readonly RecordSite[],
): { sites: SpeciesSiteRecord[]; checked: number } {
  const byId = new Map(sites.map((site) => [site.id, site]));
  const found: SpeciesSiteRecord[] = [];
  let checked = 0;
  for (const record of records) {
    const site = byId.get(record.siteId);
    if (!site) continue;
    if (record.answered) checked += 1;
    if (record.observations === undefined && record.records === undefined) continue;
    found.push({
      siteId: site.id,
      name: site.name,
      region: site.region,
      country: site.country,
      radiusKm: record.radiusKm,
      ...(record.observations !== undefined ? { observations: record.observations } : {}),
      ...(record.records !== undefined ? { records: record.records } : {}),
      ...(record.newestOn ? { newestOn: record.newestOn } : {}),
    });
  }
  found.sort((a, b) => (b.observations ?? 0) - (a.observations ?? 0) || (b.records ?? 0) - (a.records ?? 0) || a.name.localeCompare(b.name));
  return { sites: found, checked };
}

interface State {
  key: string;
  records: CachedSpeciesRecord[];
  failed: boolean;
}

/**
 * The dive sites whose saved public records include `speciesId`. Reads the cache only (never the
 * network), reads it again whenever the screen comes back into view (a site page opened meanwhile
 * may have saved more), keeps what it showed while it does, and drops a read that is still running
 * when the screen goes away. Never throws: a failed read is `status: 'error'`.
 */
export function useSpeciesRecords(
  speciesId: string | undefined,
  sites: readonly RecordSite[],
  options: UseSpeciesRecordsOptions = {},
): UseSpeciesRecords {
  const read = options.read ?? readAllCachedSummaries;
  const key = speciesId ?? '';
  const [state, setState] = useState<State | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!speciesId) return;
      let cancelled = false;
      void Promise.resolve()
        .then(read)
        .then((summaries) => recordsFromSummaries(speciesId, summaries))
        .then(
          (records) => {
            if (!cancelled) setState({ key, records, failed: false });
          },
          () => {
            if (!cancelled) setState({ key, records: [], failed: true });
          },
        );
      return () => {
        cancelled = true;
      };
    }, [speciesId, key, read]),
  );

  return useMemo<UseSpeciesRecords>(() => {
    if (!speciesId) return { status: 'empty', sites: [], checked: 0 };
    if (!state || state.key !== key) return { status: 'loading', sites: [], checked: 0 };
    if (state.failed) return { status: 'error', sites: [], checked: 0 };
    const joined = joinSiteRecords(state.records, sites);
    return { status: joined.sites.length > 0 ? 'ready' : 'empty', ...joined };
  }, [speciesId, key, state, sites]);
}
