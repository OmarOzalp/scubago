import { CATALOG_BY_ID } from '@/lib/catalog';
import type {
  RecentSighting,
  SightingsStatus,
  SiteSightings,
  SourceId,
  SourceStatus,
  SpeciesEvidence,
} from '@/lib/external-sightings/types';
import { SOURCE_CREDITS } from '@/lib/external-sightings/attribution';

/** How many species show before "Show all". */
export const SPECIES_SHOWN = 8;
/** How many recent observations show. */
export const RECENT_SHOWN = 5;
/** The radius shown when there is no summary yet (the data layer's default, docs/real-sightings.md). */
export const FALLBACK_RADIUS_KM = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const INAT_PREFIX = 'https://www.inaturalist.org/';

/** A link only ever opens iNaturalist's own site: a damaged cache cannot send a diver elsewhere. */
export function inatUrl(url: unknown): string | undefined {
  return typeof url === 'string' && url.startsWith(INAT_PREFIX) ? url : undefined;
}

/** A photo is only drawn from a secure address. */
export function photoUrl(url: unknown): string | undefined {
  return typeof url === 'string' && url.startsWith('https://') ? url : undefined;
}

/** yyyy-mm-dd, as the data layer writes the day an animal was seen. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const count = (n: number) => n.toLocaleString('en-US');

/** "212 iNaturalist observations", "1 iNaturalist observation". */
export function inatCountText(observations: number): string {
  return `${count(observations)} iNaturalist observation${observations === 1 ? '' : 's'}`;
}

/** "38 records in OBIS datasets", "1 record in OBIS datasets". */
export function obisCountText(records: number): string {
  return `${count(records)} record${records === 1 ? '' : 's'} in OBIS datasets`;
}

/** What the sources say about one animal, one phrase per source that has records. */
export function evidenceParts(evidence: SpeciesEvidence): string[] {
  const parts: string[] = [];
  if (evidence.inaturalist && evidence.inaturalist.observations > 0) parts.push(inatCountText(evidence.inaturalist.observations));
  if (evidence.obis && evidence.obis.records > 0) parts.push(obisCountText(evidence.obis.records));
  return parts;
}

/** "within 3 km": only when the data layer gave a distance, which it never does for an obscured place. */
export function distanceLabel(recent: Pick<RecentSighting, 'distanceKm' | 'locationObscured'>): string | undefined {
  if (recent.locationObscured) return undefined;
  const km = recent.distanceKm;
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return undefined;
  return `within ${Math.max(1, Math.ceil(km))} km`;
}

/** Whole days between an ISO time and now (never negative); undefined when the time is not readable. */
export function daysSince(iso: string, now: number): number | undefined {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return undefined;
  return Math.max(0, Math.floor((now - then) / DAY_MS));
}

