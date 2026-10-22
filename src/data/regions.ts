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
  // The Red Sea is shared by several countries, so its root has none. The children are ScubaGo's own
  // grouping of Egypt's coast, with the boundaries in src/lib/site-import.ts (docs/osm-sites.md).
  { id: 'red-sea', name: 'Red Sea', source: 'ScubaGo grouping' },
  { id: 'red-sea-sinai', name: 'Sinai', parentId: 'red-sea', country: 'Egypt', source: 'ScubaGo grouping (Sharm el-Sheikh, Ras Mohammed, Dahab, Nuweiba, the Straits of Tiran)' },
  { id: 'red-sea-hurghada', name: 'Hurghada & Safaga', parentId: 'red-sea', country: 'Egypt', source: 'ScubaGo grouping (Hurghada, El Gouna, Safaga, Giftun, the Strait of Gubal)' },
  { id: 'red-sea-southern', name: 'Marsa Alam & the south', parentId: 'red-sea', country: 'Egypt', source: 'ScubaGo grouping (Marsa Alam to Berenice, Fury Shoals)' },
  { id: 'red-sea-offshore', name: 'Offshore reefs', parentId: 'red-sea', country: 'Egypt', source: 'ScubaGo grouping (Brothers, Daedalus, Elphinstone, Rocky Island, Zabargad, St John’s)' },
  { id: 'gulf-of-suez', name: 'Gulf of Suez', parentId: 'red-sea', country: 'Egypt', source: 'ScubaGo grouping' },
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
