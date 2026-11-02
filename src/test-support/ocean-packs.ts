import { deflateRawSync } from 'node:zlib';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '@/lib/archipelago';
import {
  chooseTables, encodeOceanPack, encodeOceanRegions, encodeOceanTable, oceanPackName, oceanRegionsName, oceanSetCode, oceanTableName, PACK_REACH, type Compress, type PackSource,
} from '@/lib/ocean-pack';
import type { OceanPackSource } from '@/lib/ocean-store';
import { oceanSteps } from '@/lib/ocean-store';
import type { OceanIsland } from '@/lib/seabed';
import { clearSeabedBakes, type SeabedBake } from '@/lib/seabed-bake';
import { finish } from '@/lib/slices';

/** Oceans shipped with the app (src/lib/ocean-pack.ts) in small: the files for some sets of islands at one level, made here from the computation. */
export const place = (id: IslandId): OceanIsland => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] });
export const deflate: Compress = (bytes) => new Uint8Array(deflateRawSync(bytes, { level: 9 }));

const worked = new Map<string, SeabedBake>();
/** The ocean of these islands (in this order) at the shipped reach, worked out from nothing (kept: it is the slow part of a test). */
export function workedOcean(level: number, ids: IslandId[]) {
  const key = `${level}|${ids.join(',')}`;
  let bake = worked.get(key);
  if (!bake) {
    clearSeabedBakes();
    bake = finish(oceanSteps(level, ids.map(place), PACK_REACH));
    worked.set(key, bake);
  }
  return bake;
}

/** The files (by name) for these sets of islands (each starting with Home's island) at a level; `compress` is the deflate, to be made to fail. */
export function packFiles(level: number, sets: IslandId[][], compress: Compress = deflate) {
  const sources: PackSource[] = sets.map((ids) => ({ level, islands: ids.map(place), bake: workedOcean(level, ids) }));
  const tables = chooseTables(sources), files = new Map<string, Uint8Array>();
  for (const source of sources) {
    files.set(oceanPackName(level, source.islands, PACK_REACH)!, encodeOceanPack(source, tables, compress));
    files.set(oceanRegionsName(source.islands)!, encodeOceanRegions(source, compress));
    for (const code of oceanSetCode(source.islands)!) files.set(oceanTableName(code, level), encodeOceanTable(code, level, tables, compress));
  }
  return { sources, files };
}

/** A source of shipped files held in memory, with a log of what was asked for. */
export function memorySource(files: Map<string, Uint8Array>) {
  const asked: string[] = [];
  const source: OceanPackSource = { async read(name) { asked.push(name); return files.get(name) ?? null; } };
  return { source, asked };
}
