import { islets, shapeFor, type IslandShape } from '@/lib/island-outline';
import type { Habitat } from '@/lib/home';

/**
 * The keys the island meshes are kept under (geometry-cache.ts), which are also the names of the files shipped for them (mesh-store.ts): one place for
 * the components that make them and for what loads and bakes them. A mesh depends on the island, its level (through its islets, or its corals, kelp and
 * seagrass) and the quality tier (`lite`, which only simulators use: nothing is shipped for it).
 */
export const meshKey = {
  reefCoast: (lite: boolean) => `reef-coast:${lite}`,
  /** (the coral heads' key; `useCoralMesh` adds the tier) */
  reefCorals: (level: number) => `reef-corals:${level}`,
  kelpCoast: (level: number) => `kelp-coast:${islets(level, 'kelp').length}`,
  kelpForest: (level: number, lite: boolean) => `kelp-forest:${level}:${lite}`,
  volcanicCoast: (level: number) => `volcanic-coast:${islets(level, 'volcanic').length}`,
  mangroveCoast: (level: number, lite: boolean) => `mangrove-coast:${islets(level, 'mangrove').length}:${lite}`,
  seagrass: (level: number, lite: boolean) => `seagrass:${level}:${lite}`,
  wreckCoast: (lite: boolean) => `wreck-coast:${lite}`,
  wreckSunken: 'wreck-sunken',
} as const;

/** The meshes an island of this shape has at this level, in full quality: what a scene of it asks the geometry cache for (and what a bake of it holds). */
export function islandMeshKeys(shape: IslandShape, level: number): string[] {
  switch (shape) {
    case 'reef': return [meshKey.reefCoast(false), `${meshKey.reefCorals(level)}:false`];
    case 'kelp': return [meshKey.kelpCoast(level)]; // (the kelp forest, 2 MB for about 55 ms, is made on the phone: kelp-forest.tsx)
    case 'volcanic': return [meshKey.volcanicCoast(level)];
    case 'mangrove': return [meshKey.mangroveCoast(level, false), meshKey.seagrass(level, false)];
    case 'wreck': return [meshKey.wreckCoast(false), meshKey.wreckSunken];
  }
}
/** The same for the habitat whose water the island lies in. */
export const habitatMeshKeys = (habitat: Habitat, level: number) => islandMeshKeys(shapeFor(habitat), level);

/** The name of the file for a key (the key itself, with the colons made into dashes). */
export const meshFileName = (key: string) => key.replace(/:/g, '-');
