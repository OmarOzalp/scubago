import { expect, test } from '@jest/globals';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '../archipelago';
import { createShoreField, islandScale, islets, shapeFor, type IslandShape } from '../island-outline';
import { OCEAN } from '../ocean';
import { avoidShallows, createSeabed, createSeabedField, HABITATS, type OceanIsland } from '../seabed';
import { coralHeads } from '../reef-coast';
import { worldFor } from '../steering';
import { archipelago, drawnSeabed } from '../../test-support/swim-clearance';

const SHAPES: IslandShape[] = ['reef', 'kelp', 'volcanic', 'mangrove', 'wreck'];
/** Points over the ocean an island's animals are kept to, on a jittered grid (the same every time). */
function frameSamples(level: number) {
  const { x: wx, z: wz } = worldFor(level), points: [number, number][] = [];
  for (let i = 0; i < 28; i++) for (let j = 0; j < 24; j++) points.push([((i + .5) / 28 * 2 - 1) * wx * 1.1 + Math.sin(i * 7.1 + j) * .1, ((j + .5) / 24 * 2 - 1) * wz * 1.1 + Math.cos(j * 5.3 + i) * .1]);
  return points;
}

/**
 * How the baked grid the animals swim over compares with the seabed as drawn, over the water: how far under it it ever is, how far over
 * it half the points are, and how far over at the 95th percentile (`over`), and the same against the highest the drawing is within the
 * grid's reach of the point (`overReach`: each grid point holds the highest the drawing is within a tenth of a unit and a lookup blends
 * four of them, so it can be over a drawing by the slope times a fifth of a unit, which on the Coral Reef's outer wall is a good deal).
 */
function againstDrawing(level: number, shape: IslandShape, among?: Parameters<typeof createSeabed>[2]) {
  const seabed = createSeabed(level, shape, among), drawn = drawnSeabed(level, shape, among), gaps: number[] = [], pooled: number[] = [];
  for (const [x, z] of frameSamples(level)) {
    const height = drawn(x, z);
    // (under the island itself nothing is drawn)
    if (height < OCEAN.surfaceLevel - .02) {
      const ground = seabed.ground(x, z);
      gaps.push(ground - height);
      let highest = height;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) highest = Math.max(highest, drawn(x + i * .1, z + j * .1));
      pooled.push(ground - highest);
    }
  }
  gaps.sort((a, b) => a - b);
  pooled.sort((a, b) => a - b);
  return { under: -gaps[0], median: gaps[Math.floor(gaps.length / 2)], over: gaps[Math.floor(gaps.length * .95)], overReach: pooled[Math.floor(pooled.length * .95)], count: gaps.length };
}

test('the bottom the animals swim over is the seabed the water draws, triangle for triangle, at every island and level', () => {
  for (const shape of SHAPES) {
    for (const level of [1, 4, 6]) {
      const { under, median, over, overReach, count } = againstDrawing(level, shape);
      expect(count).toBeGreaterThan(400);
      // Never lower than what is drawn (a hair, for where the drawing is read between grid points) ...
      expect(under).toBeLessThan(.02);
      // ... and a little over it only where its slopes and ripples are: most of it within a few hundredths, nearly all within a tenth or two
      // (the Coral Reef's outer wall, which drops about two units in a fifth of one, is over by its slope times the grid's reach: it is
      // judged against the highest the drawing is within that reach, which it is never more than a hair over).
      expect(median).toBeLessThan(.08);
      if (shape !== 'reef') expect(over).toBeLessThan(.4);
      expect(overReach).toBeLessThan(.05);
    }
  }
});

test('at the Coral Reef\'s last levels the wall runs on round the islets\' reefs, and the seabed\'s rings follow it there too', () => {
  const deep = OCEAN.seabed.shelfFloor - OCEAN.seabed.floorDrop - OCEAN.reefCrest.drop;
  for (const level of [1, 3, 5, 6]) {
    // Each ring of the mesh is at one height round the island, give or take the crest's and the passes' own: neighbours along it never
    // differ by a drop down the wall (a ring that runs across the wall rather than along it is drawn as fins).
    const { positions } = createSeabedField(level, [{ x: 0, z: 0, habitat: 'island' }]).lattice(), rays = 96, rings = positions.length / 3 / rays;
    expect(Number.isInteger(rings)).toBe(true);
    let largest = 0;
    for (let k = 0; k < rings; k++) {
      for (let r = 0; r < rays; r++) {
        const a = (r * rings + k) * 3, b = (((r + 1) % rays) * rings + k) * 3;
        largest = Math.max(largest, Math.abs(positions[a + 1] - positions[b + 1]));
      }
    }
    expect(largest).toBeLessThan(.5);
  }
  for (const level of [5, 6]) {
    const seabed = createSeabed(level, 'reef'), scale = islandScale(level);
    for (const { position: [px, pz] } of islets(level, 'reef')) {
      // Out from the island's middle past each islet: its lagoon and crest as they were, a little under the surface, then the wall's deep floor, as past the main island's.
      const cx = px * scale, cz = pz * scale, r = Math.hypot(cx, cz), ux = cx / r, uz = cz / r;
      for (const d of [1.2, 1.6, 2]) expect(seabed.ground(cx + ux * d, cz + uz * d)).toBeGreaterThan(-.7);
      for (const d of [3.2, 3.6]) expect(seabed.ground(cx + ux * d, cz + uz * d)).toBeLessThan(deep + .06);
    }
  }
});

