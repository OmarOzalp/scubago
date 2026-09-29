/** Core domain types for ScubaGo. Mirrors supabase/migrations/0001_init.sql. */

export type Category =
  | 'shark'
  | 'ray'
  | 'turtle'
  | 'mammal'
  | 'fish'
  | 'cephalopod'
  | 'macro'
  | 'reptile'
  | 'other';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Species {
  id: string; // slug, e.g. "whale-shark"
  commonName: string;
  scientificName: string;
  category: Category;
  rarity: Rarity;
  blurb: string;
  /** Optional emoji override; falls back to the category emoji. */
  emoji?: string;
  /** Hot-linked photo (CC-licensed, from iNaturalist); merged in from species-photos.json. */
  photoUrl?: string;
  photoAttribution?: string;
}

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'technical';
export type DiveType = 'reef' | 'wall' | 'wreck' | 'drift' | 'pinnacle' | 'bommie' | 'muck' | 'cave' | 'swim-through' | 'pier';
export type SiteAccess = 'boat' | 'shore' | 'liveaboard';
/** A site detail that must carry a source when it is filled in (supabase/migrations/0005). */
export type SiteField = 'region' | 'description' | 'depth' | 'difficulty' | 'dive_types' | 'access' | 'conditions' | 'species';

/** Where one or more facts about a site came from: shown on the site page, never invented. */
export interface SiteSource {
  fields: SiteField[];
  source: string;
  url?: `https://${string}`;
  license?: string;
  /** yyyy-mm-dd the source was checked. */
  retrieved?: string;
}

/** The same place in another dataset (Wikidata QID, GBRMPA reef id, …), so sources never duplicate a site. */
export interface SiteExternalId {
  scheme: 'wikidata' | 'gbrmpa' | 'rls' | 'auchd' | 'mrgid' | 'osm' | 'partner';
  id: string;
  relation?: 'same_as' | 'on_reef' | 'within_region' | 'near';
}

export interface Region {
  id: string; // slug, e.g. "great-barrier-reef"
  name: string;
  parentId?: string;
  country?: string;
  /** Marine Regions gazetteer id, once confirmed. */
  mrgid?: number;
  source: string;
}

export interface DiveSite {
  id: string; // slug, e.g. "richelieu-rock"
  name: string;
  lat: number;
  lng: number;
  /** Display region (free text); `regionId` links the structured one when known. */
  region: string;
  country: string;
  blurb: string;
  /** Species ids realistically seen here; powers demo data + "what to expect". */
  notableSpecies: string[];
  source: 'seed' | 'user';
  regionId?: string;
  depthMinM?: number;
  depthMaxM?: number;
  difficulty?: Difficulty;
  diveTypes?: DiveType[];
  access?: SiteAccess[];
  conditions?: string;
  sources?: SiteSource[];
  externalIds?: SiteExternalId[];
}

export interface Sighting {
  id: string;
  userId: string; // 'local' for the device owner until real auth exists
  username: string;
  speciesId: string;
  siteId: string;
  /** ISO date (yyyy-mm-dd) the animal was seen. */
  sightedOn: string;
  notes?: string;
  photoUri?: string;
  isDemo: boolean;
  synced: boolean;
  createdAt: string; // ISO timestamp
  /** When the diver last edited it (ISO timestamp); absent if never edited. */
  updatedAt?: string;
  /** Verification status as last known from the server; absent means unverified. */
  status?: SightingStatus;
  /** Why the last attempt to sync this change failed; cleared once it syncs. */
  syncError?: string;
}

/**
 * Where a sighting stands (docs/roadmap/sightings-architecture.md). Only the server sets it:
 * the app shows it, and resets its own copy to unverified when a diver changes what was seen.
 */
export type SightingStatus = 'unverified' | 'evidence_submitted' | 'confirmed' | 'accepted' | 'rejected' | 'disputed';

/** One entry in the user's species collection, derived from their sightings. */
export interface DexEntry {
  species: Species;
  count: number;
  firstSeenOn: string;
  firstSeenSiteId: string;
  lastSeenOn: string;
}
