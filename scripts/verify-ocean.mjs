/** Build the real ocean meshes and depth map for every level and check their budgets and shape. */
import assert from 'node:assert/strict';
import {
  buildDepthField, buildLiteOceanMap, createLiteOceanMesh, createOceanUniforms, createSeabedMesh, createWaterMesh, waterColorAt,
} from '../src/components/home/three/ocean-mesh.ts';
import { OCEAN } from '../src/lib/ocean.ts';
import { shoreDistance } from '../src/components/home/three/island-shape.ts';
import { ISLAND_PLACES } from '../src/lib/archipelago.ts';
import { EXPLORER } from '../src/lib/explorer-view.ts';

/** A texel of one of a depth field's maps at a point in the world (RGBA bytes). */
const sampler = (field, data) => (x, z) => {
  const i = Math.floor((x - field.area.x0) / field.area.width * field.columns), j = Math.floor((z - field.area.z0) / field.area.depth * field.rows);
  return data.slice((j * field.columns + i) * 4, (j * field.columns + i) * 4 + 4);
};

const uniforms = createOceanUniforms('island');
for (let level = 1; level <= 6; level++) {
  const field = buildDepthField(level);
  const water = createWaterMesh(uniforms, field), seabed = createSeabedMesh(uniforms, field, level);
  for (const mesh of [water, seabed]) {
    const vertices = mesh.geometry.attributes.position.count, triangles = mesh.geometry.index.count / 3;
    assert(vertices < 3000, `level ${level}: ${mesh.name} has ${vertices} vertices`);
    assert(triangles < 5000, `level ${level}: ${mesh.name} has ${triangles} triangles`);
    assert(mesh.geometry.index.array instanceof Uint16Array);
    for (const value of mesh.geometry.attributes.position.array) assert(Number.isFinite(value));
  }
  // Waves flatten over the beach and reach full height over open water.
  const position = water.geometry.attributes.position, shoaling = water.geometry.attributes.aShoaling;
  for (let i = 0; i < position.count; i++) {
    const distance = shoreDistance(field.polygons, position.getX(i), position.getZ(i)), value = shoaling.getX(i);
    assert(value >= 0 && value <= 1);
    if (distance < 0) assert.equal(value, 0, `level ${level}: waves over dry land`);
    if (distance > 1.6) assert.equal(value, 1, `level ${level}: open water is flattened`);
  }
  // Offshore, the seabed stays under water, and well under it past the shelf.
  const floor = seabed.geometry.attributes.position;
  for (let i = 0; i < floor.count; i++) {
    const distance = shoreDistance(field.polygons, floor.getX(i), floor.getZ(i)), surface = uniforms.uOceanSurface.value;
    if (distance > .3) assert(floor.getY(i) < surface, `level ${level}: seabed above water ${distance.toFixed(2)} offshore`);
    if (distance > .8) assert(floor.getY(i) < surface - .3, `level ${level}: shelf too shallow ${distance.toFixed(2)} offshore`);
  }
  // Depth map: dry land at the center, shallows near the coast, deep water far out.
  const { data } = field.texture.image;
  const texel = sampler(field, data);
  const [landDepth, landHeight] = texel(0, 0), [openDepth] = texel(7.5, 0);
  assert.equal(landDepth, 0); assert(landHeight > 0);
  assert(openDepth > 200, `level ${level}: open water too shallow (${openDepth})`);
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

// The archipelago in one ocean (the explorer's): the Coral Reef in the middle, the Kelp Forest to the north, the
// Volcanic Pinnacle to the south-west and the Mangroves & Seagrass to the south-east.
const world = [{ x: 0, z: 0, habitat: 'island' }, { x: ISLAND_PLACES['kelp-forest'][0], z: ISLAND_PLACES['kelp-forest'][1], habitat: 'kelp' },
  { x: ISLAND_PLACES['volcanic-pinnacle'][0], z: ISLAND_PLACES['volcanic-pinnacle'][1], habitat: 'volcanic' },
  { x: ISLAND_PLACES.mangroves[0], z: ISLAND_PLACES.mangroves[1], habitat: 'mangrove' }];
for (const level of [1, 6]) {
  const field = buildDepthField(level, world), depth = sampler(field, field.texture.image.data), share = sampler(field, field.region.image.data);
  assert.deepEqual(field.habitats, ['island', 'kelp', 'volcanic', 'mangrove']);
  const [kx, kz] = [world[1].x, world[1].z], [mx, mz] = [kx / 2, kz / 2], [vx, vz] = [world[2].x, world[2].z], [gx, gz] = [world[3].x, world[3].z];
  // Land at both islands' middles, the shelf around each, and open ocean between them.
  for (const [x, z] of [[0, 0], [kx, kz], [vx, vz], [gx, gz]]) assert.equal(depth(x, z)[0], 0, `level ${level}: no land at (${x}, ${z})`);
  assert(depth(vx / 2, vz / 2)[0] > 200, `level ${level}: the sea between the reef and the volcano is too shallow`);
  assert(depth(mx, mz)[0] > 200, `level ${level}: the sea between the islands is too shallow (${depth(mx, mz)[0]})`);
  assert(depth(kx + 2.6, kz + .3)[0] < depth(mx, mz)[0] - 40, `level ${level}: no shelf around the Kelp Forest`);
  // Each island's own water around it, blending between them.
  assert(share(0, 2.5)[0] > 250 && share(kx, kz + 2.5)[1] > 250 && share(vx, vz + 2.5)[2] > 250 && share(gx, gz + 2.5)[3] > 250, `level ${level}: an island's water is not its own`);
  const south = share(vx / 2, vz / 2);
  assert(south[0] > 40 && south[2] > 40, `level ${level}: no blend between the reef's water and the volcano's (${south})`);
  const between = share(mx, mz);
  assert(between[0] > 40 && between[1] > 40, `level ${level}: no blend between the islands' waters (${between})`);
  // The world's seabed and water: within 16-bit indices, finite, and the seabed under water offshore of every island.
  const water = createWaterMesh(uniforms, field, OCEAN, EXPLORER.reach), seabed = createSeabedMesh(uniforms, field, level, EXPLORER.reach);
  for (const mesh of [water, seabed]) {
    assert(mesh.geometry.attributes.position.count < 65536, `level ${level}: ${mesh.name} has too many vertices for 16-bit indices`);
    for (const value of mesh.geometry.attributes.position.array) assert(Number.isFinite(value));
  }
  const floor = seabed.geometry.attributes.position;
  for (let i = 0; i < floor.count; i++) {
    const distance = shoreDistance(field.polygons, floor.getX(i), floor.getZ(i));
    if (distance > .8) assert(floor.getY(i) < uniforms.uOceanSurface.value - .3, `level ${level}: world seabed too shallow ${distance.toFixed(2)} offshore`);
  }
  // The water reaches past both islands, and the lite map colors each island's water as its own.
  const box = water.geometry.boundingBox ?? (water.geometry.computeBoundingBox(), water.geometry.boundingBox);
  assert(box.min.z < kz - 10 && box.max.z > Math.max(vz, gz) + 10 && box.max.x > gx + 10, `level ${level}: the water does not reach past every island`);
  const map = buildLiteOceanMap(field), baked = sampler(field, map.image.data);
  const reef = baked(0, 3.4), kelp = baked(kx, kz + 3.4);
  assert(reef[2] - reef[1] > kelp[2] - kelp[1] - 5 && reef[0] + reef[1] + reef[2] > kelp[0] + kelp[1] + kelp[2], `level ${level}: the Kelp Forest's water is not its own (${reef} vs ${kelp})`);
  // The volcano's: a deeper blue than the reef's turquoise.
  const cobalt = baked(vx, vz + 3.4);
  assert(cobalt[2] - cobalt[1] > reef[2] - reef[1] + 10, `level ${level}: the Volcanic Pinnacle's water is not its own (${reef} vs ${cobalt})`);
  // The mangroves': greener than the reef's turquoise.
  const lagoon = baked(gx, gz + 3.4);
  assert(lagoon[1] - lagoon[2] > reef[1] - reef[2], `level ${level}: the Mangroves' water is not its own (${reef} vs ${lagoon})`);
  console.log(`level ${level}: four islands in one ocean: water ${water.geometry.attributes.position.count} vertices, seabed ${floor.count}; land, shelves, open sea and each island's water verified`);
  for (const mesh of [water, seabed]) mesh.geometry.dispose();
  field.texture.dispose(); field.region.dispose(); map.dispose();
}
for (const habitat of ['island', 'lagoon', 'cove']) {
  const shallow = waterColorAt(habitat, .1), deep = waterColorAt(habitat, 3);
  assert(shallow.r + shallow.g + shallow.b > deep.r + deep.g + deep.b, `${habitat}: shallows darker than open water`);
}
console.log('palettes: shallows brighter than open water for every habitat');
