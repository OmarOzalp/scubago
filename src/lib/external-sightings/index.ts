/**
 * Real sightings near dive sites, from iNaturalist and OBIS (docs/real-sightings.md).
 * The hook for screens is src/hooks/use-site-sightings.ts; this is everything behind it.
 */
export * from '@/lib/external-sightings/attribution';
export * from '@/lib/external-sightings/cache';
export { abortError, isAbortError } from '@/lib/external-sightings/errors';
export { createNameMatcher, catalogMatcher, normalizeScientificName, type NameMatcher, type TaxonMatch } from '@/lib/external-sightings/names';
export { MIN_SITES_FOR_OBSERVED_RARITY, observedRarity, observedTiers, RARITY_THRESHOLDS, tierForShare } from '@/lib/external-sightings/observed-rarity';
export type { ObservedRarity, ObservedRarityOptions } from '@/lib/external-sightings/observed-rarity';
export { createQueuedFetch, HOST_INTERVAL_MS, HostQueue, InFlight } from '@/lib/external-sightings/queue';
export { createSightingsService, FAILURE_BACKOFF_MS, loadSiteSightings, sightingsService } from '@/lib/external-sightings/service';
export type { LoadOptions, LoadResult, PrefetchResult, ServiceDeps, SightingsService, SiteRef } from '@/lib/external-sightings/service';
export { buildSiteSightings, DEFAULT_RADIUS_KM, MAX_RECENT, radiusForSite } from '@/lib/external-sightings/summary';
export { SYNONYMS } from '@/lib/external-sightings/synonyms';
export type {
  OpenLicence,
  RecentSighting,
  SightingsStatus,
  SiteSightings,
  SourceId,
  SourceStatus,
  SpeciesEvidence,
  UnmatchedCounts,
} from '@/lib/external-sightings/types';
