import { afterEach, expect, test } from '@jest/globals';
import { OCEAN } from '@/lib/ocean';
import { clearSeabedBakes, EXPLORER_REACH } from '@/lib/seabed-bake';
import { depthTexels, KEPT_MAPS, waterVertices } from '@/lib/seabed-depth';

// The depth map and the water lattice are kept for the last few islands, levels and reaches (the explorer closed and opened again costs seconds on a phone
// otherwise), and handed out again as they were.
afterEach(() => clearSeabedBakes());
const wreck = [{ x: 0, z: 0, habitat: 'wreck' as const }], volcanic = [{ x: 0, z: 0, habitat: 'volcanic' as const }];
const flat = () => ({ wet: 0 });

test('the same islands at the same level give the same depth map again, not another to work out', () => {
  const first = depthTexels(1, wreck);
  expect(depthTexels(1, wreck)).toBe(first);
  // (the islands by their places and kinds, not by the array that holds them)
  expect(depthTexels(1, [{ ...wreck[0] }])).toBe(first);
  expect(depthTexels(2, wreck)).not.toBe(first);
  expect(depthTexels(1, volcanic)).not.toBe(first);
  expect(depthTexels(1, [{ x: 3, z: 0, habitat: 'wreck' as const }])).not.toBe(first);
});

test('what is kept is what would be worked out: the same bytes', () => {
  const kept = depthTexels(2, wreck);
  const keptCopy = { data: Uint8Array.from(kept.data), region: Uint8Array.from(kept.region), regionMore: Uint8Array.from(kept.regionMore) };
  clearSeabedBakes();
  const fresh = depthTexels(2, wreck);
  expect(fresh).not.toBe(kept);
  expect(fresh.data).toEqual(keptCopy.data);
  expect(fresh.region).toEqual(keptCopy.region);
  expect(fresh.regionMore).toEqual(keptCopy.regionMore);
});

test('only the last few are kept, the one used longest ago going first', () => {
  // (one island's maps are small: a set for each of Home's five islands and a few levels more are kept)
  const sets = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ level: 1 + (n % 6), islands: [{ x: n > 6 ? 1 : 0, z: 0, habitat: 'wreck' as const }] }));
  const made = sets.map(({ level, islands }) => depthTexels(level, islands));
  expect(new Set(made).size).toBe(KEPT_MAPS);
  // (using the first again makes the second the one that has been unused longest)
  expect(depthTexels(sets[0].level, sets[0].islands)).toBe(made[0]);
  depthTexels(1, [{ x: 2, z: 0, habitat: 'wreck' as const }]);
  expect(depthTexels(sets[0].level, sets[0].islands)).toBe(made[0]);
  expect(depthTexels(sets[2].level, sets[2].islands)).toBe(made[2]);
  expect(depthTexels(sets[1].level, sets[1].islands)).not.toBe(made[1]);
});

test('another ocean’s depth map is worked out each time, and nothing kept survives the bakes being cleared', () => {
  const custom = { ...OCEAN };
  expect(depthTexels(1, wreck, custom)).not.toBe(depthTexels(1, wreck, custom));
  const kept = depthTexels(1, wreck);
  clearSeabedBakes();
  expect(depthTexels(1, wreck)).not.toBe(kept);
});

test('the water lattice of a depth map is kept for each reach of water, and for that depth map’s own seabed only', () => {
  const texels = depthTexels(1, wreck);
  const usual = waterVertices(1, wreck, texels.profile, OCEAN, OCEAN.waterExtent);
  expect(waterVertices(1, wreck, texels.profile, OCEAN, OCEAN.waterExtent)).toBe(usual);
  expect(usual.positions.length).toBeGreaterThan(1000);
  expect(usual.shoaling.length).toBe(usual.positions.length / 3);
  // Another reach is another lattice, and the first is still there.
  const wide = waterVertices(1, wreck, texels.profile, OCEAN, EXPLORER_REACH);
  expect(wide).not.toBe(usual);
  expect(wide.positions.length).toBeGreaterThan(usual.positions.length);
  expect(waterVertices(1, wreck, texels.profile, OCEAN, EXPLORER_REACH)).toBe(wide);
  expect(waterVertices(1, wreck, texels.profile, OCEAN, OCEAN.waterExtent)).toBe(usual);
  // A different seabed under the same islands, level and reach is not answered with this one's.
  const flatWater = waterVertices(1, wreck, flat, OCEAN, OCEAN.waterExtent);
  expect(flatWater).not.toBe(usual);
  expect(Math.max(...flatWater.shoaling)).toBe(0);
  expect(Math.max(...usual.shoaling)).toBeGreaterThan(0);
  // Another ocean's is worked out each time.
  expect(waterVertices(1, wreck, texels.profile, { ...OCEAN }, OCEAN.waterExtent)).not.toBe(waterVertices(1, wreck, texels.profile, { ...OCEAN }, OCEAN.waterExtent));
  // And nothing kept survives the bakes being cleared.
  clearSeabedBakes();
  expect(waterVertices(1, wreck, texels.profile, OCEAN, OCEAN.waterExtent)).not.toBe(usual);
});
