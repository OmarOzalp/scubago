import { expect, test } from '@jest/globals';
import { createShoreField, shoreDistance, shoreDistanceByEdges, shorePolygons, type IslandShape } from '../island-outline';

const SHAPES: IslandShape[] = ['reef', 'kelp', 'volcanic', 'mangrove', 'wreck'];

// (a small fixed generator, so a failure is the same failure every time)
function generator(seed: number) {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

test('the quick shoreDistance gives the very same number, bit for bit, as walking every edge, for every shape and level', () => {
  const random = generator(12345);
  let compared = 0;
  for (const level of [1, 2, 3, 4, 5, 6]) {
    for (const shape of SHAPES) {
      const polygons = shorePolygons(level, 24, shape);
      const points: number[] = [];
      // A scan across the whole ocean row by row (as the depth map asks), then points anywhere in it...
      for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) points.push(-9 + i * .45 + .013, -9 + j * .45 - .007);
      for (let k = 0; k < 400; k++) points.push((random() - .5) * 24, (random() - .5) * 24);
      // ...and the hard ones: on every corner of every shoreline, a hair either side of it, and level with it (a row exactly on a corner's height).
      for (const polygon of polygons) {
        for (let k = 0; k < polygon.length; k += 2) {
          const x = polygon[k], z = polygon[k + 1];
          points.push(x, z, x + 1e-9, z, x - 1e-9, z, x, z + 1e-9, x, z - 1e-9, x + 3, z, x - 3, z, x + .2 * random(), z - .2 * random());
        }
      }
      for (let k = 0; k < points.length; k += 2) {
        const quick = shoreDistance(polygons, points[k], points[k + 1]), plain = shoreDistanceByEdges(polygons, points[k], points[k + 1]);
        if (!Object.is(quick, plain)) throw new Error(`${shape} level ${level} at (${points[k]}, ${points[k + 1]}): ${quick} but every edge gives ${plain}`);
        compared++;
      }
      // Each shoreline asked about alone and several together (the islets with the island, the island without them).
      for (let k = 0; k < 200; k += 2) {
        for (const some of [polygons.slice(0, 1), polygons.slice(1), [...polygons].reverse()]) {
          expect(Object.is(shoreDistance(some, points[k], points[k + 1]), shoreDistanceByEdges(some, points[k], points[k + 1]))).toBe(true);
        }
      }
    }
  }
  expect(compared).toBeGreaterThan(100000);
});

test('a shoreline is made once for each island, level and number of divisions, in a list of the caller’s own', () => {
  const first = shorePolygons(3, 24, 'kelp'), again = shorePolygons(3, 24, 'kelp');
  expect(again).not.toBe(first);
  expect(again.length).toBe(first.length);
  first.forEach((polygon, i) => expect(again[i]).toBe(polygon));
  // A caller may reorder or cut down its list without changing what the next gets.
  first.reverse(); first.length = 0;
  expect(shorePolygons(3, 24, 'kelp').length).toBe(again.length);
  expect(shorePolygons(3, 24, 'kelp')[0]).toBe(again[0]);
  // Another island, level or division count is another shoreline.
  expect(shorePolygons(3, 24, 'reef')[0]).not.toBe(again[0]);
  expect(shorePolygons(4, 24, 'kelp')[0]).not.toBe(again[0]);
  expect(shorePolygons(3, 12, 'kelp')[0].length).toBeLessThan(again[0].length);
  // The islets rise from level 5.
  expect(shorePolygons(4, 24, 'wreck').length).toBe(1);
  expect(shorePolygons(5, 24, 'wreck').length).toBe(2);
  expect(shorePolygons(6, 24, 'wreck').length).toBe(3);
});

test('it tells land from water: negative inside a shoreline, positive outside, nothing at all of no shorelines', () => {
  for (const shape of SHAPES) {
    const [main] = shorePolygons(1, 24, shape);
    expect(shoreDistance([main], 40, 40)).toBeGreaterThan(30);
    expect(shoreDistance([], 0, 0)).toBe(Infinity);
  }
  // The middle of the Coral Reef's island is land, the far side of the sea is not.
  expect(shoreDistance(shorePolygons(1, 24, 'reef'), 0, 0)).toBeLessThan(-.5);
});

test('a point that is not a finite number is answered as the plain walk answers it', () => {
  const polygons = shorePolygons(6, 24, 'reef');
  for (const [x, z] of [[NaN, 0], [0, NaN], [Infinity, 0], [0, -Infinity], [NaN, NaN]]) {
    expect(Object.is(shoreDistance(polygons, x, z), shoreDistanceByEdges(polygons, x, z))).toBe(true);
  }
});

test('questions of the same shorelines in any order give the same answers (it keeps only a hint between them)', () => {
  const polygons = shorePolygons(6, 24, 'kelp'), random = generator(99);
  const points = Array.from({ length: 300 }, () => [(random() - .5) * 16, (random() - .5) * 16] as const);
  const forward = points.map(([x, z]) => shoreDistance(polygons, x, z));
  const backward = [...points].reverse().map(([x, z]) => shoreDistance(polygons, x, z)).reverse();
  expect(backward).toEqual(forward);
  expect(forward).toEqual(points.map(([x, z]) => shoreDistanceByEdges(polygons, x, z)));
});

test('the steering field is a grid of the plain distances', () => {
  // (before the islets rise, at the grid's own nodes, which hold shoreDistance of the coarser outline)
  const step = 13 / 72, extent = 94 * step / 2;
  for (const shape of SHAPES) {
    const field = createShoreField(3, shape), [main] = shorePolygons(3, 12, shape);
    for (const [i, j] of [[47, 47], [60, 30], [20, 70], [47, 52], [41, 47]]) {
      const x = -extent + i * step, z = -extent + j * step;
      expect(field.shore(x, z)).toBeCloseTo(shoreDistanceByEdges([main], x, z), 4);
    }
  }
});
