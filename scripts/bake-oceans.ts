/**
 * Build the oceans shipped with the app (src/lib/ocean-pack.ts): for every set of islands a diver can have found, at every level it can have, the
 * explorer's ocean at the water a phone has, written to assets/baked/ocean/<name>.bin (a pack for each set and level, a table for each island and
 * level, the region maps of each set), plus the list the app loads them from (src/components/home/three/ocean-pack-files.ts).
 *
 *   npx tsx scripts/bake-oceans.ts      (the packs, and the version the saved oceans are checked against)
 *   npx tsx scripts/bake-seabed.ts      (everything: the seabed bakes too)
 *
 * Every ocean is worked out here, the slow way, and every pack is unpacked again from the bytes about to be written and compared with it, number
 * for number (Object.is): a pack that differs from the computation is never written. scripts/verify-ocean-packs.ts checks every order the islands
 * can be listed in against the files as they are on disk.
 *
 * Run it after any change to how the seabed or the ocean's depth is made (seabed*.ts, island-outline.ts, ocean.ts, banks.ts, reef-coast.ts...): the
 * ocean version (src/lib/ocean-version.ts) records a digest of these files, and its test fails on a stale one.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { constants, deflateRawSync } from 'node:zlib';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '../src/lib/archipelago';
import {
  chooseTables, encodeOceanPack, encodeOceanRegions, encodeOceanTable, oceanPackName, oceanRegionsName, oceanTableName, PACK_REACH, readOceanPack, readOceanRegions, readOceanTable,
  unpackOcean, type OceanTable, type PackSource,
} from '../src/lib/ocean-pack';
import { oceanSteps } from '../src/lib/ocean-store';
import type { OceanIsland } from '../src/lib/seabed';
import { clearSeabedBakes, type SeabedBake } from '../src/lib/seabed-bake';
import { finish } from '../src/lib/slices';

/** The islands other than Home's, north to south. */
const OTHERS: IslandId[] = ['kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck'];
const place = (id: IslandId): OceanIsland => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] });
/** Deflated as small as zlib's strategies make it (any of them inflates the same). */
const compress = (bytes: Uint8Array) => {
  let best: Buffer | undefined;
  for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
    const packed = deflateRawSync(bytes, { level: 9, memLevel: 9, strategy });
    if (!best || packed.length < best.length) best = packed;
  }
  return new Uint8Array(best!);
};

/**
 * The sets of islands a diver can have at a level, Home's island first and the others north to south: the level is the species count's (3 species is
 * level 2, 8 is level 3: home.ts), so a diver of level 1 has found at most two areas, and any of level 2 or more may have all four others.
 */
export function reachableSets(level: number) {
  const sets: IslandId[][] = [];
  for (let mask = 1; mask < 16; mask++) {
    const others = OTHERS.filter((_, i) => mask & (1 << i));
    if (level === 1 && others.length > 2) continue;
    sets.push(['coral-reef', ...others]);
  }
  return sets;
}

const same = (name: string, got: ArrayLike<number>, want: ArrayLike<number>) => {
  if (got.length !== want.length) throw new Error(`${name}: ${got.length} numbers, the computation has ${want.length}`);
  for (let i = 0; i < want.length; i++) if (!Object.is(got[i], want[i])) throw new Error(`${name}[${i}]: ${got[i]}, the computation has ${want[i]}`);
};
/** Whether an ocean is every number of another (the arrays the explorer is drawn from). */
function expectSame(got: SeabedBake, want: SeabedBake, what: string) {
  try {
    same('depth', got.depth!, want.depth!); same('region', got.region!, want.region!); same('regionMore', got.regionMore!, want.regionMore!); same('shoaling', got.shoaling!, want.shoaling!);
    same('positions', got.lattice!.positions, want.lattice!.positions); same('indices', got.lattice!.indices, want.lattice!.indices);
    if (got.lattice!.terrain !== want.lattice!.terrain) throw new Error('terrain');
  } catch (error) {
    throw new Error(`${what} differs from the computation, and is not written: ${error instanceof Error ? error.message : error}`);
  }
}

