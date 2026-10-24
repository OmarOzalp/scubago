import AsyncStorage from '@react-native-async-storage/async-storage';

import { observationCredit, openLicence, SOURCE_CREDITS } from '@/lib/external-sightings/attribution';
import { hostOf, isRecord, toNumber, toText } from '@/lib/external-sightings/http';
import { INAT_WEBSITE } from '@/lib/external-sightings/inaturalist';
import type {
  RecentSighting,
  SiteSightings,
  SourceStatus,
  SpeciesEvidence,
} from '@/lib/external-sightings/types';

/**
 * The offline copy of each site's summary, in AsyncStorage: one key per site, plus an index of the
 * sites held (least recently used first) so the cache never grows past MAX_CACHED_SITES. Every
 * storage call is best effort: a failure means "not cached", never an error for the caller.
 */

export const CACHE_PREFIX = 'scubago.realSightings.v1.';
export const CACHE_INDEX_KEY = 'scubago.realSightings.v1:index';
const DAY_MS = 24 * 60 * 60 * 1000;
/** A summary whose sources all answered is good for a week. */
export const CACHE_TTL_MS = 7 * DAY_MS;
/** One where a source failed is tried again after an hour. */
export const PARTIAL_RETRY_MS = 60 * 60 * 1000;
export const MAX_CACHED_SITES = 300;
const MAX_RECENT_KEPT = 20;

export const cacheKey = (siteId: string) => `${CACHE_PREFIX}${siteId}`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseSource(value: unknown): SourceStatus | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return null;
  const id = value.id;
  if (id !== 'inaturalist' && id !== 'obis') return null;
  const fetchedAt = toText(value.fetchedAt);
  if (!fetchedAt || Number.isNaN(Date.parse(fetchedAt))) return null;
  const credit = SOURCE_CREDITS[id];
  const error = toText(value.error);
  return {
    id,
    ok: value.ok,
    ...(error ? { error } : {}),
    fetchedAt,
    attribution: toText(value.attribution) ?? credit.attribution,
    licenceNote: toText(value.licenceNote) ?? credit.licenceNote,
    url: toText(value.url) ?? credit.homepage,
    ...(value.truncated === true ? { truncated: true } : {}),
    ...(value.recentFailed === true ? { recentFailed: true } : {}),
  };
}

function parseEvidence(value: unknown): SpeciesEvidence | null {
  if (!isRecord(value)) return null;
  const speciesId = toText(value.speciesId);
  if (!speciesId) return null;
  const evidence: SpeciesEvidence = { speciesId };
  if (isRecord(value.inaturalist)) {
    const observations = toNumber(value.inaturalist.observations);
    const last = toText(value.inaturalist.lastObservedOn);
    if (observations !== undefined && observations >= 0) {
      evidence.inaturalist = { observations, ...(last && DATE.test(last) ? { lastObservedOn: last } : {}) };
    }
  }
  if (isRecord(value.obis)) {
    const records = toNumber(value.obis.records);
    if (records !== undefined && records >= 0) evidence.obis = { records };
  }
  return evidence.inaturalist || evidence.obis ? evidence : null;
}

function parseRecent(value: unknown): RecentSighting | null {
  if (!isRecord(value) || value.source !== 'inaturalist') return null;
  const observationId = toNumber(value.observationId);
  const speciesId = toText(value.speciesId);
  const observedOn = toText(value.observedOn);
  const observer = toText(value.observer);
  const observerLogin = toText(value.observerLogin);
  const licence = openLicence(value.licence);
  if (observationId === undefined || !speciesId || !observedOn || !DATE.test(observedOn) || !observer || !observerLogin || !licence) return null;
  const distanceKm = toNumber(value.distanceKm);
  let photo: RecentSighting['photo'];
  if (isRecord(value.photo)) {
    const photoLicence = openLicence(value.photo.licence);
    const url = toText(value.photo.url);
    const attribution = toText(value.photo.attribution);
    if (photoLicence && url && attribution && url.startsWith('https://') && hostOf(url).startsWith('inaturalist-open-data.')) {
      photo = { url, licence: photoLicence, attribution };
    }
  }
  return {
    source: 'inaturalist',
    observationId,
    speciesId,
    observedOn,
    observer,
    observerLogin,
    url: `${INAT_WEBSITE}/observations/${observationId}`,
    licence,
    credit: toText(value.credit) ?? observationCredit(observer, licence),
    ...(distanceKm !== undefined && distanceKm >= 1 ? { distanceKm: Math.round(distanceKm) } : {}),
    ...(value.locationObscured === true ? { locationObscured: true } : {}),
    ...(photo ? { photo } : {}),
  };
}

function compact<T>(items: unknown, parse: (item: unknown) => T | null): T[] {
  if (!Array.isArray(items)) return [];
  return items.map(parse).filter((item): item is T => item !== null);
}

/**
 * A summary read back from storage, rebuilt field by field from what looks right, or null if the
 * value is not a summary at all. Records that fail their checks are left out, not repaired.
 */
