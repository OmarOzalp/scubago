import { afterEach, expect, test } from '@jest/globals';
import { deflateRawSync } from 'node:zlib';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '@/lib/archipelago';
import {
  chooseTables, encodeOceanPack, encodeOceanRegions, encodeOceanTable, oceanPackName, oceanRegionsName, readOceanPack, readOceanRegions, readOceanTable, unpackOcean, PACK_REACH,
  type OceanTable, type PackSource,
} from '@/lib/ocean-pack';
import { oceanSteps } from '@/lib/ocean-store';
import type { OceanIsland } from '@/lib/seabed';
import { clearSeabedBakes, type SeabedBake } from '@/lib/seabed-bake';
import { finish } from '@/lib/slices';

// The explorer's ocean shipped with the app (ocean-pack.ts): a pack and the islands' tables give back, for any order of the islands, exactly the
// numbers the computation gives. Built here from the computation for a few small sets of islands, each array compared number for number.
afterEach(() => clearSeabedBakes());
const place = (id: IslandId): OceanIsland => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] });
const compress = (bytes: Uint8Array) => new Uint8Array(deflateRawSync(bytes, { level: 9 }));
const worked = (level: number, ids: IslandId[]) => { clearSeabedBakes(); return finish(oceanSteps(level, ids.map(place), PACK_REACH)); };
const same = (name: string, a: ArrayLike<number>, b: ArrayLike<number>) => {
  expect(a.length).toBe(b.length);
  // (Object.is: the very same number, -0 and NaN included)
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) throw new Error(`${name}[${i}]: ${a[i]} and ${b[i]}`);
};
const sameOcean = (got: SeabedBake, want: SeabedBake) => {
  same('depth', got.depth!, want.depth!); same('region', got.region!, want.region!); same('regionMore', got.regionMore!, want.regionMore!);
  same('shoaling', got.shoaling!, want.shoaling!);
  same('positions', got.lattice!.positions, want.lattice!.positions); same('indices', got.lattice!.indices, want.lattice!.indices);
  expect(got.lattice!.terrain).toBe(want.lattice!.terrain);
};

const SETS: IslandId[][] = [['coral-reef', 'volcanic-pinnacle'], ['coral-reef', 'mangroves'], ['coral-reef', 'volcanic-pinnacle', 'mangroves']];
const LEVEL = 1;

test('the packs of some sets give back the ocean the computation gives, whatever order the islands are listed in', () => {
  const sources: PackSource[] = SETS.map((ids) => ({ level: LEVEL, islands: ids.map(place), bake: worked(LEVEL, ids) }));
  const tables = chooseTables(sources);
  const tableFiles = new Map(['r', 'v', 'm'].map((code) => [code, encodeOceanTable(code, LEVEL, tables, compress)] as const));
  for (const source of sources) {
    const pack = readOceanPack(encodeOceanPack(source, tables, compress));
    const use = new Map<string, OceanTable>(pack.header.blocks.map((b) => [b.code, readOceanTable(tableFiles.get(b.code)!)]));
    const regions = readOceanRegions(encodeOceanRegions(source, compress));
    // (the set as listed, and with the others the other way round, Home's island first as it always is; and with no region maps shipped, from the formula)
    for (const islands of [source.islands, [source.islands.find((i) => i.habitat === 'island')!, ...source.islands.filter((i) => i.habitat !== 'island').reverse()]]) {
      const ids = islands.map((island) => (Object.keys(ISLANDS) as IslandId[]).find((id) => ISLANDS[id] === island.habitat)!);
      const want = worked(LEVEL, ids);
      sameOcean(finish(unpackOcean(pack, use, regions, LEVEL, islands, PACK_REACH)), want);
      sameOcean(finish(unpackOcean(pack, use, undefined, LEVEL, islands, PACK_REACH)), want);
    }
  }
}, 120000);

