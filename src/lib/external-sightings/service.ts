import type { DiveSite } from '@/lib/types';
import { abortError, describeError, isAbortError } from '@/lib/external-sightings/errors';
import { isValidLatLng } from '@/lib/external-sightings/geo';
import { platformFetch, type FetchImpl } from '@/lib/external-sightings/http';
import {
  fetchInatObservations,
  fetchInatSpeciesCounts,
  MAX_TAXON_IDS,
  type InatSpeciesCount,
  type SiteQuery,
} from '@/lib/external-sightings/inaturalist';
import { catalogMatcher, type NameMatcher } from '@/lib/external-sightings/names';
import { fetchObisChecklist } from '@/lib/external-sightings/obis';
import { createQueuedFetch, HostQueue, InFlight } from '@/lib/external-sightings/queue';
import {
  buildSiteSightings,
  radiusForSite,
  type InatData,
  type ObisData,
  type SourceOutcome,
} from '@/lib/external-sightings/summary';
import { isStale, MAX_CACHED_SITES, readCachedSightings, writeCachedSightings } from '@/lib/external-sightings/cache';
import type { SiteSightings } from '@/lib/external-sightings/types';

/** After a refresh fails, another one for the same site waits this long, unless forced. */
export const FAILURE_BACKOFF_MS = 60_000;

export type SiteRef = Pick<DiveSite, 'id' | 'lat' | 'lng'>;

export interface LoadOptions {
  /** Search radius in km; the default (3) when absent. */
  radiusKm?: number;
  signal?: AbortSignal;
  /** Refresh now even if the cache is fresh. */
  forceRefresh?: boolean;
  /** Called at once with the cached summary, before any refresh starts. */
  onCached?: (cached: { summary: SiteSightings; stale: boolean }) => void;
}

export interface LoadResult {
  /** The best summary there is: the fresh one, else the cached one, else null. Never invented. */
  summary: SiteSightings | null;
  /** 'ready' after a successful refresh or a fresh cache; 'offline' or 'error' when a refresh was needed and failed. */
  status: 'ready' | 'offline' | 'error';
  /** The summary is an old cached copy that could not be refreshed. */
  stale: boolean;
  /** Why a refresh failed, in plain words. */
  error?: string;
  /** New data was fetched by this call. */
  refreshed: boolean;
}

export interface PrefetchResult {
  refreshed: number;
  skipped: number;
  failed: number;
}

export interface SightingsService {
  /**
   * Stale-while-revalidate: report the cached summary at once (`onCached`), then refresh it if it
   * is stale. Resolves with the outcome and never rejects, except with an AbortError when `signal` aborts.
   */
  load(site: SiteRef, options?: LoadOptions): Promise<LoadResult>;
  /** Refresh the stale or missing sites one after another, politely. Stops at the first sign of no connection. */
  prefetch(sites: readonly SiteRef[], options?: { radiusKm?: number; signal?: AbortSignal }): Promise<PrefetchResult>;
}

export interface ServiceDeps {
  fetchImpl?: FetchImpl;
  queue?: HostQueue;
  now?: () => number;
  matcher?: NameMatcher;
  maxCachedSites?: number;
  /**
   * Headers added to every request, for example a User-Agent that names the app (iNaturalist asks
   * for one; browsers do not let a page set it). None are sent by default.
   */
  headers?: Readonly<Record<string, string>>;
}

type RefreshOutcome = { summary: SiteSightings } | { error: string; offline: boolean };

function matchedTaxonIds(counts: readonly InatSpeciesCount[], matcher: NameMatcher): number[] {
  const ids: number[] = [];
  const sorted = [...counts].sort((a, b) => b.count - a.count);
  for (const row of sorted) {
    if (row.taxonId === undefined || ids.includes(row.taxonId)) continue;
    if (matcher.classify([row.name], row.rank).kind === 'matched') ids.push(row.taxonId);
    if (ids.length >= MAX_TAXON_IDS) break;
  }
  return ids;
}

