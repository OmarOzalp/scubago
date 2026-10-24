/** Build the real ocean meshes and depth map for every level and check their budgets and shape. */
import assert from 'node:assert/strict';
import {
  buildDepthField, buildLiteOceanMap, createLiteOceanMesh, createOceanUniforms, createSeabedMesh, createWaterMesh, waterColorAt,
} from '../src/components/home/three/ocean-mesh.ts';
import { OCEAN, reefCrestAt, shelfStretch } from '../src/lib/ocean.ts';
import { shoreDistance, shorePolygons } from '../src/components/home/three/island-shape.ts';
import { ISLAND_PLACES } from '../src/lib/archipelago.ts';
import { bankDepth } from '../src/lib/banks.ts';
import { EXPLORER } from '../src/lib/explorer-view.ts';

/** A texel of one of a depth field's maps at a point in the world (RGBA bytes). */
const sampler = (field, data) => (x, z) => {
  const i = Math.floor((x - field.area.x0) / field.area.width * field.columns), j = Math.floor((z - field.area.z0) / field.area.depth * field.rows);
  return data.slice((j * field.columns + i) * 4, (j * field.columns + i) * 4 + 4);
};

const uniforms = createOceanUniforms('island');
for (let level = 1; level <= 6; level++) {
  const field = buildDepthField(level);
  const water = createWaterMesh(uniforms, field), seabed = createSeabedMesh(uniforms, field);
  for (const mesh of [water, seabed]) {
    const vertices = mesh.geometry.attributes.position.count, triangles = mesh.geometry.index.count / 3;
    assert(vertices < 3000, `level ${level}: ${mesh.name} has ${vertices} vertices`);
    // (the Coral Reef's seabed has rings of its own to pick out its crest)
    assert(triangles < 6000, `level ${level}: ${mesh.name} has ${triangles} triangles`);
    assert(mesh.geometry.index.array instanceof Uint16Array);
    for (const value of mesh.geometry.attributes.position.array) assert(Number.isFinite(value));
  }
  // Waves flatten over the beach and the Coral Reef's crest, and reach full height over open water.
  const position = water.geometry.attributes.position, shoaling = water.geometry.attributes.aShoaling;
  const reach = (x, z) => { const d = shoreDistance(field.polygons, x, z); return d > 0 ? d / shelfStretch(x, z) : d; };
  const crest = (x, z) => reefCrestAt(x, z, reach(x, z)).coral;
  let calmed = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i), distance = shoreDistance(field.polygons, x, z), value = shoaling.getX(i);
    assert(value >= 0 && value <= 1);
    if (distance < 0) assert.equal(value, 0, `level ${level}: waves over dry land`);
    if (distance > 1.6 && crest(x, z) === 0 && field.profile(x, z).wet > OCEAN.waveShoaling) assert.equal(value, 1, `level ${level}: open water is flattened`);
    if (crest(x, z) > .5 && field.profile(x, z).wet < .1) { assert(value < .6, `level ${level}: full waves over the reef crest`); calmed++; }
  }
  assert(calmed > 20, `level ${level}: no waves calmed by the reef crest (${calmed})`);
  // Offshore, the seabed stays under water, and well under it past the shelf, but for the reef's crest
  // rising almost to the surface (never through it).
  const floor = seabed.geometry.attributes.position;
  let shoal = 0;
  for (let i = 0; i < floor.count; i++) {
    const x = floor.getX(i), z = floor.getZ(i), distance = shoreDistance(field.polygons, x, z), surface = uniforms.uOceanSurface.value;
    if (distance > .3) assert(floor.getY(i) < surface - (distance > .8 ? .02 : 0), `level ${level}: seabed above water ${distance.toFixed(2)} offshore`);
    if (distance > .8 && crest(x, z) === 0 && reach(x, z) < 1.25) assert(floor.getY(i) < surface - .3, `level ${level}: lagoon too shallow ${distance.toFixed(2)} offshore`);
    if (distance > 1 && floor.getY(i) > surface - .08) shoal++;
  }
  assert(shoal > 20, `level ${level}: no reef crest under the surface (${shoal})`);
  // Depth map: dry land at the center, shallows near the coast, deep water far out.
  const { data } = field.texture.image;
  const texel = sampler(field, data);
  const [landDepth, landHeight] = texel(0, 0), [openDepth] = texel(7.5, 0);
  assert.equal(landDepth, 0); assert(landHeight > 0);
  assert(openDepth > 200, `level ${level}: open water too shallow (${openDepth})`);
  // The coral channel: the swell breaks on the crest (surf past .5), nowhere on the beach or in the open sea.
  let surf = 0;
  for (let k = 3; k < data.length; k += 4) if (data[k] > 140) surf++;
  assert(surf > 30, `level ${level}: no surf on the reef crest (${surf})`);
  assert(texel(0, 0)[3] === 0 && texel(7.5, 0)[3] === 0, `level ${level}: coral on dry land or in the open sea`);
  // Lite tier: one opaque backdrop over the same lattice, colored from a baked map.
  const lite = createLiteOceanMesh(uniforms, field), map = buildLiteOceanMap(field);
  assert.equal(lite.geometry.attributes.position.count, position.count);
  assert.equal(lite.material.depthTest, false);
  assert.equal(lite.material.transparent, false);
  const baked = sampler(field, map.image.data);
  const [, , , landAlpha] = baked(0, 0), deepWater = baked(7.5, 0), shelf = baked(2.6, .3);
  assert.equal(landAlpha, 0, `level ${level}: lite surface over dry land`);
  assert(Math.abs(deepWater[3] - 255 * OCEAN.opacity.deep) <= 2, `level ${level}: lite open-water opacity ${deepWater[3]}`);
  assert(shelf[0] + shelf[1] + shelf[2] > deepWater[0] + deepWater[1] + deepWater[2] + 60, `level ${level}: lite shallows not brighter than open water`);
  assert(deepWater[2] > deepWater[0] + 40, `level ${level}: lite open water is not blue-teal`);
  console.log(`level ${level}: water ${position.count} vertices, seabed ${floor.count} vertices; depth map, shoaling and lite map verified`);
  for (const mesh of [water, seabed, lite]) mesh.geometry.dispose();
  field.texture.dispose();
  map.dispose();
}