test('a pack is for its own islands, level and reach, and a damaged one is refused', () => {
  const source: PackSource = { level: LEVEL, islands: SETS[0].map(place), bake: worked(LEVEL, SETS[0]) };
  const tables = chooseTables([source]);
  const bytes = encodeOceanPack(source, tables, compress);
  const pack = readOceanPack(bytes);
  const use = new Map<string, OceanTable>(['r', 'v'].map((code) => [code, readOceanTable(encodeOceanTable(code, LEVEL, tables, compress))]));
  expect(pack.header.name).toBe('vr-1');
  // another island, another level and another reach are not this pack's
  expect(() => finish(unpackOcean(pack, use, undefined, LEVEL, SETS[1].map(place), PACK_REACH))).toThrow();
  expect(() => finish(unpackOcean(pack, use, undefined, 2, source.islands, PACK_REACH))).toThrow();
  expect(() => finish(unpackOcean(pack, use, undefined, LEVEL, source.islands, { x: 26, z: 20 }))).toThrow();
  // region maps of other islands are refused too
  const others = readOceanRegions(encodeOceanRegions({ level: LEVEL, islands: SETS[1].map(place), bake: worked(LEVEL, SETS[1]) }, compress));
  expect(() => finish(unpackOcean(pack, use, others, LEVEL, source.islands, PACK_REACH))).toThrow();
  expect(oceanRegionsName(source.islands)).toBe('rg-vr');
  expect(oceanRegionsName([place('coral-reef'), place('volcanic-pinnacle')])).toBe('rg-vr');
  // cut short, or not a pack at all
  expect(() => readOceanPack(bytes.subarray(0, 8))).toThrow();
  expect(() => readOceanPack(new Uint8Array(40))).toThrow();
  const cut = readOceanPack(bytes.subarray(0, bytes.length - 40));
  expect(() => finish(unpackOcean(cut, use, undefined, LEVEL, source.islands, PACK_REACH))).toThrow();
  // a byte flipped inside a section's stream either throws or gives other numbers than the computation's (the bake script checks every pack against it)
  const start = Math.ceil((12 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true)) / 8) * 8, section = pack.header.sections.dR;
  const damaged = bytes.slice();
  damaged[start + section.offset + (section.length >> 1)] ^= 0x55;
  let outcome: 'threw' | 'changed' | 'same' = 'same';
  try {
    const got = finish(unpackOcean(readOceanPack(damaged), use, undefined, LEVEL, source.islands, PACK_REACH));
    try { sameOcean(got, worked(LEVEL, SETS[0])); } catch { outcome = 'changed'; }
  } catch { outcome = 'threw'; }
  expect(outcome).not.toBe('same');
});

test('the pack of an ocean is named for its islands from north to south, whatever their order, and only the shipped sets and reach have one', () => {
  const ids: IslandId[] = ['coral-reef', 'kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck'];
  expect(oceanPackName(3, ids.map(place), PACK_REACH)).toBe('kvrmw-3');
  expect(oceanPackName(3, [ids[0], ...[...ids.slice(1)].reverse()].map(place), PACK_REACH)).toBe('kvrmw-3');
  // (Home's island always comes first; listed after another island the numbers are not the same in the far water, and there is no pack)
  expect(oceanPackName(3, [...ids].reverse().map(place), PACK_REACH)).toBeNull();
  expect(oceanPackName(6, [place('coral-reef'), place('shipwreck')], 20)).toBe('rw-6');
  // Home's island alone has its bake already; another place or water, a level out of range, or another reach, no pack
  expect(oceanPackName(3, [place('coral-reef')], PACK_REACH)).toBeNull();
  expect(oceanPackName(3, [place('coral-reef'), { x: 3, z: 3, habitat: 'kelp' }], PACK_REACH)).toBeNull();
  expect(oceanPackName(3, [place('coral-reef'), { ...place('kelp-forest'), habitat: 'wreck' }], PACK_REACH)).toBeNull();
  expect(oceanPackName(0, ids.map(place), PACK_REACH)).toBeNull();
  expect(oceanPackName(7, ids.map(place), PACK_REACH)).toBeNull();
  expect(oceanPackName(3, ids.map(place), { x: 42, z: 20 })).toBeNull();
});