async function readInat(query: SiteQuery, fetchImpl: FetchImpl, signal: AbortSignal, matcher: NameMatcher): Promise<SourceOutcome<InatData>> {
  let counts;
  try {
    counts = await fetchInatSpeciesCounts(query, { fetchImpl, signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    const { message, offline } = describeError(error, 'iNaturalist');
    return { ok: false, error: message, offline };
  }
  const data: InatData = { counts: counts.counts, truncated: counts.truncated, observations: [] };
  const taxonIds = matchedTaxonIds(counts.counts, matcher);
  if (taxonIds.length > 0) {
    try {
      data.observations = (await fetchInatObservations(query, taxonIds, { fetchImpl, signal })).observations;
    } catch (error) {
      if (isAbortError(error)) throw error;
      data.observationsError = `Recent observations: ${describeError(error, 'iNaturalist').message}`;
    }
  }
  return { ok: true, data };
}

async function readObis(query: SiteQuery, fetchImpl: FetchImpl, signal: AbortSignal): Promise<SourceOutcome<ObisData>> {
  try {
    const checklist = await fetchObisChecklist(query, { fetchImpl, signal });
    return { ok: true, data: { taxa: checklist.taxa, truncated: checklist.truncated } };
  } catch (error) {
    if (isAbortError(error)) throw error;
    const { message, offline } = describeError(error, 'OBIS');
    return { ok: false, error: message, offline };
  }
}

function isUsableSite(site: SiteRef): boolean {
  return typeof site.id === 'string' && site.id !== '' && isValidLatLng(site.lat, site.lng);
}

/**
 * The sightings service: cache first, then a polite refresh through the request queue. Everything
 * it needs from outside (fetch, clock, queue) can be replaced, which is how the tests run it.
 */
export function createSightingsService(deps: ServiceDeps = {}): SightingsService {
  const now = deps.now ?? Date.now;
  const matcher = deps.matcher ?? catalogMatcher;
  const queue = deps.queue ?? new HostQueue({ now });
  const fetchImpl = createQueuedFetch(queue, deps.fetchImpl ?? platformFetch, undefined, deps.headers);
  const maxCachedSites = deps.maxCachedSites ?? MAX_CACHED_SITES;
  const inFlight = new InFlight<RefreshOutcome>();
  const failures = new Map<string, { at: number; error: string; offline: boolean }>();

  async function refresh(site: SiteRef, radiusKm: number, cached: SiteSightings | null, signal: AbortSignal): Promise<RefreshOutcome> {
    const query: SiteQuery = { lat: site.lat, lng: site.lng, radiusKm };
    // The two hosts have their own lanes in the queue, so they run side by side.
    const [inat, obis] = await Promise.all([readInat(query, fetchImpl, signal, matcher), readObis(query, fetchImpl, signal)]);
    if (!inat.ok && !obis.ok) {
      return { error: inat.error, offline: inat.offline && obis.offline };
    }
    const summary = buildSiteSightings({
      site: { id: site.id, ...query },
      fetchedAt: new Date(now()).toISOString(),
      inat,
      obis,
      previous: cached && cached.radiusKm === radiusKm ? cached : null,
      matcher,
    });
    await writeCachedSightings(summary, maxCachedSites);
    return { summary };
  }

  async function load(site: SiteRef, options: LoadOptions = {}): Promise<LoadResult> {
    const { signal, forceRefresh = false } = options;
    if (!isUsableSite(site)) {
      return { summary: null, status: 'error', stale: false, error: 'This dive site has no usable position.', refreshed: false };
    }
    const radiusKm = radiusForSite(options.radiusKm);
    const cached = await readCachedSightings(site.id);
    if (signal?.aborted) throw abortError();

    const stale = cached ? isStale(cached, now()) || cached.radiusKm !== radiusKm : true;
    if (cached) {
      try {
        options.onCached?.({ summary: cached, stale });
      } catch {
        // A listener's mistake is not ours to fail on.
      }
      if (!stale && !forceRefresh) return { summary: cached, status: 'ready', stale: false, refreshed: false };
    }

    const key = `${site.id}|${radiusKm}`;
    const failed = failures.get(key);
    const failure = (reason: { error: string; offline: boolean }): LoadResult => ({
      summary: cached,
      status: reason.offline ? 'offline' : 'error',
      stale: cached !== null,
      error: reason.error,
      refreshed: false,
    });
    if (failed && !forceRefresh && now() - failed.at < FAILURE_BACKOFF_MS) return failure(failed);

    let outcome: RefreshOutcome;
    try {
      outcome = await inFlight.run(key, (jobSignal) => refresh(site, radiusKm, cached, jobSignal), signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      // Unexpected: treat like any failed refresh instead of throwing into a screen.
      outcome = { error: 'Real sightings could not be loaded.', offline: false };
    }
    if ('summary' in outcome) {
      failures.delete(key);
      return { summary: outcome.summary, status: 'ready', stale: false, refreshed: true };
    }
    failures.set(key, { at: now(), error: outcome.error, offline: outcome.offline });
    return failure(outcome);
  }

  async function prefetch(sites: readonly SiteRef[], options: { radiusKm?: number; signal?: AbortSignal } = {}): Promise<PrefetchResult> {
    const result: PrefetchResult = { refreshed: 0, skipped: 0, failed: 0 };
    for (const site of sites) {
      if (options.signal?.aborted) break;
      let outcome: LoadResult;
      try {
        outcome = await load(site, options);
      } catch {
        break; // aborted
      }
      if (outcome.refreshed) result.refreshed += 1;
      else if (outcome.status === 'ready') result.skipped += 1;
      else result.failed += 1;
      if (outcome.status === 'offline') break;
    }
    return result;
  }

  return { load, prefetch };
}

/** The service the app uses: real fetch, real clock, one shared request queue. */
export const sightingsService: SightingsService = createSightingsService();

/** Shorthand for `sightingsService.load`. */
export function loadSiteSightings(site: SiteRef, options?: LoadOptions): Promise<LoadResult> {
  return sightingsService.load(site, options);
}
