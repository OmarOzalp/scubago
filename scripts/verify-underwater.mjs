/**
 * Check the actual asset coordinates and ownership used by the head-first dive effect and the
 * shared ocean uniforms. Run with `npm run verify:underwater` (tsx resolves the app's path aliases).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, CircleGeometry, Group, Mesh, OrthographicCamera, Raycaster, ShaderLib, Vector2, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createOceanUniforms } from '../src/components/home/three/ocean-mesh.ts';
import { FLOOR_BIAS, prepareUnderwater } from '../src/components/home/three/underwater-material.ts';
import { createSchoolHitArea, SCHOOL_HIT_DEPTH } from '../src/components/home/three/school-hit-area.ts';
import { createSchoolMaterial } from '../src/components/home/three/school-material.ts';
import { createTunaGeometry } from '../src/components/home/three/tuna-geometry.ts';
import { MARINE_SIZE, MIN_TAP, TAP_SHAPES, tapTarget } from '../src/components/home/three/tap-target.ts';
import { oceanScale } from '../src/lib/steering.ts';
import { createMarineMotion } from '../src/lib/marine-motion.ts';
import { sampleDive } from '../src/lib/ocean-depth.ts';

const ocean = createOceanUniforms('island');
const MODELS = ['shark', 'manta', 'reef-fish', 'whale-shark', 'tiger-shark', 'great-white-shark', 'scalloped-hammerhead', 'reef-manta', 'mola-mola', 'green-turtle', 'bottlenose-dolphin',
  'day-octopus', 'giant-cuttlefish', 'giant-moray'];
const REEF = ['day-octopus', 'giant-cuttlefish', 'giant-moray'];
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

// The reef's animals (reef-life.ts) draw with their own program: set back in depth so open-water animals
// passing over the reef are never hidden by them, partly out of sight in a den, with color states, each
// its own (one moray in its den never hides another's body), full quality and lite alike.
{
  const camera = new OrthographicCamera(-200, 200, 180, -180, .1, 60);
  camera.position.set(0, 12, 6); camera.lookAt(0, -.15, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  for (const name of REEF) {
    const source = await loadModel(name);
    for (const lite of [false, true]) {
      const a = clone(source.scene), b = clone(source.scene);
      const first = prepareUnderwater(a, ocean, lite, { bias: FLOOR_BIAS }), second = prepareUnderwater(b, ocean, lite, { bias: FLOOR_BIAS });
      first.setHide(.5, .1);
      first.setTone(.7, .8, 1.2);
      a.traverse((object) => {
        if (!object.isMesh) return;
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        const shader = { uniforms: {}, vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
        material.onBeforeCompile(shader, null);
        assert(shader.vertexShader.includes('gl_Position.z -= projectionMatrix[2][2] * diveBias * gl_Position.w'), `${name}: not set back in depth`);
        assert(shader.fragmentShader.includes('if (vDiveAlong < diveHide.x || vDiveAlong > 1.0 - diveHide.y) discard;'), `${name}: no den cut`);
        assert(shader.fragmentShader.includes('* diveTone.z + diveTone.w) * diveTone.x'), `${name}: no color state`);
        assert.deepEqual([shader.uniforms.diveHide.value.x, shader.uniforms.diveHide.value.y], [.5, .1]);
        assert.equal(shader.uniforms.diveTone.value.x, .7);
        assert.equal(shader.uniforms.diveBias.value, FLOOR_BIAS);
        // Its contrast works about its own average shade.
        assert(shader.uniforms.diveTone.value.w > .02 && shader.uniforms.diveTone.value.w < .8, `${name}: average shade ${shader.uniforms.diveTone.value.w}`);
        assert.equal(material.customProgramCacheKey(), lite ? 'marine-ocean-water-v2-lite-reef' : 'marine-ocean-water-v2-reef');
      });
      b.traverse((object) => {
        if (!object.isMesh) return;
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        const shader = { uniforms: {}, vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
        material.onBeforeCompile(shader, null);
        assert.deepEqual([shader.uniforms.diveHide.value.x, shader.uniforms.diveHide.value.y], [0, 0], `${name}: den cut leaks between animals`);
        assert.equal(shader.uniforms.diveTone.value.x, 1, `${name}: color state leaks between animals`);
      });
      first.dispose(); second.dispose();
    }
    // The open water's animals keep their own program, untouched by any of this.
    const plain = clone(source.scene);
    prepareUnderwater(plain, ocean);
    plain.traverse((object) => {
      if (!object.isMesh) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const shader = { uniforms: {}, vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
      material.onBeforeCompile(shader, null);
      assert(!shader.vertexShader.includes('diveBias') && !shader.fragmentShader.includes('diveHide'));
      assert.equal(material.customProgramCacheKey(), 'marine-ocean-water-v2');
    });
  }
  // Set back far enough: an octopus on the shelf is drawn behind a whale shark at the bottom of its swimming
  // depth passing over the same spot on screen, yet still in front of the shelf's sand beneath it.
  const clipZ = (x, y, z, bias = 0) => {
    const p = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    return p.z - camera.projectionMatrix.elements[10] * bias;
  };
  const octopus = clipZ(0, -.6, 2.2, FLOOR_BIAS);
  // Where the line of sight through the octopus meets the whale shark's depth (y -1.2): the same place on screen.
  const view = new Vector3(0, -12.15, -6).normalize(), t = (-1.2 - -.6) / view.y;
  const shark = clipZ(0, -1.2, 2.2 + view.z * t);
  assert(octopus > shark, 'a reef animal on the bottom must draw behind an open-water animal over it');
  assert(octopus < clipZ(0, -.6, 2.2, 0) + 1, 'bias stays within the view');
  console.log(`reef animals: own program (set back ${FLOOR_BIAS} unit, den cut, color states), per-animal uniforms, open water untouched`);
}
// The reef's rocks share the program and are tinted like the seabed's props.
{
  const rock = new Mesh(new CircleGeometry(1, 8));
  const look = prepareUnderwater(rock, ocean, false, { bias: FLOOR_BIAS, seabed: .45 });
  const shader = { uniforms: {}, vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };
  rock.material.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.diveSeabed.value, .45);
  assert(shader.fragmentShader.includes('diveSeabed * (1.0 - exp(-max(0.0, vOceanDepth - .15) / uOceanSeabed.x))'));
  look.dispose();
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

// Slender animals' tap targets (tap-target.ts): an invisible oval over the body, at least 28 pt across
// on a phone at the first level's zoom and at the last level's (the camera pulls back as the ocean
// grows), reaching beside the body but not far past the target, and moving with the animal: a dolphin
// pitched nose up, out of the water in a leap, is tapped on its body just the same.
{
  const width = 390, height = 362, raycaster = new Raycaster();
  for (const level of [1, 6]) {
    const scale = oceanScale(level);
    const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 60);
    camera.position.set(0, 12, 6);
    camera.zoom = Math.min(width, height) / (10.8 * scale);
    camera.lookAt(0, -.15, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const screen = (p) => { const v = p.clone().project(camera); return new Vector2(v.x, v.y); };
    const hits = (p, mesh) => { raycaster.setFromCamera(screen(p), camera); return raycaster.intersectObject(mesh).length > 0; };
    for (const name of ['bottlenose-dolphin', 'reef-fish']) {
      const size = MARINE_SIZE[name], instance = clone((await loadModel(name)).scene), target = tapTarget(instance, size, scale);
      assert(target, `${name}: slender, so it gets a tap target`);
      for (const [pitch, y] of [[0, -.8], [-1, .2]]) {
        const group = new Group().add(instance);
        const mesh = new Mesh(new CircleGeometry(1, 16));
        mesh.visible = false;
        mesh.position.set(target.x, target.y, target.z); mesh.rotation.set(-Math.PI / 2, 0, 0); mesh.scale.set(target.halfWidth, target.halfLength, 1);
        group.add(mesh);
        group.position.set(1.4, y, .9); group.rotation.set(pitch, .7, 0, 'YXZ'); group.scale.setScalar(size);
        group.updateMatrixWorld(true);
        const middle = group.localToWorld(new Vector3(target.x, target.y, target.z));
        const side = (d) => group.localToWorld(new Vector3(target.x + d / size, target.y, target.z));
        assert(hits(middle, mesh), `${name}: a tap on the middle of its body misses (level ${level}, pitch ${pitch})`);
        assert(hits(side(MIN_TAP * scale - .04), mesh), `${name}: a tap just beside its body misses (level ${level}, pitch ${pitch})`);
        assert(!hits(side(MIN_TAP * scale + .3), mesh), `${name}: its tap target reaches too far (level ${level})`);
        if (pitch === 0) {
          const across = screen(side(-target.halfWidth * size)).distanceTo(screen(side(target.halfWidth * size))) / 2 * width;
          assert(across >= 28 - .5, `${name}: tap target ${across.toFixed(1)} pt across at level ${level}`);
          console.log(`${name} at level ${level}: tap target ${across.toFixed(0)} pt across, on the body, following it (pitched and in the air too)`);
        }
        group.remove(instance);
        mesh.geometry.dispose();
      }
    }
    // Large animals are tapped on their bodies alone.
    for (const name of ['whale-shark', 'reef-manta', 'great-white-shark']) assert.equal(tapTarget(clone((await loadModel(name)).scene), MARINE_SIZE[name], scale), null, `${name}: needs no tap target`);
    // Reef animals always have a simple shape (never every arm): at least 28 pt across, over the mantle and inner
    // arms, over the cuttlefish, and along the moray's front (the part out of its den).
    for (const name of REEF) {
      const size = MARINE_SIZE[name], target = tapTarget(clone((await loadModel(name)).scene), size, scale, TAP_SHAPES[name]);
      assert(target, `${name}: needs its tap shape`);
      const across = 2 * Math.min(target.halfWidth, target.halfLength) * size / (10.8 * scale) * Math.min(width, height);
      assert(across >= 28 - .5, `${name}: tap target ${across.toFixed(1)} pt across at level ${level}`);
      if (name === 'giant-moray') assert(target.z - target.halfLength < .05 && target.z + target.halfLength > .45, 'giant-moray: tap target misses its front');
      console.log(`${name} at level ${level}: tap shape ${across.toFixed(0)} pt across`);
    }
  }
}
