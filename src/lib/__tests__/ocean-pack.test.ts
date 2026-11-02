import { afterEach, expect, test } from '@jest/globals';
import { type IslandId } from '@/lib/archipelago';
import {
  oceanPackName, oceanRegionsName, oceanSetCode, oceanTableName, PACK_REACH, readOceanPack, readOceanRegions, readOceanTable, unpackOcean, type OceanTable,
} from '@/lib/ocean-pack';
import { clearSeabedBakes, type SeabedBake } from '@/lib/seabed-bake';
import { finish } from '@/lib/slices';
import { packFiles, place, workedOcean } from '@/test-support/ocean-packs';

// The explorer's ocean shipped with the app (ocean-pack.ts): a pack, its islands' tables and its region maps give back, for any order of the islands
// (Home's first), exactly the numbers the computation gives. Built here from the computation for two small sets, each array compared number for number;
// scripts/verify-ocean-packs.ts does every set, level and order against the files as they ship, and the shipped files' own test is ocean-pack-shipped.test.ts.
afterEach(() => clearSeabedBakes());
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

const LEVEL = 1;
const RV: IslandId[] = ['coral-reef', 'volcanic-pinnacle'], RM: IslandId[] = ['coral-reef', 'mangroves'];
const open = (files: Map<string, Uint8Array>, name: string) => {
  const pack = readOceanPack(files.get(name)!);
  return { pack, tables: new Map<string, OceanTable>(pack.header.blocks.map((b) => [b.code, readOceanTable(files.get(oceanTableName(b.code, LEVEL))!)])) };
};

test('the files of two sets give back the ocean the computation gives, with the region maps shipped or worked out', () => {
  const { sources, files } = packFiles(LEVEL, [RV, RM]);
  // (the two sets share Home's island, whose heights the tables settle on once: the other set's differing vertices are the pack's own)
  const over = sources.map((source) => open(files, oceanPackName(LEVEL, source.islands, PACK_REACH)!).pack.header.blocks.reduce((sum, b) => sum + b.over, 0));
  expect(Math.max(...over)).toBeGreaterThan(0);
  for (const [ids, name] of [[RV, 'vr-1'], [RM, 'rm-1']] as const) {
    const islands = ids.map(place), { pack, tables } = open(files, name);
    expect(oceanPackName(LEVEL, islands, PACK_REACH)).toBe(name);
    const want = workedOcean(LEVEL, [...ids]);
    // (one with its region maps shipped, the other without: they are then worked out from the formula, and are the same)
    const regions = ids === RV ? readOceanRegions(files.get(oceanRegionsName(islands)!)!) : undefined;
    sameOcean(finish(unpackOcean(pack, tables, regions, LEVEL, islands, PACK_REACH)), want);
  }
}, 60000);

test('a pack is for its own islands, level and reach; damaged, cut short or not inflating, it is refused', () => {
  const { files } = packFiles(LEVEL, [RV, RM]);
  const { pack, tables } = open(files, 'vr-1'), islands = RV.map(place);
  // another set, another level and another reach are not this pack's
  expect(() => finish(unpackOcean(pack, tables, undefined, LEVEL, RM.map(place), PACK_REACH))).toThrow();
  expect(() => finish(unpackOcean(pack, tables, undefined, 2, islands, PACK_REACH))).toThrow();
  expect(() => finish(unpackOcean(pack, tables, undefined, LEVEL, islands, { x: 26, z: 20 }))).toThrow();
  // region maps of other islands too
  expect(() => finish(unpackOcean(pack, tables, readOceanRegions(files.get('rg-rm')!), LEVEL, islands, PACK_REACH))).toThrow();
  // a byte flipped anywhere after the header, or a file cut short, is told by its digest
  const bytes = files.get('vr-1')!;
  for (const at of [bytes.length - 3, bytes.length >> 1, bytes.length - 400]) {
    const damaged = bytes.slice();
    damaged[at] ^= 0x55;
    expect(() => readOceanPack(damaged)).toThrow(/damaged/);
  }
  expect(() => readOceanPack(bytes.subarray(0, bytes.length - 40))).toThrow();
  expect(() => readOceanPack(bytes.subarray(0, 8))).toThrow();
  expect(() => readOceanPack(new Uint8Array(40))).toThrow();
  expect(() => readOceanTable(bytes)).toThrow();
  // sections that do not inflate, in a file whose digest is right
  const broken = packFiles(LEVEL, [RV], () => Uint8Array.of(1, 2, 3, 4)).files;
  const bad = open(broken, 'vr-1');
  expect(() => finish(unpackOcean(bad.pack, bad.tables, undefined, LEVEL, islands, PACK_REACH))).toThrow();
});

test('an ocean is named for its islands from north to south, whatever the others’ order, with Home first; only shipped sets and reach have one', () => {
  const ids: IslandId[] = ['coral-reef', 'kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck'];
  expect(oceanPackName(3, ids.map(place), PACK_REACH)).toBe('kvrmw-3');
  expect(oceanPackName(3, [ids[0], ...[...ids.slice(1)].reverse()].map(place), PACK_REACH)).toBe('kvrmw-3');
  expect(oceanRegionsName(ids.map(place))).toBe('rg-kvrmw');
  expect(oceanTableName('r', 3)).toBe('t-r-3');
  expect(oceanPackName(6, [place('coral-reef'), place('shipwreck')], 20)).toBe('rw-6');
  expect(oceanSetCode([place('coral-reef'), place('mangroves')])).toBe('rm');
  // Home's island comes first; listed after another island the far water is not the same, and there is no pack
  expect(oceanPackName(3, [...ids].reverse().map(place), PACK_REACH)).toBeNull();
  // Home's island alone has its bake already; another place or water, a level out of range, or another reach, no pack
  expect(oceanPackName(3, [place('coral-reef')], PACK_REACH)).toBeNull();
  expect(oceanPackName(3, [place('coral-reef'), { x: 3, z: 3, habitat: 'kelp' }], PACK_REACH)).toBeNull();
  expect(oceanPackName(3, [place('coral-reef'), { ...place('kelp-forest'), habitat: 'wreck' }], PACK_REACH)).toBeNull();
  expect(oceanPackName(3, [place('coral-reef'), place('coral-reef')], PACK_REACH)).toBeNull();
  expect(oceanPackName(0, ids.map(place), PACK_REACH)).toBeNull();
  expect(oceanPackName(7, ids.map(place), PACK_REACH)).toBeNull();
  expect(oceanPackName(3, ids.map(place), { x: 42, z: 20 })).toBeNull();
  expect(oceanPackName(3, ids.map(place), 20)).toBe('kvrmw-3');
});