test('with several islands in one ocean the bank and the open sea between them shape the bottom under each island\'s animals, as drawn', () => {
  const islands: OceanIsland[] = (Object.keys(ISLAND_PLACES) as IslandId[]).map((id) => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] }));
  for (const level of [1]) {
    expect(createSeabedField(level, islands).bank).not.toBeNull();
    islands.forEach((island, index) => {
      const shape = shapeFor(island.habitat), reach = { x: 12, z: 9 };
      const { under, median, count } = againstDrawing(level, shape, { islands, index, reach });
      expect(count).toBeGreaterThan(400);
      expect(under).toBeLessThan(.02);
      expect(median).toBeLessThan(.12);
      // The bank only ever raises the bottom: between the islands it is not deeper than the island's own would be, and it is shallower somewhere.
      const alone = createSeabed(level, shape), among = createSeabed(level, shape, { islands, index, reach });
      let shallower = 0;
      for (const [x, z] of frameSamples(level)) if (among.ground(x, z) > alone.ground(x, z) + .05) shallower++;
      expect(shallower).toBeGreaterThan(0);
    });
  }
  // The water the explorer shows reaches farther across a wide screen: the open sea's floor under the animals follows.
  const phone = createSeabed(1, 'reef', { islands, index: 0, reach: 8.6 }), wide = createSeabed(1, 'reef', { islands, index: 0, reach: { x: 14, z: 9 } });
  expect(phone).not.toBe(wide);
});

test('the Coral Reef\'s coral heads and rocks stand on its bottom, and the bare ground is under them', () => {
  const seabed = createSeabed(3, 'reef');
  const tall = coralHeads(3).filter((head) => head.height > .1);
  expect(tall.length).toBeGreaterThan(3);
  let standing = 0;
  for (const head of tall) {
    expect(seabed.floor(head.x, head.z)).toBeGreaterThan(head.floor + head.height * .6);
    // (drawn a little over the shelf's formula here and there, a head may stand barely out of the sand)
    if (seabed.floor(head.x, head.z) > seabed.ground(head.x, head.z) + .02) standing++;
    // They are small things to swim over, not part of what a body must fit in.
    expect(seabed.solid(head.x, head.z)).toBeCloseTo(seabed.ground(head.x, head.z), 6);
  }
  expect(standing).toBeGreaterThan(tall.length / 2);
});

test('the Shipwreck\'s steamer is part of what a body must fit in', () => {
  const seabed = createSeabed(1, 'wreck');
  let steamer = 0;
  for (const [x, z] of frameSamples(1)) {
    expect(seabed.floor(x, z)).toBeGreaterThanOrEqual(seabed.solid(x, z));
    expect(seabed.solid(x, z)).toBeGreaterThanOrEqual(seabed.ground(x, z));
    if (seabed.solid(x, z) > seabed.ground(x, z) + .3) steamer++;
  }
  expect(steamer).toBeGreaterThan(0);
});

test('the bottom rises to the crest of the Coral Reef and never reaches the surface, and the shelf rises to the beach', () => {
  const seabed = createSeabed(1, 'reef'), field = createShoreField(1, 'reef');
  let highest = -Infinity, deepest = Infinity;
  for (const [x, z] of frameSamples(1)) {
    // (the beach itself is wet sand a little above the water, as far as the first tenths out)
    if (field.shore(x, z) <= .6) continue;
    highest = Math.max(highest, seabed.ground(x, z)); deepest = Math.min(deepest, seabed.ground(x, z));
  }
  expect(highest).toBeLessThan(OCEAN.surfaceLevel);
  expect(highest).toBeGreaterThan(OCEAN.surfaceLevel - .1);
  expect(deepest).toBeLessThan(-1.7);
});

test('a lone island is made for the habitat of its shape, whichever it is drawn with', () => {
  for (const shape of SHAPES) expect(shapeFor(HABITATS[shape])).toBe(shape);
  expect(archipelago('reef').islands[archipelago('reef').index].habitat).toBe('island');
});

test('water too shallow for a body counts as shore: the nearer of the land and the shallows, away from either', () => {
  const seabed = createSeabed(1, 'reef'), land = createShoreField(1, 'reef');
  // The beach and the crest are the shallows here: where the water is less than a hand deep.
  const blocked = seabed.distanceTo('crest', (x, z) => OCEAN.surfaceLevel - seabed.floor(x, z) < .15);
  expect(blocked(0, 3.9)).toBeLessThan(.6);
  expect(blocked(0, 5.2)).toBeGreaterThan(.5);
  const field = avoidShallows(land, blocked, 0), kept = avoidShallows(land, blocked, 1);
  // Beyond the reef the crest is nearer than the land, and out to sea is away from it, so steering along the coast follows the reef.
  const out = field.island(0, 5.2), wasOut = land.island(0, 5.2);
  expect(out.distance).toBeLessThan(wasOut.distance);
  expect(out.distance).toBeCloseTo(blocked(0, 5.2), 1);
  expect(out.nz).toBeGreaterThan(.5);
  // They count `offset` units nearer than they are: an animal that keeps its distance from the land keeps that much less from them.
  expect(kept.island(0, 5.2).distance).toBeCloseTo(out.distance + 1, 1);
  // With nowhere blocked, the field is the land's.
  const free = avoidShallows(land, seabed.distanceTo('free', () => false), 0);
  for (const [x, z] of [[0, 4], [3, 1], [-2, -3]]) expect(free.island(x, z).distance).toBeCloseTo(land.island(x, z).distance, 6);
  // A body that fits nowhere (bigger than any water there is): nowhere is blocked.
  expect(seabed.distanceTo('nowhere', () => true)(0, 0)).toBeGreaterThan(100);
});