export function parseSiteSightings(value: unknown): SiteSightings | null {
  if (!isRecord(value)) return null;
  const siteId = toText(value.siteId);
  const radiusKm = toNumber(value.radiusKm);
  const fetchedAt = toText(value.fetchedAt);
  if (!siteId || radiusKm === undefined || radiusKm <= 0 || !fetchedAt || Number.isNaN(Date.parse(fetchedAt))) return null;
  if (!Array.isArray(value.sources) || !Array.isArray(value.species) || !Array.isArray(value.recent)) return null;
  const sources = compact(value.sources, parseSource);
  if (sources.length === 0) return null;
  const unmatched = isRecord(value.unmatched) ? value.unmatched : {};
  return {
    siteId,
    radiusKm,
    fetchedAt,
    sources,
    species: compact(value.species, parseEvidence),
    recent: compact(value.recent, parseRecent).slice(0, MAX_RECENT_KEPT),
    unmatched: {
      inaturalist: Math.max(0, toNumber(unmatched.inaturalist) ?? 0),
      obis: Math.max(0, toNumber(unmatched.obis) ?? 0),
    },
  };
}

/**
 * Whether a summary should be refreshed. Each source that answered is good for `ttlMs`; if any
 * source failed, the whole summary is retried after PARTIAL_RETRY_MS. Unreadable times count as stale.
 */
export function isStale(summary: SiteSightings, now: number, ttlMs = CACHE_TTL_MS): boolean {
  if (summary.sources.length === 0) return true;
  return summary.sources.some((source) => {
    const complete = source.ok && !source.error;
    const at = Date.parse(complete ? source.fetchedAt : summary.fetchedAt);
    return !(now - at <= (complete ? ttlMs : PARTIAL_RETRY_MS));
  });
}

// Index changes read, change and write one key, so they take turns.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/** The sites held, least recently used first. A missing or unreadable index is rebuilt from the keys. */
async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed) && Array.isArray(parsed.ids)) {
        return [...new Set(parsed.ids.filter((id): id is string => typeof id === 'string' && id !== ''))];
      }
    }
  } catch {
    // Fall through to the rebuild.
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => key.slice(CACHE_PREFIX.length)).sort();
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify({ v: 1, ids }));
}

/**
 * The cached summary for a site, or null when there is none or it cannot be read (a corrupt entry
 * is removed). Reading marks the site as recently used unless `touch` is false.
 */
export async function readCachedSightings(siteId: string, { touch = true }: { touch?: boolean } = {}): Promise<SiteSightings | null> {
  let summary: SiteSightings | null = null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(siteId));
    if (!raw) return null;
    const entry: unknown = JSON.parse(raw);
    summary = isRecord(entry) && entry.v === 1 ? parseSiteSightings(entry.summary) : null;
    if (summary && summary.siteId !== siteId) summary = null;
  } catch {
    summary = null;
  }
  if (!summary) {
    await clearCachedSightings(siteId);
    return null;
  }
  if (!touch) return summary;
  await exclusive(async () => {
    try {
      const ids = await readIndex();
      if (ids[ids.length - 1] === siteId) return;
      await writeIndex([...ids.filter((id) => id !== siteId), siteId]);
    } catch {
      // The order is a nicety.
    }
  });
  return summary;
}

/** Save a summary as the most recently used, and drop the least recently used sites beyond `maxSites`. */
export async function writeCachedSightings(summary: SiteSightings, maxSites = MAX_CACHED_SITES): Promise<void> {
  await exclusive(async () => {
    try {
      await AsyncStorage.setItem(cacheKey(summary.siteId), JSON.stringify({ v: 1, summary }));
      const ids = [...(await readIndex()).filter((id) => id !== summary.siteId), summary.siteId];
      const evicted = ids.length > maxSites ? ids.splice(0, ids.length - maxSites) : [];
      await writeIndex(ids);
      if (evicted.length > 0) await AsyncStorage.multiRemove(evicted.map(cacheKey));
    } catch {
      // Not caching is fine.
    }
  });
}

/** Forget one site, or all of them when no id is given. */
export async function clearCachedSightings(siteId?: string): Promise<void> {
  await exclusive(async () => {
    try {
      const ids = await readIndex();
      if (siteId === undefined) {
        await AsyncStorage.multiRemove([...ids.map(cacheKey), CACHE_INDEX_KEY]);
        return;
      }
      await AsyncStorage.removeItem(cacheKey(siteId));
      if (ids.includes(siteId)) await writeIndex(ids.filter((id) => id !== siteId));
    } catch {
      // Nothing more to do.
    }
  });
}

/**
 * The ids of every site that has a cached summary, least recently used first. Reads the index only
 * (rebuilt from the stored keys if it is lost); never fetches and never throws: storage that cannot
 * be read gives an empty list, as everywhere in this module.
 */
export async function listCachedSiteIds(): Promise<string[]> {
  return exclusive(readIndex);
}

/** The cached summaries for many sites, without touching their order: for working out rarity across sites. */
export async function readCachedSummaries(siteIds: readonly string[]): Promise<SiteSightings[]> {
  const found = await Promise.all(siteIds.map((id) => readCachedSightings(id, { touch: false })));
  return found.filter((summary): summary is SiteSightings => summary !== null);
}
