/** Exercise the actual shipped GLBs and Three.js animation system without a GPU. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Box3, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

for (const name of ['shark', 'manta', 'reef-fish', 'whale-shark', 'tiger-shark', 'reef-manta']) {
  const bytes = readFileSync(new URL(`../assets/models/marine/${name}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const clip = gltf.animations.find((animation) => animation.name === 'Swim');
  let triangles = 0, meshes = 0;
  gltf.scene.traverse((object) => {
    if (object.isMesh) {
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      if (['whale-shark', 'tiger-shark', 'reef-manta'].includes(name)) {
        assert(object.geometry.attributes.color, `${name}: missing identifying painted markings`);
        assert(object.material.vertexColors, `${name}: material ignores identifying markings`);
        assert(!object.material.map, `${name}: unexpected texture dependency`);
      }
    }
  });
  console.log(`${name}: ${triangles} triangles, ${bytes.byteLength} bytes`);
  if (['whale-shark', 'tiger-shark', 'reef-manta'].includes(name)) assert.equal(meshes, 1, `${name}: too many skinned draw calls`);
  assert(triangles < 5000, `${name}: exceeds lightweight swimming budget`);
  assert(bytes.byteLength < 220000, `${name}: exceeds download budget`);
  assert(clip && clip.duration > 0, `${name}: missing swim clip`);
  const a = clone(gltf.scene), b = clone(gltf.scene);
  let skin;
  a.traverse((object) => { if (object instanceof SkinnedMesh && (!skin || object.geometry.attributes.position.count > skin.geometry.attributes.position.count)) skin = object; });
  assert(skin, `${name}: missing skinned body`);
  const mixer = new AnimationMixer(a);
  mixer.clipAction(clip).play();
  function sample(time) {
    mixer.setTime(time); a.updateMatrixWorld(true);
    const vertices = [];
    for (let i = 0; i < skin.geometry.attributes.position.count; i += 13) {
      vertices.push(...skin.getVertexPosition(i, new Vector3()).applyMatrix4(skin.matrixWorld).toArray());
    }
    assert(vertices.every(Number.isFinite), `${name}: non-finite animated vertices`);
    const size = new Box3().setFromObject(a, true).getSize(new Vector3());
    assert(size.length() > .5 && size.length() < 2, `${name}: broken scale`);
    return vertices;
  }
  const first = sample(0), moving = sample(clip.duration * .31);
  const deformation = Math.max(...first.map((value, i) => Math.abs(value - moving[i])));
  assert(deformation > .005, `${name}: skeleton moves but body does not deform`);
  const restored = sample(clip.duration);
  const seam = Math.max(...first.map((value, i) => Math.abs(value - restored[i])));
  assert(seam < .002, `${name}: swim loop has a visible seam`);
  assert.notEqual(a.getObjectByName(skin.skeleton.bones[0].name), b.getObjectByName(skin.skeleton.bones[0].name), `${name}: swimmers share a skeleton`);
  mixer.stopAllAction(); mixer.uncacheRoot(a);
  console.log(`${name}: valid rig, independent skeleton, deforming swim cycle, continuous loop (${bytes.byteLength} bytes)`);
}
