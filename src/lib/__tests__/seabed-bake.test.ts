import { afterEach, expect, jest, test } from '@jest/globals';
import { OCEAN } from '@/lib/ocean';
import * as reefCoast from '@/lib/reef-coast';
import { createSeabed, createSeabedField } from '@/lib/seabed';
import {
  bakedDepth, bakedLattice, bakedRegions, bakedShoaling, clearSeabedBakes, digestBytes, EXPLORER_REACH, hasOcean, hasSeabedBake, KEPT_OCEANS, readSeabedBake,
  registerSeabedBake, rememberOcean, seabedBakeKey, seabedBakeName, seabedBakeVariants, writeSeabedBake,
} from '@/lib/seabed-bake';
import { depthTexels, waterVertices } from '@/lib/seabed-depth';
import { bakedFile } from '@/test-support/seabed-bakes';

// The seabed built ahead of time (seabed-bake.ts): its files, and that a scene uses a bake when there is one and
// works things out when there isn't. (The seabed-bake-*.test.ts files check every bake is what the scene would work out.)
afterEach(() => clearSeabedBakes());
const kelp = [{ x: 0, z: 0, habitat: 'kelp' as const }];

test('a bake reads back exactly as written, from any offset (a Node Buffer from its pool, too)', () => {
  const lattice = { positions: [0.1, -2.5e-17, Math.PI, -0, 7, 1e300], indices: [0, 1, 2, 70000, 3, 4], terrain: 3 };
  const bytes = writeSeabedBake('key', { lattice, depth: Uint8Array.of(0, 255, 7), shoaling: Float32Array.of(.25, 1), bare: Float32Array.of(-1.5) });
  const shifted = new Uint8Array(bytes.length + 5);
  shifted.set(bytes, 5);
  const { key, bake } = readSeabedBake(Buffer.from(shifted.subarray(5)));
  expect(key).toBe('key');
  expect(bake.lattice!.positions.map((v) => Object.is(v, -0) ? '-0' : v)).toEqual([0.1, -2.5e-17, Math.PI, '-0', 7, 1e300]);
  expect(bake.lattice!.indices).toEqual(lattice.indices);
  expect(bake.lattice!.terrain).toBe(3);
  expect(Array.from(bake.depth!)).toEqual([0, 255, 7]);
  expect(Array.from(bake.shoaling!)).toEqual([.25, 1]);
  expect(Array.from(bake.bare!)).toEqual([-1.5]);
});

test('anything that is not a bake (or a bake of another version) is refused', () => {
  expect(() => readSeabedBake(new Uint8Array(40))).toThrow('Not a seabed bake');
  const bytes = writeSeabedBake('key', { depth: Uint8Array.of(1) });
  bytes[4] = 9;
  expect(() => readSeabedBake(bytes)).toThrow('version 9');
});

test('the baked files are named for the islands, levels and reaches they are for, and only those', () => {
  expect(seabedBakeName(1, [{ x: 0, z: 0, habitat: 'island' }])).toBe('reef-1');
  expect(seabedBakeName(6, kelp, OCEAN.waterExtent)).toBe('kelp-6');
  expect(seabedBakeName(3, [{ x: 0, z: 0, habitat: 'island' }], EXPLORER_REACH)).toBe('reef-3-explorer');
  // Another reach, another water (the same reef shape), several islands, an island elsewhere: no bake.
  expect(seabedBakeName(3, [{ x: 0, z: 0, habitat: 'island' }], { x: 40, z: 20 })).toBeNull();
  expect(seabedBakeName(3, [{ x: 0, z: 0, habitat: 'lagoon' }])).toBeNull();
  expect(seabedBakeName(3, [{ x: 0, z: 0, habitat: 'island' }, { x: -1.6, z: -24.8, habitat: 'kelp' }], EXPLORER_REACH)).toBeNull();
  expect(seabedBakeName(3, [{ x: 1, z: 0, habitat: 'island' }])).toBeNull();
  expect(seabedBakeName(7, kelp)).toBeNull();
  const names = seabedBakeVariants().map((v) => v.name);
  expect(new Set(names).size).toBe(names.length);
  for (const variant of seabedBakeVariants()) expect(seabedBakeName(variant.level, variant.islands, variant.reach)).toBe(variant.name);
});

