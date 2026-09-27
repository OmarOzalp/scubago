/** Build the real ocean meshes and depth map for every level and check their budgets and shape. */
import assert from 'node:assert/strict';
import {
  buildDepthField, buildLiteOceanMap, createLiteOceanMesh, createOceanUniforms, createSeabedMesh, createWaterMesh, waterColorAt,
} from '../src/components/home/three/ocean-mesh.ts';
import { OCEAN } from '../src/lib/ocean.ts';
import { shoreDistance } from '../src/components/home/three/island-shape.ts';

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
  const texel = (x, z) => { const i = Math.floor((x + 9) / 18 * 128), j = Math.floor((z + 9) / 18 * 128); return data.slice((j * 128 + i) * 4, (j * 128 + i) * 4 + 4); };
  const [landDepth, landHeight] = texel(0, 0), [openDepth] = texel(7.5, 0);
  assert.equal(landDepth, 0); assert(landHeight > 0);
  assert(openDepth > 200, `level ${level}: open water too shallow (${openDepth})`);
  // Lite tier: one opaque backdrop over the same lattice, colored from a baked map.
  const lite = createLiteOceanMesh(uniforms, field), map = buildLiteOceanMap(field, 'island');
  assert.equal(lite.geometry.attributes.position.count, position.count);
  assert.equal(lite.material.depthTest, false);
  assert.equal(lite.material.transparent, false);
  const baked = (x, z) => { const i = Math.floor((x + 9) / 18 * 128), j = Math.floor((z + 9) / 18 * 128); return map.image.data.slice((j * 128 + i) * 4, (j * 128 + i) * 4 + 4); };
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
for (const habitat of ['island', 'lagoon', 'cove']) {
  const shallow = waterColorAt(habitat, .1), deep = waterColorAt(habitat, 3);
  assert(shallow.r + shallow.g + shallow.b > deep.r + deep.g + deep.b, `${habitat}: shallows darker than open water`);
}
console.log('palettes: shallows brighter than open water for every habitat');
