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
  /**
   * Who added a user site: their user id, or 'local' for one added on this device that hasn't
   * synced. Absent for seed sites, and for a downloaded site until the next sync says who.
   */
  createdBy?: string;
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
  /** What the diver saw, in their words, when it isn't in the catalogue (species 'unlisted'). */
  customName?: string;
  isDemo: boolean;
  synced: boolean;
  createdAt: string; // ISO timestamp
  /** When the diver last edited it (ISO timestamp); absent if never edited. */
  updatedAt?: string;
  /** Verification status as last known from the server; absent means unverified. */
  status?: SightingStatus;
  /** Why the last attempt to sync this change failed; cleared once it syncs. */
  syncError?: string;
  /** Who can see the sighting (migration 0008). Absent means everyone, as before privacy existed. */
  visibility?: Visibility;
  /** The notes are only for the diver, even when the sighting is shared. */
  notesPrivate?: boolean;
  /** The photo is only for the diver, even when the sighting is shared. */
  photoPrivate?: boolean;
  /** The dive this sighting was made on (migration 0009); absent for sightings logged before dives existed. */
  diveId?: string;
}

export type DiveCurrent = 'none' | 'light' | 'moderate' | 'strong';
export type DiveSurface = 'calm' | 'choppy' | 'rough';
export type DiveEntry = 'boat' | 'shore' | 'liveaboard';
export type DiveKind = 'reef' | 'wall' | 'wreck' | 'drift' | 'night' | 'muck' | 'cave' | 'deep' | 'training';
export type DiveGas = 'air' | 'nitrox' | 'trimix';
export type TankMaterial = 'aluminium' | 'steel';
export type DiveSuit = 'none' | 'skin' | 'shorty' | 'wet3' | 'wet5' | 'wet7' | 'semidry' | 'dry';

/** A signature on a dive's page: drawn with a finger, as an SVG path in a 300×100 box. */
export interface DiveSignature {
  name: string;
  /** Path data in the 300×100 signature box; absent for a buddy who typed their name. */
  svg?: string;
  /** ISO timestamp. */
  at: string;
  /** What the signer said they were (a claim, not a checked credential). */
  role?: 'buddy' | 'instructor' | 'divemaster' | 'guide' | 'other';
}

/** What a diver writes on a page of their log (all but the site, date and number are optional). */
export interface DiveFields {
  /** The diver's dive number: their lifetime count, not just dives in ScubaGo. */
  number: number;
  siteId: string;
  /** yyyy-mm-dd, the diver's local date. */
  divedOn: string;
  /** HH:MM, local time in the water. */
  timeIn?: string;
  bottomTimeMin?: number;
  maxDepthM?: number;
  avgDepthM?: number;
  waterTempC?: number;
  airTempC?: number;
  visibilityM?: number;
  current?: DiveCurrent;
  surface?: DiveSurface;
  entry?: DiveEntry;
  kinds?: DiveKind[];
  gas?: DiveGas;
  /** Oxygen in the mix, for nitrox and trimix. */
  o2Percent?: number;
  tankL?: number;
  tankMaterial?: TankMaterial;
  pressureStartBar?: number;
  pressureEndBar?: number;
  weightKg?: number;
  suit?: DiveSuit;
  /** 1 to 5. */
  rating?: number;
  buddyName?: string;
  /** The dive centre or shop: drawn as its stamp on the page (typed by the diver, so not verified). */
  centreName?: string;
  notes?: string;
  /** The buddy's signature, signed on the diver's phone. */
  signature?: DiveSignature;
}

/** One page of the diver's log. */
export interface Dive extends DiveFields {
  id: string;
  userId: string;
  /** Signatures sent from a buddy's own phone with a code (migration 0009); read-only here. */
  remoteSignatures?: DiveSignature[];
  /** A page made from sightings logged before dives existed: only the site and date are known. */
  fromSightings?: boolean;
  synced: boolean;
  createdAt: string;
  updatedAt?: string;
  syncError?: string;
}

/** 'public': everyone sees it. 'private': only the diver who logged it (src/lib/privacy.ts). */
export type Visibility = 'public' | 'private';

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