test('with a bake registered, the scene uses it in place of working out each part; without, it works them out', () => {
  // A made-up bake, to see that what is registered is what is used.
  const lattice = { positions: [0, -1, 0, 1, -1, 0, 0, -1, 1], indices: [0, 1, 2], terrain: 0 };
  const depth = new Uint8Array(128 * 128 * 4).fill(9), shoaling = new Float32Array(10000).fill(.5);
  const key = registerSeabedBake(writeSeabedBake(seabedBakeKey(2, kelp), { lattice, depth, shoaling }));
  expect(hasSeabedBake(key)).toBe(true);
  expect(bakedLattice(2, kelp)).toEqual(lattice);
  expect(bakedLattice(2, kelp, OCEAN.waterExtent)).toEqual(lattice);
  expect(bakedLattice(2, kelp, EXPLORER_REACH)).toBeUndefined();
  expect(bakedLattice(3, kelp)).toBeUndefined();
  expect(createSeabedField(2, kelp).lattice()).toEqual(lattice);
  expect(Array.from(depthTexels(2, kelp).data.slice(0, 4))).toEqual([9, 9, 9, 9]);
  const water = waterVertices(2, kelp, () => ({ wet: 0 }), OCEAN, OCEAN.waterExtent);
  // (a baked shoaling of the wrong length is not this water's: worked out instead)
  expect(water.shoaling).not.toBe(shoaling);
  expect(bakedShoaling(2, kelp)).toEqual(shoaling);
  expect(bakedDepth(2, kelp)).toEqual(depth);
  clearSeabedBakes();
  expect(hasSeabedBake(key)).toBe(false);
  expect(bakedLattice(2, kelp)).toBeUndefined();
  expect(depthTexels(2, kelp).data[0]).not.toBe(9);
});

test('a baked depth map needs none of the reef’s coral heads worked out for it; an unbaked one does', () => {
  const reef = [{ x: 0, z: 0, habitat: 'island' as const }];
  const depth = new Uint8Array(128 * 128 * 4).fill(7);
  registerSeabedBake(writeSeabedBake(seabedBakeKey(2, reef), { depth }));
  const heads = jest.spyOn(reefCoast, 'coralHeads');
  try {
    expect(depthTexels(2, reef).data[0]).toBe(7);
    expect(heads).not.toHaveBeenCalled();
    clearSeabedBakes();
    expect(depthTexels(2, reef).data[0]).not.toBe(7);
    expect(heads).toHaveBeenCalled();
  } finally { heads.mockRestore(); }
});

test('a lone island’s animals swim over the baked grid: the same seabed as worked out', () => {
  // The Coral Reef at the first level worked out here, and from its bake in a fresh copy of the modules (nothing cached
  // there): seabed-bake-reef.test.ts has every number of the bake the same as worked out.
  const worked = createSeabed(1, 'reef');
  let baked: ReturnType<typeof createSeabed> | undefined, usedGrid = false;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fresh = require('@/lib/seabed-bake') as typeof import('@/lib/seabed-bake');
    fresh.registerSeabedBake(bakedFile('reef-1'));
    usedGrid = !!fresh.bakedGrid(1, [{ x: 0, z: 0, habitat: 'island' }]);
    baked = (require('@/lib/seabed') as typeof import('@/lib/seabed')).createSeabed(1, 'reef');
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  expect(usedGrid).toBe(true);
  for (const [x, z] of [[0, 0], [2.5, -1.2], [-4, 3.3], [6.1, 5.9], [-7.9, -7.9], [1.234, -5.678]]) {
    expect(baked!.floor(x, z)).toBe(worked.floor(x, z));
    expect(baked!.solid(x, z)).toBe(worked.solid(x, z));
    expect(baked!.ground(x, z)).toBe(worked.ground(x, z));
    expect(baked!.exact(x, z)).toBe(worked.exact(x, z));
  }
  expect(baked!.deepest).toBe(worked.deepest);
}, 60000);

