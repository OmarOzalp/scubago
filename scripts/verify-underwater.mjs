/**
 * Check the actual asset coordinates and ownership used by the head-first dive effect and the
 * shared ocean uniforms. Run with `npm run verify:underwater` (tsx resolves the app's path aliases).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mesh, ShaderLib, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createOceanUniforms } from '../src/components/home/three/ocean-mesh.ts';
import { prepareUnderwater } from '../src/components/home/three/underwater-material.ts';

const ocean = createOceanUniforms('island');

for (const name of ['shark', 'manta', 'reef-fish', 'whale-shark', 'tiger-shark', 'great-white-shark', 'reef-manta', 'mola-mola', 'green-turtle']) {
  const bytes = readFileSync(new URL(`../assets/models/marine/${name}.glb`, import.meta.url));
  const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const a = clone(source.scene), b = clone(source.scene);
  const first = prepareUnderwater(a, ocean), second = prepareUnderwater(b, ocean);
  first.setDepth(.5, true);
  assert.equal(first.surfacing.value, 1);
  assert.equal(second.surfacing.value, 0);
  assert.equal(second.depth.value, 0, `${name}: dive state leaks between animals`);
  let min = Infinity, max = -Infinity, tail = Infinity, head = -Infinity;
  a.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const original = source.scene.getObjectByName(object.name);
    assert.notEqual(object.geometry, original.geometry, `${name}: changed cached geometry`);
    assert.equal(original.geometry.attributes.diveAlong, undefined);
    assert.notEqual(object.material, original.material, `${name}: changed cached material`);
    const along = object.geometry.attributes.diveAlong;
    for (let i = 0; i < along.count; i++) {
      const value = along.getX(i);
      assert(Number.isFinite(value) && value >= 0 && value <= 1);
      const z = new Vector3().fromBufferAttribute(object.geometry.attributes.position, i).applyMatrix4(object.matrixWorld).z;
      if (value < min) { min = value; tail = z; }
      if (value > max) { max = value; head = z; }
    }
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const shader = { uniforms: {}, vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
    material.onBeforeCompile(shader, null);
    assert(shader.vertexShader.includes('submersion = smoothstep'));
    assert(shader.fragmentShader.includes('diffuseColor.a *= 1.0 - submersion'));
    assert.equal(shader.uniforms.diveDepth, first.depth);
    assert.equal(shader.uniforms.surfacing, first.surfacing);
    assert(shader.vertexShader.includes('1.0 - emergence'));
    // Every animal reads the same water clock and palette, and tints with its depth below the waves.
    assert.equal(shader.uniforms.uOceanTime, ocean.uOceanTime);
    assert.equal(shader.uniforms.uOceanDeep, ocean.uOceanDeep);
    assert(shader.vertexShader.includes('vOceanDepth = max(0.0, uOceanSurface + oceanWave('));
    assert(shader.fragmentShader.includes('oceanWaterColor(vOceanDepth)'));
  });
  // Lite (software-rendered GPUs): depth from the calm surface level, no per-vertex waves, surface tint laid on here.
  const c = clone(source.scene), lite = prepareUnderwater(c, ocean, true);
  c.traverse((object) => {
    if (!object.isMesh) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const shader = { uniforms: {}, vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
    material.onBeforeCompile(shader, null);
    assert(shader.vertexShader.includes('vOceanDepth = max(0.0, uOceanSurface - oceanWorld.y)'));
    assert(!shader.vertexShader.includes('uOceanSurface + oceanWave('), `${name}: lite animals still evaluate waves per vertex`);
    assert(shader.fragmentShader.includes('uOceanOpacity.y * .85'));
    assert(shader.fragmentShader.includes('diffuseColor.a *= 1.0 - submersion'));
    // A separate program key, so three.js never reuses the full-quality program for lite animals.
    assert.equal(material.customProgramCacheKey(), 'marine-ocean-water-v2-lite');
  });
  lite.dispose();
  assert.equal(min, 0); assert.equal(max, 1);
  assert(head > tail, `${name}: fade direction is reversed`);
  first.dispose(); second.dispose();
  console.log(`${name}: head-to-tail coordinates, independent materials and dive uniforms verified`);
}
