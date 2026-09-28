/**
 * Check the actual asset coordinates and ownership used by the head-first dive effect and the
 * shared ocean uniforms. Run with `npm run verify:underwater` (tsx resolves the app's path aliases).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Group, Mesh, OrthographicCamera, Raycaster, ShaderLib, Vector2, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createOceanUniforms } from '../src/components/home/three/ocean-mesh.ts';
import { prepareUnderwater } from '../src/components/home/three/underwater-material.ts';
import { createSchoolHitArea, SCHOOL_HIT_DEPTH } from '../src/components/home/three/school-hit-area.ts';
import { createSchoolMaterial } from '../src/components/home/three/school-material.ts';
import { createTunaGeometry } from '../src/components/home/three/tuna-geometry.ts';
import { createMarineMotion } from '../src/lib/marine-motion.ts';
import { sampleDive } from '../src/lib/ocean-depth.ts';

const ocean = createOceanUniforms('island');
const MODELS = ['shark', 'manta', 'reef-fish', 'whale-shark', 'tiger-shark', 'great-white-shark', 'scalloped-hammerhead', 'reef-manta', 'mola-mola', 'green-turtle', 'bottlenose-dolphin'];
const loadModel = async (name) => {
  const bytes = readFileSync(new URL(`../assets/models/marine/${name}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

for (const name of MODELS) {
  const source = await loadModel(name);
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

// The tuna school: one instanced material that swims in the vertex shader and shares the water's depth
// tint, refraction and haze; a runtime mesh within budget whose body normals point outward.
for (const lite of [false, true]) {
  const geometry = createTunaGeometry(lite), positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const triangles = geometry.index.count / 3;
  assert(triangles <= (lite ? 90 : 180), `tuna${lite ? ' (lite)' : ''}: ${triangles} triangles`);
  for (let i = 0; i < positions.count; i++) {
    const p = new Vector3().fromBufferAttribute(positions, i), n = new Vector3().fromBufferAttribute(normals, i);
    assert(Math.abs(n.length() - 1) < 1e-4, 'tuna normals are unit length');
    assert(Math.abs(p.x) <= .15 && Math.abs(p.y) <= .22 && p.z >= -.51 && p.z <= .5, 'tuna fits its model space');
  }
  const material = createSchoolMaterial(ocean, lite);
  const shader = { uniforms: {}, vertexShader: ShaderLib.phong.vertexShader, fragmentShader: ShaderLib.phong.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert(shader.vertexShader.includes('attribute vec4 swim'));
  assert(shader.vertexShader.includes('swim.y * swimAlong * swimAlong * sin(swim.x - swimAlong * 2.6)'));
  assert(shader.vertexShader.includes('modelMatrix * instanceMatrix * vec4(transformed, 1.0)'));
  assert.equal(shader.uniforms.uOceanTime, ocean.uOceanTime);
  assert(shader.fragmentShader.includes('oceanWaterColor(vOceanDepth)'));
  assert(shader.fragmentShader.includes('outgoingLight = mix(outgoingLight, uOceanCard, vOceanHaze)'));
  if (lite) {
    assert(shader.vertexShader.includes('vOceanDepth = max(0.0, uOceanSurface - oceanWorld.y)'));
    assert(!shader.vertexShader.includes('uOceanSurface + oceanWave('), 'lite tuna still evaluate waves per vertex');
    assert(shader.fragmentShader.includes('uOceanOpacity.y * .85'));
  } else assert(shader.vertexShader.includes('uOceanSurface + oceanWave('));
  assert.equal(material.customProgramCacheKey(), lite ? 'marine-school-v1-lite' : 'marine-school-v1');
  assert(!material.transparent, 'the school is opaque: one draw call, no sorting');
  material.dispose(); geometry.dispose();
  console.log(`tuna school${lite ? ' (lite)' : ''}: ${triangles} triangles, swim deformation, instanced water depth and shared uniforms verified`);
}

// The tuna school's tap target: one invisible oval over the school as the scene camera sees it (a
// phone-sized canvas, framed like SceneCamera), under every fish of a school that is together, not
// beside it, and behind every animal: one over the school is always nearer, and takes the tap.
{
  const width = 390, height = 362, raycaster = new Raycaster();
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 60);
  camera.position.set(0, 12, 6);
  camera.zoom = Math.min(width, height) / 10.8;
  camera.lookAt(0, -.15, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const screen = (x, y, z) => { const p = new Vector3(x, y, z).project(camera); return new Vector2(p.x, p.y); };
  const hitsTarget = (point, objects) => { raycaster.setFromCamera(point, camera); return raycaster.intersectObjects(objects, true); };
  const motion = createMarineMotion([], 1, { school: true, seed: .5 });
  for (let i = 0; i < 1800; i++) motion.step(1 / 60, true);
  const school = motion.school, area = school.hitArea, pose = school.pose, hit = createSchoolHitArea();
  hit.update(area, camera);
  assert.equal(hit.mesh.visible, false, 'the tap target is never drawn');
  assert.equal(hit.mesh.geometry.index.count / 3, 24);
  // Far below the school, yet exactly under its middle on screen.
  assert(screen(area.x, area.y, area.z).distanceTo(screen(hit.mesh.position.x, hit.mesh.position.y, hit.mesh.position.z)) < 1e-4);
  let under = 0;
  for (let i = 0; i < school.size; i++) if (hitsTarget(screen(pose.x[i], pose.y[i], pose.z[i]), [hit.mesh]).length) under++;
  assert.equal(under, school.size, `${under} of ${school.size} fish under the tap target`);
  const across = area.across + .5, beside = screen(area.x + Math.cos(area.heading) * across, area.y, area.z - Math.sin(area.heading) * across);
  assert.equal(hitsTarget(beside, [hit.mesh]).length, 0, 'the tap target reaches beside the school');
  // Its size on screen, in points: the smallest is comfortable under a finger.
  const points = (a, b) => a.distanceTo(b) / 2 * width;
  const along = points(screen(area.x - Math.sin(area.heading) * area.along, area.y, area.z - Math.cos(area.heading) * area.along), screen(area.x + Math.sin(area.heading) * area.along, area.y, area.z + Math.cos(area.heading) * area.along));
  const wide = points(screen(area.x - Math.cos(area.heading) * area.across, area.y, area.z + Math.sin(area.heading) * area.across), screen(area.x + Math.cos(area.heading) * area.across, area.y, area.z - Math.sin(area.heading) * area.across));
  assert(Math.min(along, wide) >= 44, `tap target ${along.toFixed(0)} x ${wide.toFixed(0)} pt`);
  // A great white over the school: its body is hit first, the school's target only behind it.
  const great = new Group().add(clone((await loadModel('great-white-shark')).scene));
  great.position.set(area.x, -.94, area.z); great.rotation.set(0, area.heading + .6, 0, 'YXZ'); great.scale.setScalar(2.5);
  great.updateMatrixWorld(true);
  const [first, ...rest] = hitsTarget(screen(area.x, -.94, area.z), [great, hit.mesh]);
  assert(first && first.object !== hit.mesh && rest.some((h) => h.object === hit.mesh), 'the shark over the school must take the tap first');
  // And so for every animal, at the bottom of its dive, pitched and rolled any way (the sunfish
  // swims on its side), and larger than any is drawn.
  let lowest = Infinity;
  const deepest = Math.min(...Array.from({ length: 380 }, (_, k) => sampleDive(k / 10, 0, 1).y)) - .3;
  for (const name of MODELS) {
    const animal = new Group().add(clone((await loadModel(name)).scene));
    for (const pitch of [-.22, .22]) {
      for (let roll = -1.2; roll <= 1.21; roll += .3) {
        animal.position.set(0, deepest, 0); animal.rotation.set(pitch, 0, roll, 'YXZ'); animal.scale.setScalar(3);
        animal.updateMatrixWorld(true);
        lowest = Math.min(lowest, new Box3().setFromObject(animal, true).min.y);
      }
    }
  }
  assert(lowest > SCHOOL_HIT_DEPTH + 1, `an animal reaches y ${lowest.toFixed(2)}, too near the school's tap target at ${SCHOOL_HIT_DEPTH}`);
  hit.dispose();
  console.log(`tuna school tap target: ${along.toFixed(0)} x ${wide.toFixed(0)} pt over ${under}/${school.size} fish, missed beside the school, behind every animal (lowest reaches y ${lowest.toFixed(2)}, target at ${SCHOOL_HIT_DEPTH})`);
}