test.each(['kelp', 'volcanic', 'mangrove', 'wreck'] as const)('the %s island’s animals swim over its baked grid too: the same seabed as worked out', (shape) => {
  const habitat = { kelp: 'kelp', volcanic: 'volcanic', mangrove: 'mangrove', wreck: 'wreck' }[shape] as 'kelp' | 'volcanic' | 'mangrove' | 'wreck';
  const worked = createSeabed(1, shape);
  let baked: ReturnType<typeof createSeabed> | undefined, usedGrid = false;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fresh = require('@/lib/seabed-bake') as typeof import('@/lib/seabed-bake');
    fresh.registerSeabedBake(bakedFile(`${shape}-1`));
    usedGrid = !!fresh.bakedGrid(1, [{ x: 0, z: 0, habitat }]);
    baked = (require('@/lib/seabed') as typeof import('@/lib/seabed')).createSeabed(1, shape);
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  expect(usedGrid).toBe(true);
  for (const [x, z] of [[0, 0], [2.5, -1.2], [-4, 3.3], [6.1, 5.9], [-7.9, -7.9], [1.234, -5.678]]) {
    expect(baked!.floor(x, z)).toBe(worked.floor(x, z));
    expect(baked!.solid(x, z)).toBe(worked.solid(x, z));
    expect(baked!.ground(x, z)).toBe(worked.ground(x, z));
  }
  expect(baked!.deepest).toBe(worked.deepest);
}, 60000);

test('a bake can say what it is for, and carry the region maps; it reads back exactly, and a file damaged or cut short is refused', () => {
  const lattice = { positions: [0.1, -2.5e-17, Math.PI, -0], indices: [0, 1, 2], terrain: 0 };
  const region = Uint8Array.of(255, 0, 0, 0, 128, 127, 0, 0), regionMore = new Uint8Array(8);
  const bytes = writeSeabedBake('key', { lattice, depth: new Uint8Array(8).fill(3), region, regionMore, shoaling: Float32Array.of(.5) }, 'version 7');
  const { key, meta, bake } = readSeabedBake(bytes);
  expect([key, meta]).toEqual(['key', 'version 7']);
  expect(Array.from(bake.region!)).toEqual(Array.from(region));
  expect(Array.from(bake.regionMore!)).toEqual(Array.from(regionMore));
  expect(bake.lattice!.positions.map((v) => (Object.is(v, -0) ? '-0' : v))).toEqual([0.1, -2.5e-17, Math.PI, '-0']);
  // (a file that says nothing of itself says nothing, as the shipped ones)
  expect(readSeabedBake(writeSeabedBake('key', { depth: Uint8Array.of(1) })).meta).toBeUndefined();
  // One number changed anywhere in the numbers, or the file cut short, and it is refused.
  // (anywhere in the numbers: the first and last of them, and between)
  const start = Math.ceil((12 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true)) / 8) * 8;
  for (const at of [start, start + 20, start + 50, bytes.length - 1]) {
    const damaged = Uint8Array.from(bytes);
    damaged[at] ^= 1;
    expect(() => readSeabedBake(damaged)).toThrow(/damaged/);
  }
  expect(() => readSeabedBake(bytes.subarray(0, bytes.length - 8))).toThrow(/damaged|runs past/);
  // (read from any offset: a Buffer from Node's pool, as a file's bytes may be)
  const shifted = new Uint8Array(bytes.length + 3);
  shifted.set(bytes, 3);
  expect(readSeabedBake(shifted.subarray(3)).meta).toBe('version 7');
});

