/**
 * Exercise the actual shipped GLBs and Three.js animation system without a GPU. Run with `npm run verify:marine`
 * (tsx resolves the app's path aliases). Also checks that every body stays inside the hull the swimming keeps
 * above the seabed (src/lib/marine-bodies.ts).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Box3, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createSwimRig, RIG_EULER_ORDER } from '../src/lib/marine-rigs.ts';
import { hullOf } from '../src/lib/marine-bodies.ts';
import { MARINE_SIZE } from '../src/components/home/three/tap-target.ts';

const SPECIES = ['whale-shark', 'tiger-shark', 'great-white-shark', 'scalloped-hammerhead', 'reef-manta', 'mola-mola', 'green-turtle', 'bottlenose-dolphin',
  'day-octopus', 'giant-cuttlefish', 'giant-moray',
  'great-barracuda', 'sailfish', 'california-sea-lion', 'spotted-eagle-ray', 'golden-jellyfish', 'clownfish',
  'humpback-whale', 'sperm-whale', 'oceanic-whitetip', 'leatherback-turtle', 'oceanic-manta',
  'harbor-seal', 'sea-otter', 'garibaldi', 'leafy-seadragon', 'orca',
  'marine-iguana', 'galapagos-shark', 'thresher-shark', 'giant-trevally', 'king-angelfish',
  'dugong', 'sawfish', 'lemon-shark', 'southern-stingray', 'tarpon',
  'grey-reef-shark', 'blacktip-reef-shark', 'whitetip-reef-shark', 'hawksbill-turtle', 'napoleon-wrasse', 'bumphead-parrotfish',
  'sand-tiger-shark', 'loggerhead-turtle', 'goliath-grouper', 'lionfish', 'batfish'];
/**
 * Animals with a pose of their own to check beyond swimming and turning: the reef's (resting,
 * jetting), the barracuda hanging still, the sailfish's sail, the clownfish rowing in place.
 */
