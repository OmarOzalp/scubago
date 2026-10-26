import { afterEach, expect, jest, test } from '@jest/globals';
import { OCEAN } from '@/lib/ocean';
import { createSeabed, createSeabedField } from '@/lib/seabed';
import {
  bakedDepth, bakedLattice, bakedShoaling, clearSeabedBakes, EXPLORER_REACH, hasSeabedBake, readSeabedBake, registerSeabedBake,
  seabedBakeKey, seabedBakeName, seabedBakeVariants, writeSeabedBake,
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