test('the digest tells a changed, moved or missing word, and the same bytes anywhere in memory', () => {
  const bytes = Uint8Array.from({ length: 41 }, (_, i) => (i * 37 + 11) & 255);
  const digest = digestBytes(bytes);
  expect(digest).toMatch(/^[0-9a-f]{16}$/);
  const shifted = new Uint8Array(bytes.length + 1);
  shifted.set(bytes, 1);
  expect(digestBytes(shifted.subarray(1))).toBe(digest);
  const changed = Uint8Array.from(bytes); changed[40] ^= 4;
  const swapped = Uint8Array.from(bytes); [swapped[0], swapped[4]] = [swapped[4], swapped[0]];
  expect(new Set([digest, digestBytes(changed), digestBytes(swapped), digestBytes(bytes.subarray(0, 40))]).size).toBe(4);
});

test('an ocean worked out or read back is held in place of a bake for the islands, level and reach it is for, and the oldest few go', () => {
  const one = [{ x: 0, z: 0, habitat: 'kelp' as const }], two = [...one, { x: 3, z: 9, habitat: 'wreck' as const }];
  const lattice = { positions: [0, -1, 0], indices: [0, 0, 0], terrain: 0 }, depth = Uint8Array.of(1, 2, 3, 4), region = Uint8Array.of(9, 9, 9, 9), regionMore = new Uint8Array(4), shoaling = Float32Array.of(.25);
  const key = seabedBakeKey(2, two, EXPLORER_REACH);
  expect(hasOcean(key)).toBe(false);
  rememberOcean(key, { lattice, depth, region, regionMore, shoaling });
  expect(hasOcean(key)).toBe(true);
  expect(bakedLattice(2, two, EXPLORER_REACH)).toBe(lattice);
  expect(bakedShoaling(2, two, EXPLORER_REACH)).toBe(shoaling);
  // (the depth map and its regions do not depend on the reach; the lattice and water do)
  expect(bakedDepth(2, two)).toBe(depth);
  expect(bakedRegions(2, two)).toEqual({ region, regionMore });
  expect(bakedLattice(2, two, { x: 9, z: 9 })).toBeUndefined();
  expect(bakedLattice(3, two, EXPLORER_REACH)).toBeUndefined();
  expect(bakedDepth(2, one)).toBeUndefined();
  expect(bakedRegions(2, one)).toBeUndefined();
  // Only the last few are held, the one used longest ago going; using one keeps it.
  const later = Array.from({ length: KEPT_OCEANS }, (_, n) => seabedBakeKey(3 + n, two, EXPLORER_REACH));
  rememberOcean(later[0], { depth });
  expect(bakedDepth(2, two)).toBe(depth);
  for (const k of later.slice(1)) rememberOcean(k, { depth });
  expect(hasOcean(key)).toBe(true);
  expect(hasOcean(later[0])).toBe(false);
  clearSeabedBakes();
  expect(hasOcean(key)).toBe(false);
  expect(bakedLattice(2, two, EXPLORER_REACH)).toBeUndefined();
});

test('the region maps of a held ocean are used in place of working them out, and a depth map worked out for them is the same', () => {
  const two = [{ x: 0, z: 0, habitat: 'island' as const }, { x: 2.4, z: 12.4, habitat: 'mangrove' as const }];
  const worked = depthTexels(1, two);
  const region = Uint8Array.from(worked.region), regionMore = Uint8Array.from(worked.regionMore), data = Uint8Array.from(worked.data);
  clearSeabedBakes();
  // A made-up region map is what is used (the maps are not worked out again); the real one is what it was.
  const made = Uint8Array.from(region).fill(1);
  rememberOcean(seabedBakeKey(1, two, EXPLORER_REACH), { depth: data, region: made, regionMore });
  const held = depthTexels(1, two);
  expect(held.region).toBe(made);
  expect(held.data).toBe(data);
  clearSeabedBakes();
  rememberOcean(seabedBakeKey(1, two, EXPLORER_REACH), { depth: data, region, regionMore });
  const again = depthTexels(1, two);
  expect(again.region).toBe(region);
  expect(Array.from(again.region)).toEqual(Array.from(worked.region));
  expect(Array.from(again.regionMore)).toEqual(Array.from(worked.regionMore));
}, 60000);
