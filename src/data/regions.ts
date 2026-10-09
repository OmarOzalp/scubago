import type { Region } from '@/lib/types';

/**
 * Regions dive sites belong to. The Great Barrier Reef's children are the Marine Park's four
 * management areas. Marine Regions ids (mrgid) are left out until they can be confirmed at
 * marineregions.org (see docs/roadmap/dive-site-data.md).
 */
export const REGIONS: Region[] = [
  { id: 'great-barrier-reef', name: 'Great Barrier Reef', country: 'Australia', source: 'Great Barrier Reef Marine Park Authority' },
  { id: 'gbr-far-northern', name: 'Far Northern', parentId: 'great-barrier-reef', country: 'Australia', source: 'GBRMPA management areas' },
  { id: 'gbr-cairns-cooktown', name: 'Cairns/Cooktown', parentId: 'great-barrier-reef', country: 'Australia', source: 'GBRMPA management areas' },
  { id: 'gbr-townsville-whitsunday', name: 'Townsville/Whitsunday', parentId: 'great-barrier-reef', country: 'Australia', source: 'GBRMPA management areas' },
  { id: 'gbr-mackay-capricorn', name: 'Mackay/Capricorn', parentId: 'great-barrier-reef', country: 'Australia', source: 'GBRMPA management areas' },
  { id: 'coral-sea', name: 'Coral Sea', country: 'Australia', source: 'Coral Sea Marine Park' },
];

export const REGIONS_BY_ID: Map<string, Region> = new Map(REGIONS.map((r) => [r.id, r]));

/** "Cairns/Cooktown, Great Barrier Reef": a region with its parents. */
export function regionPath(id: string | undefined): string | null {
  const names: string[] = [];
  for (let region = id ? REGIONS_BY_ID.get(id) : undefined; region; region = region.parentId ? REGIONS_BY_ID.get(region.parentId) : undefined) {
    names.push(region.name);
  }
  return names.length ? names.join(', ') : null;
}
