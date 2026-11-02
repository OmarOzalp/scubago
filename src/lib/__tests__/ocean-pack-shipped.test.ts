import { expect, test } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OCEAN_PACK_FILES } from '@/components/home/three/ocean-pack-files';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '@/lib/archipelago';
import { fingerprintBakes, fingerprintOcean, OCEAN_PROBES } from '@/lib/ocean-fingerprint';
import {
  latticeLayout, oceanPackName, oceanRegionsName, oceanTableName, PACK_REACH, readOceanPack, readOceanRegions, readOceanTable, unpackOcean, type OceanTable,
} from '@/lib/ocean-pack';
import { OCEAN_PARTS } from '@/lib/ocean-version';
import type { OceanIsland } from '@/lib/seabed';
import { finish } from '@/lib/slices';

// The oceans shipped with the app (assets/baked/ocean, written by scripts/bake-oceans.ts): the files are the ones the ocean version records, each reads
// back whole, and the packs of the probes unpack to the very numbers the version was written for. (scripts/verify-ocean-packs.ts compares every
// pack, in every order of the islands, with the computation itself.)
const DIR = join(process.cwd(), 'assets/baked/ocean');
const file = (name: string) => new Uint8Array(readFileSync(join(DIR, `${name}.bin`)));
const place = (id: IslandId): OceanIsland => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] });
/** Numbers a..a+length of one array are the same as b..b+length of another (Object.is). */
const sameRun = (a: ArrayLike<number>, from: number, b: ArrayLike<number>, at: number, length: number) => {
  for (let i = 0; i < length; i++) if (!Object.is(a[from + i], b[at + i])) throw new Error(`number ${i}: ${a[from + i]} and ${b[at + i]}`);
};
const STALE = 'The shipped oceans are not what the ocean version was written for: run npx tsx scripts/bake-seabed.ts (or bake-oceans.ts)';

function unpack(level: number, islands: OceanIsland[]) {
  const pack = readOceanPack(file(oceanPackName(level, islands, PACK_REACH)!));
  const tables = new Map<string, OceanTable>(pack.header.blocks.map((b) => [b.code, readOceanTable(file(oceanTableName(b.code, level)))]));
  return finish(unpackOcean(pack, tables, readOceanRegions(file(oceanRegionsName(islands)!)), level, islands, PACK_REACH));
}

test('the files on disk are the ones the app loads, every set at every level, within the size the app has for them', () => {
  const names = readdirSync(DIR).filter((f) => f.endsWith('.bin')).map((f) => f.slice(0, -4)).sort();
  expect(names).toEqual(Object.keys(OCEAN_PACK_FILES).sort());
  // 85 packs (10 sets at the first level, 15 at each of the others), a table for each island and level, the region maps of each set
  expect(names.filter((n) => /^[kvrmw]+-\d$/.test(n))).toHaveLength(85);
  expect(names.filter((n) => n.startsWith('t-'))).toHaveLength(30);
  expect(names.filter((n) => n.startsWith('rg-'))).toHaveLength(15);
  const bytes = names.reduce((sum, n) => sum + file(n).length, 0);
  expect(bytes).toBeLessThanOrEqual(3769848);
});

test('every shipped file is whole (its digest holds) and is the one the ocean version records', () => {
  const names = readdirSync(DIR).filter((f) => f.endsWith('.bin')).sort();
  const files = names.map((n) => new Uint8Array(readFileSync(join(DIR, n))));
  if (fingerprintBakes(files) !== OCEAN_PARTS.packs) throw new Error(STALE);
  for (const [i, name] of names.entries()) {
    if (name.startsWith('t-')) readOceanTable(files[i]);
    else if (name.startsWith('rg-')) readOceanRegions(files[i]);
    else expect(readOceanPack(files[i]).header.name).toBe(name.slice(0, -4));
  }
});

test.each([
  [0, 'the whole archipelago at the last level'],
  [2, 'two islands at the third'],
])('the shipped ocean of probe %s (%s) unpacks to the numbers the version was written for', (n) => {
  const { level, islands } = OCEAN_PROBES[n];
  if (fingerprintOcean(unpack(level, islands)) !== OCEAN_PARTS.probes[n]) throw new Error(STALE);
});

test('the same pack serves the islands in another order: the maps and the water are the same, each island has its own block, the region maps move channels', () => {
  const ids: IslandId[] = ['coral-reef', 'kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck'];
  const first = ids.map(place), second = [ids[0], ...ids.slice(1).reverse()].map(place);
  const a = unpack(4, first), b = unpack(4, second);
  expect(Buffer.from(b.depth!).equals(Buffer.from(a.depth!))).toBe(true);
  expect(Buffer.from(b.shoaling!.buffer).equals(Buffer.from(a.shoaling!.buffer))).toBe(true);
  const la = latticeLayout(a.lattice!, first, PACK_REACH), lb = latticeLayout(b.lattice!, second, PACK_REACH);
  expect(lb.floor).toBe(la.floor);
  const floor = la.floor * 3;
  sameRun(b.lattice!.positions, 0, a.lattice!.positions, 0, floor);
  first.forEach((island, i) => {
    const j = second.findIndex((other) => other.habitat === island.habitat);
    expect(lb.blocks[j].n).toBe(la.blocks[i].n);
    const length = la.blocks[i].n * 96 * 3;
    sameRun(b.lattice!.positions, lb.blocks[j].start * 3, a.lattice!.positions, la.blocks[i].start * 3, length);
  });
  // (a water's channel in the region maps is where its island is in the list)
  const texels = a.depth!.length / 4;
  for (let t = 0; t < texels; t += 7) {
    for (const [i, island] of first.entries()) {
      const j = second.findIndex((other) => other.habitat === island.habitat);
      const wasMap = i < 4 ? a.region! : a.regionMore!, nowMap = j < 4 ? b.region! : b.regionMore!;
      expect(nowMap[t * 4 + (j & 3)]).toBe(wasMap[t * 4 + (i & 3)]);
    }
  }
});
