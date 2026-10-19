import { expect, test } from '@jest/globals';
import { foundIslands, HOME_ISLAND, islandOf, islandResidents } from '../archipelago';
import { shoreDistance, shorePolygons } from '../island-outline';
import { KELP, kelpPlants } from '../kelp';
import { OCEAN, seabedProfile, shelfStretch } from '../ocean';
import type { DexEntry, Species } from '../types';

test('kelp grows on the reef around the island, from the holdfast on the seabed up to the surface', () => {
  for (const level of [1, 4, 6]) {
    const polygons = shorePolygons(level), plants = kelpPlants(level);
    expect(plants.length).toBeGreaterThan(40);
    expect(plants.length).toBeLessThanOrEqual(KELP.plants.full);
    for (const p of plants) {
      const distance = shoreDistance(polygons, p.x, p.z);
      expect(distance).toBeGreaterThanOrEqual(KELP.band[0]);
      expect(distance).toBeLessThanOrEqual(KELP.band[1]);
      // Its holdfast on the seabed's floor there, its top at the surface.
      expect(p.floor).toBeCloseTo(seabedProfile(distance / shelfStretch(p.x, p.z)).floor, 5);
      expect(p.height).toBeCloseTo(OCEAN.surfaceLevel - p.floor, 5);
      expect(p.height).toBeGreaterThan(.3);
      expect(Math.hypot(p.dx, p.dz)).toBeCloseTo(1, 5);
      expect(p.stipes).toBeGreaterThanOrEqual(KELP.stipes[0]);
      expect(p.stipes).toBeLessThanOrEqual(KELP.stipes[1]);
    }
  }
});

test('the kelp grows in beds with open channels between them, the same every time; lite keeps some of the same plants', () => {
  const plants = kelpPlants(3), polygons = shorePolygons(3);
  expect(kelpPlants(3)).toBe(plants);
  // Beds: most plants have a neighbour close by.
  const crowded = plants.filter((p) => plants.some((q) => q !== p && Math.hypot(p.x - q.x, p.z - q.z) < .5)).length;
  expect(crowded / plants.length).toBeGreaterThan(.8);
  // Channels: plenty of the reef band has no kelp nearby.
  let open = 0, samples = 0;
  for (let a = 0; a < 64; a++) {
    for (const out of [.8, 1.4, 2]) {
      // Walk out from the middle until this far off the shore.
      let r = 1, x = 0, z = 0;
      for (; r < 6; r += .05) { x = Math.cos(a / 64 * Math.PI * 2) * r; z = Math.sin(a / 64 * Math.PI * 2) * r; if (shoreDistance(polygons, x, z) >= out) break; }
      samples++;
      if (!plants.some((p) => Math.hypot(p.x - x, p.z - z) < .45)) open++;
    }
  }
  expect(open / samples).toBeGreaterThan(.3);
  const lite = kelpPlants(3, KELP.plants.lite);
  expect(lite.length).toBe(KELP.plants.lite);
  expect(lite.every((p) => plants.some((q) => q.x === p.x && q.z === p.z))).toBe(true);
});

const entry = (id: string, firstSeenOn: string): DexEntry => ({
  species: { id, commonName: id, scientificName: id, category: 'fish', rarity: 'common', blurb: '' } as Species,
  count: 1, firstSeenOn, lastSeenOn: firstSeenOn, sites: [],
} as unknown as DexEntry);

test("each species swims at its own area's island, or at Home's while its area has none", () => {
  expect(islandOf('garibaldi')).toBe('kelp-forest');
  expect(islandOf('sea-otter')).toBe('kelp-forest');
  expect(islandOf('reef-manta')).toBe('coral-reef');
  // The Open Ocean has no island (it is the deep blue around them all), nor yet do the others.
  expect(islandOf('humpback-whale')).toBe(HOME_ISLAND);
  expect(islandOf('dugong')).toBe(HOME_ISLAND);
  expect(islandOf('not-a-species')).toBe(HOME_ISLAND);
});

test("Home's island is always there; the Kelp Forest's rises with its first species", () => {
  const whale = entry('humpback-whale', '2026-01-02'), otter = entry('sea-otter', '2026-02-03'), manta = entry('reef-manta', '2026-03-04');
  expect(foundIslands([])).toEqual([HOME_ISLAND]);
  expect(foundIslands([whale])).toEqual([HOME_ISLAND]);
  expect(foundIslands([whale, otter, manta])).toEqual([HOME_ISLAND, 'kelp-forest']);
  expect(islandResidents([whale, otter, manta], 'kelp-forest')).toEqual([otter]);
  expect(islandResidents([whale, otter, manta], HOME_ISLAND)).toEqual([whale, manta]);
});