const POSES = {
  'day-octopus': [{ effort: 1, turn: 0, curvature: 0, climb: 0, ground: 1 }, { effort: 1.5, turn: 0, curvature: 0, climb: 0, jet: 1, ground: 0 }, 'arms bundle for a jet'],
  'giant-cuttlefish': [{ effort: .25, turn: 0, curvature: 0, climb: 0 }, { effort: 1.5, turn: 0, curvature: 0, climb: 0, jet: 1 }, 'fin skirt folds for a jet'],
  'giant-moray': [{ effort: 1, turn: 0, curvature: 0, climb: 0 }, { effort: .25, turn: 0, curvature: 0, climb: 0, rest: 1 }, 'body settles in its den'],
  'great-barracuda': [{ effort: 1.5, turn: 0, curvature: 0, climb: 0 }, { effort: .25, turn: 0, curvature: 0, climb: 0 }, 'tail stills as it hangs in the water'],
  sailfish: [{ effort: 1, turn: 0, curvature: 0, climb: 0, sail: 1 }, { effort: 1, turn: 0, curvature: 0, climb: 0, sail: 0 }, 'sail folds into its groove'],
  clownfish: [{ effort: .25, turn: 0, curvature: 0, climb: 0 }, { effort: 1.5, turn: 0, curvature: 0, climb: 0 }, 'darting wags the body'],
};
for (const name of ['shark', 'manta', 'reef-fish', ...SPECIES]) {
  const bytes = readFileSync(new URL(`../assets/models/marine/${name}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const clip = gltf.animations.find((animation) => animation.name === 'Swim');
  let triangles = 0, meshes = 0;
  gltf.scene.traverse((object) => {
    if (object.isMesh) {
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      if (SPECIES.includes(name)) {
        assert(object.geometry.attributes.color, `${name}: missing identifying painted markings`);
        assert(object.material.vertexColors, `${name}: material ignores identifying markings`);
        assert(!object.material.map, `${name}: unexpected texture dependency`);
      }
    }
  });
  console.log(`${name}: ${triangles} triangles, ${bytes.byteLength} bytes`);
  if (SPECIES.includes(name)) assert.equal(meshes, 1, `${name}: too many skinned draw calls`);
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
  // How far the posed body reaches (world units: the model scaled as drawn): the lowest and highest point, out to a side and along its length.
  const reach = { low: 0, high: 0, side: 0, along: 0 };
  function measure() {
    a.updateMatrixWorld(true);
    const scale = MARINE_SIZE[name], at = new Vector3();
    for (let i = 0; i < skin.geometry.attributes.position.count; i++) {
      skin.getVertexPosition(i, at).applyMatrix4(skin.matrixWorld);
      reach.low = Math.min(reach.low, at.y * scale); reach.high = Math.max(reach.high, at.y * scale);
      reach.side = Math.max(reach.side, Math.abs(at.x) * scale); reach.along = Math.max(reach.along, Math.abs(at.z) * scale);
    }
  }
  // The hull's table is measured over a swimming stroke and rounded up: nothing of the body may reach past it (a family model's clip: the clip's own).
  const inside = (what) => {
    const hull = hullOf(name), tolerance = .005;
    assert(-reach.low <= Math.max(hull.keel, hull.wing, hull.nose, hull.tail) + tolerance, `${name}: ${what} hangs ${(-reach.low).toFixed(3)} below its middle, past its hull (marine-bodies.ts)`);
    assert(reach.high <= hull.crest + tolerance, `${name}: ${what} rises ${reach.high.toFixed(3)} above its middle, past its hull (marine-bodies.ts)`);
    assert(reach.side <= hull.width + tolerance, `${name}: ${what} spans ${reach.side.toFixed(3)} to a side, past its hull (marine-bodies.ts)`);
    assert(reach.along <= hull.length + tolerance, `${name}: ${what} reaches ${reach.along.toFixed(3)} along, past its hull (marine-bodies.ts)`);
  };
  if (!SPECIES.includes(name)) {
    for (let k = 0; k < 8; k++) { mixer.setTime(clip.duration * k / 8); measure(); }
    inside('the swim clip');
  }
  const first = sample(0), moving = sample(clip.duration * .31);
  const deformation = Math.max(...first.map((value, i) => Math.abs(value - moving[i])));
  assert(deformation > .005, `${name}: skeleton moves but body does not deform`);
  const restored = sample(clip.duration);
  const seam = Math.max(...first.map((value, i) => Math.abs(value - restored[i])));
  assert(seam < .002, `${name}: swim loop has a visible seam`);
  assert.notEqual(a.getObjectByName(skin.skeleton.bones[0].name), b.getObjectByName(skin.skeleton.bones[0].name), `${name}: swimmers share a skeleton`);
  mixer.stopAllAction(); mixer.uncacheRoot(a);
  if (SPECIES.includes(name)) {
    // The app drives these skeletons procedurally: every rig bone must exist and move the skin.
    const rig = createSwimRig(name);
    const bones = rig.bones.map((bone) => a.getObjectByName(bone));
    assert(bones.every(Boolean), `${name}: missing procedural rig bones ${rig.bones.filter((_, i) => !bones[i]).join(', ')}`);
    const apply = (phase, drive) => {
      rig.sample(phase, drive);
      bones.forEach((bone, i) => bone.rotation.set(rig.rotation[i * 3], rig.rotation[i * 3 + 1], rig.rotation[i * 3 + 2], RIG_EULER_ORDER));
      // Mantles breathe and squeeze: the few scaled bones.
      for (const i of rig.scaled) bones[i].scale.set(rig.scale[i * 3], rig.scale[i * 3 + 1], rig.scale[i * 3 + 2]);
    };
    const pose = (phase, drive) => { apply(phase, drive); return sample(0); };
    // The stroke at cruise, and in gentle turns and climbs (or a reef animal's own pose): inside its hull.
    reach.low = reach.high = reach.side = reach.along = 0;
    for (const drive of POSES[name] ? [POSES[name][0], POSES[name][1]] : [{ effort: 1, turn: 0, curvature: 0, climb: 0 }, { effort: 1, turn: .2, curvature: .4, climb: .2 }, { effort: 1, turn: -.2, curvature: -.4, climb: -.2 }]) {
      for (let k = 0; k < 16; k++) { apply(k / 16 * Math.PI * 2, drive); measure(); }
    }
    inside('the swimming stroke');
    const rest = pose(0), stroke = pose(Math.PI / 2), turning = pose(0, { effort: 1, turn: .4, curvature: .8, climb: 0 });
    assert(Math.max(...rest.map((value, i) => Math.abs(value - stroke[i]))) > .01, `${name}: procedural stroke does not deform the body`);
    assert(Math.max(...rest.map((value, i) => Math.abs(value - turning[i]))) > .005, `${name}: turning does not change the pose`);
    if (POSES[name]) {
      const [from, to, what] = POSES[name], a1 = pose(1, from), b1 = pose(1, to);
      assert(Math.max(...a1.map((value, i) => Math.abs(value - b1[i]))) > .02, `${name}: ${what} does not show`);
      if (name === 'giant-moray') {
        // Resting, the mouth opens and closes as it breathes: the jaw moves the skin.
        const closed = pose(-Math.PI / 2, to), open = pose(Math.PI / 2, to);
        assert(Math.max(...closed.map((value, i) => Math.abs(value - open[i]))) > .004, `${name}: breathing does not open the mouth`);
      }
      if (name === 'clownfish') {
        // Hovering, it rows with its pectoral fins: they sweep back and forth while the tail barely moves.
        const back = pose(-Math.PI / 2, from), forth = pose(Math.PI / 2, from);
        assert(Math.max(...back.map((value, i) => Math.abs(value - forth[i]))) > .01, `${name}: hovering, its pectorals do not row`);
      }
    }
  }
  console.log(`${name}: valid rig, independent skeleton, deforming swim cycle, continuous loop (${bytes.byteLength} bytes)`);
}