// The archipelago in one ocean (the explorer's): a chain of islands from north to south, standing on one
// shallow bank (banks.ts) with the open ocean off its edges.
const world = [{ x: 0, z: 0, habitat: 'island' }, { x: ISLAND_PLACES['kelp-forest'][0], z: ISLAND_PLACES['kelp-forest'][1], habitat: 'kelp' },
  { x: ISLAND_PLACES['volcanic-pinnacle'][0], z: ISLAND_PLACES['volcanic-pinnacle'][1], habitat: 'volcanic' },
  { x: ISLAND_PLACES.mangroves[0], z: ISLAND_PLACES.mangroves[1], habitat: 'mangrove' },
  { x: ISLAND_PLACES.shipwreck[0], z: ISLAND_PLACES.shipwreck[1], habitat: 'wreck' }];
for (const level of [1, 6]) {
  const field = buildDepthField(level, world), depth = sampler(field, field.texture.image.data), share = sampler(field, field.region.image.data), shareMore = sampler(field, field.regionMore.image.data);
  assert.deepEqual(field.habitats, ['island', 'kelp', 'volcanic', 'mangrove', 'wreck']);
  const [kx, kz] = [world[1].x, world[1].z], [vx, vz] = [world[2].x, world[2].z], [gx, gz] = [world[3].x, world[3].z], [wx, wz] = [world[4].x, world[4].z];
  // Land at every island's middle; the open ocean well off the bank beside each.
  for (const { x, z } of world) assert.equal(depth(x, z)[0], 0, `level ${level}: no land at (${x}, ${z})`);
  for (const { x, z } of world) assert(depth(x + 11, z)[0] > 200, `level ${level}: the open ocean beside (${x}, ${z}) is too shallow (${depth(x + 11, z)[0]})`);
  // The bank: between neighbours, shallow water (not land, not the open ocean); each cay just dry.
  assert(field.bank, `level ${level}: the islands stand on no bank`);
  const chain = [...world].sort((a, b) => a.z - b.z);
  for (let i = 0; i < chain.length - 1; i++) {
    const mx = (chain[i].x + chain[i + 1].x) / 2, mz = (chain[i].z + chain[i + 1].z) / 2, [d] = depth(mx, mz);
    assert(d > 0 && d < depth(mx + 11, mz)[0] - 60, `level ${level}: no shallow bank between (${chain[i].x}, ${chain[i].z}) and the next (${d})`);
  }
  for (const cay of field.bank.cays) assert(depth(cay.x, cay.z)[1] > 0, `level ${level}: the cay at (${cay.x.toFixed(2)}, ${cay.z.toFixed(2)}) is under water`);
  assert(depth(kx + 3, kz + .3)[0] < depth(kx + 11, kz)[0] - 40, `level ${level}: no shelf around the Kelp Forest`);
  // Each island's own water around it, blending between neighbours.
  assert(share(0, 2.5)[0] > 220 && share(kx, kz + 2.5)[1] > 220 && share(vx, vz + 2.5)[2] > 220 && share(gx, gz + 2.5)[3] > 220 && shareMore(wx, wz + 2.5)[0] > 220, `level ${level}: an island's water is not its own`);
  const between = share(vx / 2, vz / 2);
  assert(between[0] > 40 && between[2] > 40, `level ${level}: no blend between the reef's water and the volcano's (${between})`);
  // The world's seabed and water: within 16-bit indices, finite, and the seabed under water offshore of every island.
  const water = createWaterMesh(uniforms, field, OCEAN, EXPLORER.reach), seabed = createSeabedMesh(uniforms, field, EXPLORER.reach);
  for (const mesh of [water, seabed]) {
    assert(mesh.geometry.attributes.position.count < 65536, `level ${level}: ${mesh.name} has too many vertices for 16-bit indices`);
    for (const value of mesh.geometry.attributes.position.array) assert(Number.isFinite(value));
  }
  // And the widest a wide screen's water ever reaches (waterReach in explorer-view.ts), still within them.
  const widest = { x: EXPLORER.farthest, z: EXPLORER.reach }, wideWater = createWaterMesh(uniforms, field, OCEAN, widest), wideSeabed = createSeabedMesh(uniforms, field, widest);
  for (const mesh of [wideWater, wideSeabed]) {
    assert(mesh.geometry.attributes.position.count < 65536, `level ${level}: a wide screen's ${mesh.name} has too many vertices for 16-bit indices (${mesh.geometry.attributes.position.count})`);
  }
  const wide = `wide screens' water ${wideWater.geometry.attributes.position.count}, seabed ${wideSeabed.geometry.attributes.position.count}`;
  for (const mesh of [wideWater, wideSeabed]) mesh.geometry.dispose();
  const floor = seabed.geometry.attributes.position, reefShores = shorePolygons(level, 24, 'reef');
  // The crest and its outer slope, wherever the crest wanders (OCEAN.reefShape).
  const onCrest = (x, z) => { const d = shoreDistance(reefShores, x, z) / shelfStretch(x, z); return d > OCEAN.reefCrest.rise - .3 && d < OCEAN.reefCrest.foot + .3; };
  for (let i = 0; i < floor.count; i++) {
    const distance = shoreDistance(field.polygons, floor.getX(i), floor.getZ(i));
    // (except where the bank rises on purpose, its sandbars and cays, and on the Coral Reef's crest; Home's reef is in the middle)
    if (distance > .8 && bankDepth(field.bank, floor.getX(i), floor.getZ(i)) > .45 && !onCrest(floor.getX(i), floor.getZ(i))) assert(floor.getY(i) < uniforms.uOceanSurface.value - .3, `level ${level}: world seabed too shallow ${distance.toFixed(2)} offshore`);
  }
  // The water reaches past both islands, and the lite map colors each island's water as its own.
  const box = water.geometry.boundingBox ?? (water.geometry.computeBoundingBox(), water.geometry.boundingBox);
  assert(box.min.z < kz - 10 && box.max.z > Math.max(vz, gz, wz) + 10 && box.max.x > gx + 10, `level ${level}: the water does not reach past every island`);
  const map = buildLiteOceanMap(field), baked = sampler(field, map.image.data);
  // (the reef's out past its crest, off the bank: inside the crest lies its pale lagoon)
  const reef = baked(6.5, 0), kelp = baked(kx, kz + 3.4);
  assert(reef[2] - reef[1] > kelp[2] - kelp[1] - 5 && reef[0] + reef[1] + reef[2] > kelp[0] + kelp[1] + kelp[2], `level ${level}: the Kelp Forest's water is not its own (${reef} vs ${kelp})`);
  // The volcano's: a deeper blue than the reef's turquoise.
  const cobalt = baked(vx, vz + 3.4);
  assert(cobalt[2] - cobalt[1] > reef[2] - reef[1] + 10, `level ${level}: the Volcanic Pinnacle's water is not its own (${reef} vs ${cobalt})`);
  // The mangroves': greener than the reef's turquoise.
  const lagoon = baked(gx, gz + 3.4);
  assert(lagoon[1] - lagoon[2] > reef[1] - reef[2], `level ${level}: the Mangroves' water is not its own (${reef} vs ${lagoon})`);
  // The Shipwreck's: a clear aquamarine, bluer than the mangroves' green.
  const clear = baked(wx, wz + 3.4);
  assert(clear[2] - clear[1] > lagoon[2] - lagoon[1] + 10, `level ${level}: the Shipwreck's water is not its own (${clear} vs ${lagoon})`);
  console.log(`level ${level}: five islands in one ocean: water ${water.geometry.attributes.position.count} vertices, seabed ${floor.count} (${wide} at most); land, shelves, open sea and each island's water verified`);
  for (const mesh of [water, seabed]) mesh.geometry.dispose();
  field.texture.dispose(); field.region.dispose(); field.regionMore.dispose(); map.dispose();
}
for (const habitat of ['island', 'lagoon', 'cove']) {
  const shallow = waterColorAt(habitat, .1), deep = waterColorAt(habitat, 3);
  assert(shallow.r + shallow.g + shallow.b > deep.r + deep.g + deep.b, `${habitat}: shallows darker than open water`);
}
console.log('palettes: shallows brighter than open water for every habitat');
