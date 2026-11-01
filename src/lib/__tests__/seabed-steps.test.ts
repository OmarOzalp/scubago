import { afterEach, expect, test } from '@jest/globals';
import { OCEAN } from '@/lib/ocean';
import { createSeabedField, type OceanIsland } from '@/lib/seabed';
import { clearSeabedBakes } from '@/lib/seabed-bake';
import { depthTexels, depthTexelSteps, waterVertices, waterVertexSteps } from '@/lib/seabed-depth';
import { finish, runSliced } from '@/lib/slices';

// The ocean's maths in steps (slices.ts): worked out a slice at a time it is the very same numbers as worked out at once, and the
// pieces are small enough to give the thread back between.
afterEach(() => clearSeabedBakes());
const islands: OceanIsland[] = [{ x: 0, z: 0, habitat: 'island' }, { x: 2.4, z: 12.4, habitat: 'mangrove' }];
const reach = { x: 12, z: 12 };
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  expect(a.length).toBe(b.length);
  // (Object.is: the very same number, -0 and NaN included)
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) throw new Error(`[${i}]: ${a[i]} and ${b[i]}`);
};

test('worked out a step at a time, the depth map, seabed lattice and water are the same numbers as worked out at once', async () => {
  const atOnce = depthTexels(2, islands);
  const lattice = createSeabedField(2, islands).lattice(reach);
  const water = waterVertices(2, islands, atOnce.profile, OCEAN, reach);
  const copy = {
    data: Uint8Array.from(atOnce.data), region: Uint8Array.from(atOnce.region), regionMore: Uint8Array.from(atOnce.regionMore),
    positions: [...lattice.positions], indices: [...lattice.indices], terrain: lattice.terrain,
    waterPositions: [...water.positions], shoaling: [...water.shoaling], waterIndices: [...water.indices],
  };
  clearSeabedBakes();

  let slices = 0;
  const pacing = { slice: 0, pause: async () => { slices++; } };
  // (the same ocean as another object, so that nothing kept from the first is handed back)
  const other = { ...OCEAN };
  const texels = await runSliced(depthTexelSteps(2, islands, other), pacing);
  expect(texels).not.toBe(atOnce);
  same(texels.data, copy.data); same(texels.region, copy.region); same(texels.regionMore, copy.regionMore);
  const afterTexels = slices;
  const stepped = await runSliced(createSeabedField(2, islands, other).latticeSteps(reach), pacing);
  same(stepped.positions, copy.positions); same(stepped.indices, copy.indices);
  expect(stepped.terrain).toBe(copy.terrain);
  const afterLattice = slices;
  const wet = await runSliced(waterVertexSteps(2, islands, texels.profile, other, reach), pacing);
  same(wet.positions, copy.waterPositions); same(wet.shoaling, copy.shoaling); same(wet.indices, copy.waterIndices);
  // (each is many small steps, not one big one: a texel row, a ray, a row of the water)
  expect(afterTexels).toBeGreaterThan(100);
  expect(afterLattice - afterTexels).toBeGreaterThan(100);
  expect(slices - afterLattice).toBeGreaterThan(20);
}, 60000);

test('what steps work out is kept as what is worked out at once is: asked for again, it is the same, and the plain calls find it', async () => {
  const texels = await runSliced(depthTexelSteps(1, islands), { slice: 1e9 });
  expect(depthTexels(1, islands)).toBe(texels);
  expect(finish(depthTexelSteps(1, islands))).toBe(texels);
  const field = createSeabedField(1, islands);
  const lattice = await runSliced(field.latticeSteps(reach), { slice: 1e9 });
  expect(field.lattice(reach)).toBe(lattice);
  const water = await runSliced(waterVertexSteps(1, islands, texels.profile, OCEAN, reach), { slice: 1e9 });
  expect(waterVertices(1, islands, texels.profile, OCEAN, reach)).toBe(water);
}, 60000);
