/**
 * Types for real sightings near a dive site, from iNaturalist and OBIS (docs/real-sightings.md).
 * Nothing here holds a coordinate: the summary is safe to cache, show and share.
 */

export type SourceId = 'inaturalist' | 'obis';

/** The only licences an individually shown record or photo may carry (docs/roadmap/external-sightings-research.md). */
export type OpenLicence = 'cc0' | 'cc-by';

/**
 * How one source did on the last refresh.
 *
 * `ok` means the summary holds this source's data, fetched at `fetchedAt`. When a refresh fails but
 * older data was kept, `ok` stays true, `fetchedAt` is the older time and `error` says why it is
 * old. When there is no data at all, `ok` is false and `fetchedAt` is when the attempt failed.
 */
export interface SourceStatus {
  id: SourceId;
  ok: boolean;
  error?: string;
  /** ISO timestamp. */
  fetchedAt: string;
  /** The credit line to show wherever this source's data appears. */
  attribution: string;
  /** What may be shown from this source, and under which licence, in one sentence. */
  licenceNote: string;
  /** Where a diver can see the same data on the source's own site. */
  url: string;
  /** The source had more taxa than one refresh reads, so the smallest counts may be missing. */
  truncated?: boolean;
}

/** What the sources say about one catalogue species near a site. */
export interface SpeciesEvidence {
  speciesId: string;
  inaturalist?: {
    /** Research-grade observations within the radius, all licences (a count is a fact, not a record). */
    observations: number;
    /** yyyy-mm-dd of the newest openly licensed observation we hold, if one is among the recent ones. */
    lastObservedOn?: string;
  };
  obis?: {
    /** OBIS occurrence records inside the search box. */
    records: number;
  };
}

/** One recent, openly licensed iNaturalist observation. It never carries a coordinate. */
export interface RecentSighting {
  source: 'inaturalist';
  /** The iNaturalist observation id. */
  observationId: number;
  speciesId: string;
  /** yyyy-mm-dd the animal was seen: the observation date, never the upload date. */
  observedOn: string;
  /** Whom to credit: the observer's name, or their login when they have no name. */
  observer: string;
  observerLogin: string;
  /** https://www.inaturalist.org/observations/<id> */
  url: string;
  /** The observation's licence. */
  licence: OpenLicence;
  /** A ready credit line, for example "© Ada Diver, CC BY 4.0 (iNaturalist)". */
  credit: string;
  /** Rounded up to whole km from the site ("within N km"). Absent when the location is obscured. */
  distanceKm?: number;
  /** The observer or the species' protection hides the true place, so no distance is given. */
  locationObscured?: boolean;
  /** A small photo, only when that photo's own licence is CC0 or CC BY. */
  photo?: {
    url: string;
    licence: OpenLicence;
    /** iNaturalist's attribution string for the photo. */
    attribution: string;
  };
}

/** Species-level taxa in a source that are not in the catalogue (ranks above species are ignored, not counted). */
export interface UnmatchedCounts {
  inaturalist: number;
  obis: number;
}

/** Everything known about a site from the real-data sources. */
export interface SiteSightings {
  siteId: string;
  radiusKm: number;
  /** ISO timestamp of the refresh that produced this summary. */
  fetchedAt: string;
  sources: SourceStatus[];
  /** Matched catalogue species, best evidence first (see summary.ts). */
  species: SpeciesEvidence[];
  /** Newest first, at most about 20. */
  recent: RecentSighting[];
  unmatched: UnmatchedCounts;
}

/** What the hook reports (src/hooks/use-site-sightings.ts). */
export type SightingsStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'offline' | 'error';
