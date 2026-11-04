/**
 * Every mesh an island scene asks the geometry cache for in the full quality tier (mesh-keys.ts), for every island and every level, each made by the very builder
 * the component uses, with nothing kept between builds: what scripts/bake-meshes.ts ships and scripts/verify-meshes.ts (and the freshness test) check the shipped
 * files against. Run with scripts/tsconfig.meshes.json (the builders import @react-three/fiber, which the app has and a script does not).
 */
import type { BufferGeometry } from 'three';
import type { IslandShape } from '../../src/lib/island-outline';
import { coralHeads } from '../../src/lib/reef-coast';
import { islandMeshKeys } from '../../src/components/home/three/mesh-keys';
import { kelpCoastJob } from '../../src/components/home/three/kelp-coast';
import { mangroveCoastJob } from '../../src/components/home/three/mangrove-coast';
import { coralsJob, reefCoastJob } from '../../src/components/home/three/reef-coast';
import { seagrassGeometry } from '../../src/components/home/three/seagrass-meadow';
import { runAll } from '../../src/components/home/three/sliced-geometry';
import { volcanicCoastJob } from '../../src/components/home/three/volcanic-coast';
import { wreckCoastGeometries, wreckSunkenGeometry } from '../../src/components/home/three/wreck-coast';

export const SHAPES: IslandShape[] = ['reef', 'kelp', 'volcanic', 'mangrove', 'wreck'];
export type MeshBuild = { key: string; shape: IslandShape; level: number; build: () => BufferGeometry };

/** The builders of an island's meshes at a level, in the order of `islandMeshKeys`. */
function buildersOf(shape: IslandShape, level: number): (() => BufferGeometry)[] {
  switch (shape) {
    case 'reef': return [() => runAll(reefCoastJob(false)), () => runAll(coralsJob(() => coralHeads(level), false))];
    case 'kelp': return [() => runAll(kelpCoastJob(level))];
    case 'volcanic': return [() => runAll(volcanicCoastJob(level))];
    case 'mangrove': return [() => runAll(mangroveCoastJob(level, false)), () => seagrassGeometry(level, false)];
    case 'wreck': return [() => wreckCoastGeometries(false).coast, wreckSunkenGeometry];
  }
}

/** All of them: each island at each level (a key shared by several levels turns up once for each). */
export function meshBuilds(): MeshBuild[] {
  const builds: MeshBuild[] = [];
  for (const shape of SHAPES) {
    for (let level = 1; level <= 6; level++) {
      const keys = islandMeshKeys(shape, level), builders = buildersOf(shape, level);
      if (keys.length !== builders.length) throw new Error(`${shape} at level ${level}: ${keys.length} keys and ${builders.length} builders`);
      keys.forEach((key, i) => builds.push({ key, shape, level, build: builders[i] }));
    }
  }
  return builds;
}
