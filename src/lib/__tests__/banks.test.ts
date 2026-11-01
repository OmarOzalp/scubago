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

test('leaving out the shapes that cannot matter gives the very same depth, bit for bit, as working out every one', () => {
  let state = 4242;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const sets = [islands, islands.slice(0, 2), islands.slice(1, 4), [islands[0], islands[islands.length - 1]]];
  let compared = 0, onTheBank = 0;
  for (const set of sets) {
    const bank = archipelagoBank(set)!, xs = set.map((i) => i.x), zs = set.map((i) => i.z);
    const x0 = Math.min(...xs) - 20, x1 = Math.max(...xs) + 20, z0 = Math.min(...zs) - 20, z1 = Math.max(...zs) + 20;
    const points: [number, number][] = [];
    // A scan across everything the explorer shows, points anywhere in it, and some right on the cays, rocks and islands.
    for (let j = 0; j < 70; j++) for (let i = 0; i < 70; i++) points.push([x0 + (x1 - x0) * i / 69, z0 + (z1 - z0) * j / 69]);
    for (let k = 0; k < 1500; k++) points.push([x0 + (x1 - x0) * random(), z0 + (z1 - z0) * random()]);
    for (const thing of [...bank.cays, ...bank.rocks, ...bank.islands.map(([x, z]) => ({ x, z }))]) for (let k = 0; k < 8; k++) points.push([thing.x + (random() - .5) * 6, thing.z + (random() - .5) * 6]);
    for (const [x, z] of points) {
      const pruned = bankDepth(bank, x, z), every = bankDepth(bank, x, z, false);
      if (!Object.is(pruned, every)) throw new Error(`at (${x}, ${z}): ${pruned} but working out every shape gives ${every}`);
      compared++;
      if (every !== Infinity) onTheBank++;
    }
  }
  expect(compared).toBeGreaterThan(20000);
  // (the check is worth something: a good part of the points are on the bank, and a good part far off it)
  expect(onTheBank).toBeGreaterThan(compared * .1);
  expect(onTheBank).toBeLessThan(compared * .9);
});
