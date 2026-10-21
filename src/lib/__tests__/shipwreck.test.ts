import { expect, test } from '@jest/globals';
import { islandOf, ISLAND_PLACES, ISLANDS, residentsOf } from '../archipelago';
import { shapeFor, shoreDistance, shorePolygons } from '../island-outline';
import { GROUP_SIZES, GROUP_STYLES } from '../marine-groups';
import { MOVEMENT } from '../marine-motion';
import { OCEAN } from '../ocean';
import { marineModelFor } from '../swimming';
import { alongWreck, WRECK } from '../wreck';

const NEW = ['sand-tiger-shark', 'loggerhead-turtle', 'goliath-grouper', 'lionfish'] as const;

test('the Shipwreck has an island of its own at the chain\'s southern end, and its animals live there', () => {
  expect(ISLANDS.shipwreck).toBe('wreck');
  expect(shapeFor(ISLANDS.shipwreck)).toBe('wreck');
  const south = Math.max(...Object.values(ISLAND_PLACES).map(([, z]) => z));
  expect(ISLAND_PLACES.shipwreck[1]).toBe(south);
  for (const id of [...NEW, 'giant-grouper', 'great-barracuda', 'green-moray', 'circular-batfish']) {
    expect(residentsOf('shipwreck')).toContain(id);
    expect(islandOf(id)).toBe('shipwreck');
  }
  for (const id of NEW) expect(marineModelFor({ id, category: 'fish' })).toBe(id);
  // Their fellow species swim as them: the giant grouper as the goliath, the circular batfish as the longfin, the green moray as the giant moray.
  expect(marineModelFor({ id: 'giant-grouper', category: 'fish' })).toBe('goliath-grouper');
  expect(marineModelFor({ id: 'circular-batfish', category: 'fish' })).toBe('batfish');
  expect(marineModelFor({ id: 'green-moray', category: 'fish' })).toBe('giant-moray');
});

test('the cay is a crescent round a bight, and the wreck lies in it: her bow aground by the shore, her stern out in deeper water', () => {
  const [main] = shorePolygons(1, 24, 'wreck');
  // The bight: water, with the cay's shore to the north and both arms reaching down either side of it.
  expect(shoreDistance([main], 0, .65)).toBeGreaterThan(0);
  for (const [x, z] of [[0, -.25], [-1.75, .65], [1.75, .55]]) expect(shoreDistance([main], x, z)).toBeLessThan(0);
  // The island's middle is on the sand.
  expect(shoreDistance([main], 0, 0)).toBeLessThan(0);
  // She lies in the water all along her keel.
  for (let t = 0; t <= 1; t += .1) {
    const { x, z } = alongWreck(t);
    expect(shoreDistance([main], x, z)).toBeGreaterThan(0);
  }
  const bow = alongWreck(1), stern = alongWreck(0);
  expect(shoreDistance([main], bow.x, bow.z)).toBeLessThan(.4);
  expect(shoreDistance([main], stern.x, stern.z)).toBeGreaterThan(.7);
  // Her bow stands out of the water, her stern's deck lies under it, her keel deep under both.
  expect(bow.y + WRECK.depth + WRECK.sheer).toBeGreaterThan(OCEAN.surfaceLevel);
  expect(stern.y + WRECK.depth - WRECK.broken.drop).toBeLessThan(OCEAN.surfaceLevel);
  expect(stern.y).toBeLessThan(bow.y);
});

test('the Shipwreck\'s animals swim as they do round a wreck', () => {
  // The sand tiger and the goliath grouper hang almost still; the lionfish hovers; the batfish school.
  const tiger = MOVEMENT['sand-tiger-shark'], grouper = MOVEMENT['goliath-grouper'], lionfish = MOVEMENT.lionfish;
  expect(tiger.cruise).toBeLessThan(.25);
  expect(tiger.pause!.hold).toBeGreaterThanOrEqual(8);
  expect(grouper.cruise).toBeLessThan(tiger.cruise);
  expect(grouper.roam[1]).toBeLessThan(.5);
  expect(lionfish.cruise).toBeLessThan(.1);
  expect(GROUP_SIZES['circular-batfish'][0]).toBeGreaterThan(2);
  expect(GROUP_STYLES.batfish).toBeDefined();
  // The loggerhead swims heavier than the green turtle.
  expect(MOVEMENT['loggerhead-turtle'].cruise).toBeLessThan(MOVEMENT['green-turtle'].cruise);
});
