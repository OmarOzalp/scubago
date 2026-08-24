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

export interface DiveSite {
  id: string; // slug, e.g. "richelieu-rock"
  name: string;
  lat: number;
  lng: number;
  region: string;
  country: string;
  blurb: string;
  /** Species ids realistically seen here; powers demo data + "what to expect". */
  notableSpecies: string[];
  source: 'seed' | 'user';
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
}

/** One entry in the user's species collection, derived from their sightings. */
export interface DexEntry {
  species: Species;
  count: number;
  firstSeenOn: string;
  firstSeenSiteId: string;
  lastSeenOn: string;
}