/** "today", "yesterday", "5 days ago". */
export function agoText(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** The age of the data on show: that of the oldest source it comes from. */
export function dataAgeDays(summary: SiteSightings, now: number): number | undefined {
  const ages = summary.sources
    .filter((source) => source.ok)
    .map((source) => daysSince(source.fetchedAt, now))
    .filter((age): age is number => age !== undefined);
  if (ages.length === 0) return daysSince(summary.fetchedAt, now);
  return Math.max(...ages);
}

export type NoticeKind = 'refreshFailed' | 'info';

export interface Notice {
  key: string;
  kind: NoticeKind;
  text: string;
}

export type ViewKind = 'hidden' | 'loading' | 'unavailable' | 'content';

/** Everything the section needs to draw, worked out once from what the hook reports. */
export interface SightingsModel {
  kind: ViewKind;
  /** The last refresh failed because there is no connection (for the wording). */
  offline: boolean;
  radiusKm: number;
  /** Catalogue animals only, in the data layer's order. */
  species: SpeciesEvidence[];
  recent: RecentSighting[];
  notices: Notice[];
  /** The last refresh failed and the screen offers "Try again". */
  canRetry: boolean;
  /** An old copy is on show while a newer one is fetched. */
  refreshing: boolean;
  /** "Updated 3 days ago". */
  updated?: string;
  /** iNaturalist's own page for the same area. */
  exploreUrl?: string;
  /** Sources whose records are on show, for the credit line. */
  credited: SourceId[];
  /** iNaturalist answered, so a missing recent list means there is nothing openly licensed to show. */
  inatAnswered: boolean;
  /** Names of the sources that answered, for the empty state. */
  answered: string[];
}

const NAME: Record<SourceId, string> = { inaturalist: 'iNaturalist', obis: 'OBIS' };

function sourceNotices(sources: SourceStatus[], failedRefresh: boolean, now: number): Notice[] {
  const notices: Notice[] = [];
  for (const source of sources) {
    const name = NAME[source.id];
    if (!source.ok) {
      notices.push({ key: `${source.id}-missing`, kind: 'info', text: `${name} couldn’t be reached, so its records aren’t included.` });
    } else if (source.error && !failedRefresh) {
      const age = daysSince(source.fetchedAt, now);
      notices.push({
        key: `${source.id}-old`,
        kind: 'info',
        text: `${name} couldn’t be refreshed just now. Its records are from ${age === undefined ? 'an earlier visit' : agoText(age)}.`,
      });
    }
    if (source.ok && source.truncated) {
      notices.push({
        key: `${source.id}-truncated`,
        kind: 'info',
        text: `${name} has more species here than ScubaGo reads at once, so a rarely recorded animal may be missing.`,
      });
    }
  }
  return notices;
}

/**
 * Turns the hook's answer into what to draw. Nothing is invented: with no summary there is no list,
 * and a source that did not answer is named rather than counted as "no records".
 */
export function buildModel(summary: SiteSightings | null, status: SightingsStatus, now: number = Date.now()): SightingsModel {
  const failed = status === 'offline' || status === 'error';
  const empty: SightingsModel = {
    kind: 'hidden',
    offline: status === 'offline',
    radiusKm: summary?.radiusKm ?? FALLBACK_RADIUS_KM,
    species: [],
    recent: [],
    notices: [],
    canRetry: failed,
    refreshing: false,
    credited: [],
    inatAnswered: false,
    answered: [],
  };
  if (status === 'idle') return empty;
  if (!summary) {
    return { ...empty, kind: failed ? 'unavailable' : 'loading' };
  }

  const species = summary.species.filter((entry) => CATALOG_BY_ID.has(entry.speciesId) && evidenceParts(entry).length > 0);
  const recent = summary.recent.filter(
    (entry) => CATALOG_BY_ID.has(entry.speciesId) && inatUrl(entry.url) !== undefined && isIsoDate(entry.observedOn),
  );
  const okSources = summary.sources.filter((source) => source.ok);
  // A summary in which neither source ever answered has nothing true to say.
  if (okSources.length === 0 && species.length === 0 && recent.length === 0) {
    return { ...empty, kind: failed ? 'unavailable' : 'loading', radiusKm: summary.radiusKm };
  }

  const age = dataAgeDays(summary, now);
  const notices: Notice[] = [];
  if (failed) {
    notices.push({
      key: 'refresh-failed',
      kind: 'refreshFailed',
      text: `${status === 'offline' ? 'You’re offline.' : 'Couldn’t refresh the public records.'} Showing records saved ${age === undefined ? 'earlier' : agoText(age)}.`,
    });
  }
  notices.push(...sourceNotices(summary.sources, failed, now));

  const inat = summary.sources.find((source) => source.id === 'inaturalist');
  return {
    kind: 'content',
    offline: status === 'offline',
    radiusKm: summary.radiusKm,
    species,
    recent,
    notices,
    canRetry: failed,
    refreshing: status === 'stale',
    updated: age === undefined ? undefined : `Updated ${agoText(age)}`,
    exploreUrl: inat?.ok ? inatUrl(inat.url) : undefined,
    credited: okSources.map((source) => source.id),
    inatAnswered: !!inat?.ok,
    answered: okSources.map((source) => NAME[source.id]),
  };
}

/** The credit line for the foot of the section: each answering source's text from attribution.ts. */
export function creditLine(credited: SourceId[]): string {
  const ids: SourceId[] = credited.length > 0 ? credited : ['inaturalist', 'obis'];
  return ids.map((id) => SOURCE_CREDITS[id].attribution).join(' · ');
}
