import type { Dive, DiveSite, Rarity, Region, Sighting, Species } from '@/lib/types';

/**
 * What the rewards engine reads. Everything comes in as a parameter, so the engine never touches the
 * store, storage or the network and the same input always gives the same rewards. The caller decides
 * what counts: demo sightings are used when they are passed, and left out when they are not.
 */
export interface RewardsInput {
  /**
   * Every sighting to count. A sighting of "something else" (`unlisted`) or of a species the catalog
   * lacks still counts for places, never for species.
   */
  sightings: readonly Sighting[];
  /** The diver's logbook. `number` is the diver's lifetime dive number, not the count of pages here. */
  dives: readonly Dive[];
  /**
   * Every dive site that can be named, by id: the seed sites, the diver's own and any imported ones.
   * A visit to a site missing from here is left out of the places, so evaluate once the sites have loaded.
   */
  sites: ReadonlyMap<string, DiveSite>;
  /** The species catalog (`CATALOG_BY_ID`). */
  catalog: ReadonlyMap<string, Species>;
  /**
   * Rarity tiers worked out from real public sightings records (iNaturalist, OBIS), by species id.
   * A species without one keeps its catalog rarity (see `effectiveRarity`).
   */
  observed?: ReadonlyMap<string, Rarity>;
  /** Where to walk a site's `regionId` up its `parentId` chain. Defaults to `REGIONS_BY_ID`. */
  regions?: ReadonlyMap<string, Region>;
}

/**
 * What a badge or collection plate shows, as a key the UI maps to an icon or engraving. The engine
 * only names the picture, it never draws one.
 */
export type Emblem =
  | 'book'
  | 'star'
  | 'gem'
  | 'crown'
  | 'shark'
  | 'ray'
  | 'turtle'
  | 'mammal'
  | 'cephalopod'
  | 'night'
  | 'wreck'
  | 'dive'
  | 'compass'
  | 'globe'
  | 'reef'
  | 'wave'
  | 'island';
