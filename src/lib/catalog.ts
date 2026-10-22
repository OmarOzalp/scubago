import { SPECIES } from '@/data/species';
import { REAL_RARITY } from '@/lib/real-rarity';
import type { Species } from '@/lib/types';
import photos from '@/data/species-photos.json';

type PhotoMap = Record<string, { url: string; attribution: string }>;

/**
 * Species list with reference photos merged in from the generated photo map, and each species'
 * rarity from real records (how often it is recorded at dive sites in its own waters, from
 * iNaturalist and OBIS, docs/real-rarity.md) once that has been fetched; until then, while its tiers
 * are switched off, and for a species it has no tier for, the hand-assigned one.
 */
export const CATALOG: Species[] = SPECIES.map((s) => {
  const photo = (photos as PhotoMap)[s.id];
  const rarity = REAL_RARITY.get(s.id) ?? s.rarity;
  return photo || rarity !== s.rarity
    ? { ...s, rarity, ...(photo ? { photoUrl: photo.url, photoAttribution: photo.attribution } : {}) }
    : s;
});

export const CATALOG_BY_ID: Map<string, Species> = new Map(CATALOG.map((s) => [s.id, s]));

/**
 * "Something else": a sighting of an animal that isn't in the catalogue, named by the diver
 * (Sighting.customName). It's kept out of CATALOG and CATALOG_BY_ID on purpose, so it never counts
 * towards the collection, never swims on the island and has no species page.
 */
export const UNLISTED_ID = 'unlisted';
export const UNLISTED_NAME_MAX = 80;

const UNLISTED: Species = {
  id: UNLISTED_ID,
  commonName: 'Something else',
  scientificName: 'Not in the ScubaGo catalogue',
  category: 'other',
  rarity: 'common',
  blurb: 'An animal that isn’t in the catalogue yet, named by the diver.',
};

/** The species to show for a sighting: the catalogue's, or the diver's own name for "something else". */
export function speciesForSighting(s: { speciesId: string; customName?: string }): Species | undefined {
  if (s.speciesId === UNLISTED_ID) return { ...UNLISTED, commonName: s.customName?.trim() || UNLISTED.commonName };
  return CATALOG_BY_ID.get(s.speciesId);
}