/** Every file, worked out and checked, by name. Nothing is written. */
export function buildOceanFiles(log: (line: string) => void = () => undefined) {
  const files = new Map<string, Uint8Array>();
  const regionMaps = new Map<string, SeabedBake>();
  for (let level = 1; level <= 6; level++) {
    const started = Date.now();
    const sources: (PackSource & { ids: IslandId[] })[] = reachableSets(level).map((ids) => {
      const islands = ids.map(place);
      clearSeabedBakes();
      return { level, islands, ids, bake: finish(oceanSteps(level, islands, PACK_REACH)) };
    });
    const tables = chooseTables(sources);
    const tableFiles = new Map<string, Uint8Array>();
    for (const code of 'rkvmw') {
      const bytes = encodeOceanTable(code, level, tables, compress);
      files.set(oceanTableName(code, level), bytes);
      tableFiles.set(code, bytes);
    }
    for (const source of sources) {
      const name = oceanPackName(level, source.islands, PACK_REACH)!;
      files.set(name, encodeOceanPack(source, tables, compress));
      // The region maps do not depend on the level: made once for each set, and the same at every level.
      const regionsName = oceanRegionsName(source.islands)!;
      const earlier = regionMaps.get(regionsName);
      if (earlier) {
        try { same('region', source.bake.region!, earlier.region!); same('regionMore', source.bake.regionMore!, earlier.regionMore!); }
        catch (error) { throw new Error(`the region maps of ${regionsName} at level ${level} are not those of the level before: ${error instanceof Error ? error.message : error}`); }
      } else { regionMaps.set(regionsName, source.bake); files.set(regionsName, encodeOceanRegions(source, compress)); }
    }
    // Each pack as the app will read it, against the computation it was made from.
    for (const source of sources) {
      const name = oceanPackName(level, source.islands, PACK_REACH)!;
      const pack = readOceanPack(files.get(name)!);
      const tablesRead = new Map<string, OceanTable>(pack.header.blocks.map((b) => [b.code, readOceanTable(files.get(oceanTableName(b.code, level))!)]));
      const regions = readOceanRegions(files.get(oceanRegionsName(source.islands)!)!);
      expectSame(finish(unpackOcean(pack, tablesRead, regions, level, source.islands, PACK_REACH)), source.bake, `pack ${name}`);
      // (and the same without the region maps, which are then worked out)
      expectSame(finish(unpackOcean(pack, tablesRead, undefined, level, source.islands, PACK_REACH)), source.bake, `pack ${name} with its region maps worked out`);
    }
    log(`level ${level}: ${sources.length} sets worked out and checked (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  return files;
}

/** Write the files, and the list the app loads them from. */
export function writeOceanFiles(root: string, files: Map<string, Uint8Array>) {
  const out = join(root, 'assets/baked/ocean');
  mkdirSync(out, { recursive: true });
  for (const file of readdirSync(out)) if (file.endsWith('.bin') && !files.has(file.slice(0, -4))) rmSync(join(out, file));
  const names = [...files.keys()].sort();
  for (const name of names) writeFileSync(join(out, `${name}.bin`), files.get(name)!);
  const lines = names.map((name) => `  '${name}': require('@/assets/baked/ocean/${name}.bin'),`);
  writeFileSync(join(root, 'src/components/home/three/ocean-pack-files.ts'), `/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles an asset only where a require() names it */
/** The oceans shipped with the app (written by scripts/bake-oceans.ts with the files themselves: don't edit by hand), by name (ocean-pack.ts). */
export const OCEAN_PACK_FILES: Record<string, number> = {
${lines.join('\n')}
};
`);
  return names;
}

async function main() {
  const ROOT = resolve(dirname(process.argv[1]), '..');
  const started = Date.now();
  const files = buildOceanFiles((line) => console.log(line));
  const names = writeOceanFiles(ROOT, files);
  const total = [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  console.log(`${names.length} files, ${total} bytes (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  // The version the saved oceans are checked against now holds these files' digests.
  const { writeOceanVersion } = await import('./ocean-version-file');
  console.log(`ocean version ${writeOceanVersion(ROOT)}`);
}
if (process.argv[1] && /bake-oceans\.[tj]s$/.test(process.argv[1])) void main();
