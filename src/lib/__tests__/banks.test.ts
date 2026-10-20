import { expect, test } from '@jest/globals';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '../archipelago';
import { archipelagoBank, bankDepth } from '../banks';
import { shapeFor, shoreDistance, shorePolygons } from '../island-outline';
import { oceanScale, WORLD } from '../steering';

const islands = (Object.keys(ISLAND_PLACES) as IslandId[]).map((id) => ({ id, x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1] }));

test('the islands stand in a chain on one shallow bank, the open ocean off its edges; one island alone has none', () => {
  expect(archipelagoBank([{ x: 0, z: 0 }])).toBeNull();
  const bank = archipelagoBank(islands)!;
  expect(archipelagoBank(islands)).toEqual(bank);
  const chain = [...islands].sort((a, b) => a.z - b.z);
  for (let i = 0; i < chain.length - 1; i++) {
    // Midway between neighbours: shallow water over the bank.
    const depth = bankDepth(bank, (chain[i].x + chain[i + 1].x) / 2, (chain[i].z + chain[i + 1].z) / 2);
    expect(depth).toBeGreaterThan(.1);
    expect(depth).toBeLessThan(2);
  }
  // Well off to the side, no bank at all.
  for (const island of islands) expect(bankDepth(bank, island.x + 12, island.z)).toBe(Infinity);
});

test('its cays break the surface in sandy shallows, and every cay and rock keeps out of every island\'s animals\' water', () => {
  const bank = archipelagoBank(islands)!;
  expect(bank.cays.length).toBeGreaterThan(2);
  expect(bank.sandbars.length).toBe(2 * (islands.length - 1));
  const s = oceanScale(6);
  for (const cay of bank.cays) {
    expect(bankDepth(bank, cay.x, cay.z)).toBeLessThan(0);
    expect(bankDepth(bank, cay.x + cay.radius * 1.3, cay.z)).toBeLessThan(.6);
  }
  for (const thing of [...bank.cays, ...bank.rocks]) {
    for (const island of islands) {
      const dx = Math.abs(thing.x - island.x), dz = Math.abs(thing.z - island.z);
      // Outside its swimming area at the last level, and nowhere near its land or islets.
      expect(dx >= WORLD.x * s || dz >= WORLD.z * s).toBe(true);
      expect(shoreDistance(shorePolygons(6, 24, shapeFor(ISLANDS[island.id])), thing.x - island.x, thing.z - island.z)).toBeGreaterThan(1);
    }
  }
});
