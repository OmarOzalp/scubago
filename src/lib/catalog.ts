import { SPECIES } from '@/data/species';
import type { Species } from '@/lib/types';
import photos from '@/data/species-photos.json';

type PhotoMap = Record<string, { url: string; attribution: string }>;

/** Species list with reference photos merged in from the generated photo map. */
export const CATALOG: Species[] = SPECIES.map((s) => {
  const photo = (photos as PhotoMap)[s.id];
  return photo ? { ...s, photoUrl: photo.url, photoAttribution: photo.attribution } : s;
});

export const CATALOG_BY_ID: Map<string, Species> = new Map(CATALOG.map((s) => [s.id, s]));
