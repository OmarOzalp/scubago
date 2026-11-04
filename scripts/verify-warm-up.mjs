/**
 * Check the warm-up (src/components/home/three/warm-up.tsx) against three.js's own WebGLRenderer: its JavaScript runs for real (programs are
 * assembled, named and cached, in the same way as on a phone) on a stand-in GL context that draws nothing. After `warmUp` for every island, the
 * scene's real materials (the ocean's own meshes, every marine model through the loader's conversion and prepareUnderwater, the kelp, seagrass and
 * school materials, the reef's props...) must find every one of their programs already linked: compiling them adds none. Without it, they add many.
 * Run with `npx tsx scripts/verify-warm-up.mjs` (tsx resolves the app's path aliases).
 *
 * The coasts, steam, rocks, anemones, coral heads and the small life make their materials inline in their own components, so they are made
 * here the same way: if one of those changes in a way that changes its program, this check will not notice, but the warm-up will then only miss
 * a program (the scene links it as it draws, as it always did), so keep warm-specimens.ts in step with them.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  Camera, Color, DirectionalLight, DoubleSide, FrontSide, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, Mesh, MeshLambertMaterial, MeshStandardMaterial, OrthographicCamera, Scene, WebGLRenderer, BufferGeometry,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildDepthField, createLiteOceanMesh, createOceanUniforms, createSeabedMesh, createWaterMesh } from '../src/components/home/three/ocean-mesh.ts';
import { createKelpMaterial } from '../src/components/home/three/kelp-forest.tsx';
import { createSeagrassMaterial } from '../src/components/home/three/seagrass-meadow.tsx';
import { createSchoolMaterial } from '../src/components/home/three/school-material.ts';
import { createTunaGeometry } from '../src/components/home/three/tuna-geometry.ts';
import { animalMaterial, standardizeVertexColors } from '../src/components/home/three/marine-colors.ts';
import { FLOOR_BIAS, prepareUnderwater } from '../src/components/home/three/underwater-material.ts';
import { submerge } from '../src/components/home/three/islet-material.ts';
import { kindsFor } from '../src/components/home/three/warm-kinds.ts';
import { drawWarmed, warmNext, warmUp, warmedKinds } from '../src/components/home/three/warm-up.tsx';
import { ISLAND_PLACES, ISLANDS } from '../src/lib/archipelago.ts';
import { MOVEMENT } from '../src/lib/marine-motion.ts';

/** A stand-in WebGL2 context: every call answers with something plausible and nothing is drawn. */
function stubGL(canvas) {
  const constants = { VERSION: 0x1F02, MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, MAX_TEXTURE_SIZE: 0x0D33, MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C, MAX_VERTEX_ATTRIBS: 0x8869, MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB, MAX_VARYING_VECTORS: 0x8DFC, MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD, MAX_SAMPLES: 0x8D57, LINK_STATUS: 0x8B82, COMPILE_STATUS: 0x8B81, ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B89, FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84FF };
  let id = 1;
  return new Proxy({ canvas, drawingBufferWidth: 780, drawingBufferHeight: 1688 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'symbol' || key === 'then') return undefined;
      if (key in constants) return constants[key];
      if (/^[A-Z0-9_]+$/.test(key)) return 0x1000 + (key.length * 7) % 0xfff;
      switch (key) {
        case 'getParameter': return (p) => (p === constants.VERSION ? 'WebGL 2.0 (stub)' : p === constants.MAX_TEXTURE_MAX_ANISOTROPY_EXT ? 16 : 1024);
        case 'getShaderPrecisionFormat': return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
        case 'getProgramParameter': return (_p, pname) => (pname === constants.ACTIVE_UNIFORMS || pname === constants.ACTIVE_ATTRIBUTES ? 0 : true);
        case 'getShaderParameter': return () => true;
        case 'getProgramInfoLog': case 'getShaderInfoLog': return () => '';
        case 'getContextAttributes': return () => ({ alpha: true, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
        case 'getExtension': return () => null;
        case 'getSupportedExtensions': return () => [];
        case 'checkFramebufferStatus': return () => constants.FRAMEBUFFER_COMPLETE;
        case 'getError': return () => 0;
        case 'isContextLost': return () => false;
        case 'createProgram': case 'createShader': case 'createBuffer': case 'createTexture': case 'createVertexArray': case 'createFramebuffer': case 'createRenderbuffer': case 'createSampler': case 'createQuery': case 'createTransformFeedback':
          return () => ({ id: id++ });
        case 'getUniformLocation': case 'getAttribLocation': case 'getUniformBlockIndex': return () => 0;
        default: return () => undefined;
      }
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

const canvas = { width: 390, height: 844, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null, getBoundingClientRect: () => ({ width: 390, height: 844, top: 0, left: 0 }) };
const makeRenderer = () => new WebGLRenderer({ canvas, context: stubGL(canvas), antialias: false });
/** The scene's lights (sanctuary-environment.tsx): the programs are made for them. */
const makeScene = () => { const scene = new Scene(); scene.add(new HemisphereLight('#F4F7EC', '#5E8F91', 1.15), new DirectionalLight('#ffffff', 1.7)); return scene; };
const camera = new OrthographicCamera(-5, 5, 5, -5, .1, 60);

/**
 * A program's name for comparing: the scripts load one copy of three.js (the ESM build) for the objects they make and the app's modules another (tsx
 * takes the CommonJS build), and a material left with the default `customProgramCacheKey` is named by the text of its class's `onBeforeCompile`, which the two
 * builds spell differently. In the app there is one copy, and the two are the same program.
 */
const normal = (key) => key.replace(/,onBeforeCompile.*$/s, ',onBeforeCompile');

const places = Object.entries(ISLAND_PLACES).map(([id, [x, z]]) => ({ x, z, habitat: ISLANDS[id] }));
const habitats = [...new Set(places.map((p) => p.habitat))];
const ocean = createOceanUniforms('island');
const field = buildDepthField(4, places);
assert.equal(field.habitats.length, habitats.length, 'the ocean blends one water for each different shore');

// ---- The scene's real materials, as the scene makes them.
const dir = new URL('../assets/models/marine/', import.meta.url);
async function realScene(lite) {
  const root = new Group();
  // the ocean: its own meshes, from a real depth field
  root.add(...(lite ? [createLiteOceanMesh(ocean, field)] : [createSeabedMesh(ocean, field), createWaterMesh(ocean, field)]));
  // every marine model, through the loader's conversion (marine-loader.ts parseModel) and AnimatedMarine's prepareUnderwater
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
    const name = file.replace('.glb', ''), bytes = readFileSync(new URL(file, dir));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    standardizeVertexColors(gltf.scene);
    const converted = new Map();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const sources = Array.isArray(o.material) ? o.material : [o.material];
      const out = sources.map((m) => (m instanceof MeshStandardMaterial ? (converted.get(m) ?? converted.set(m, animalMaterial(m)).get(m)) : m));
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    const habitat = MOVEMENT[name]?.habitat ?? 'open-water';
    const instance = clone(gltf.scene);
    prepareUnderwater(instance, ocean, lite, habitat === 'open-water' ? undefined : { bias: habitat === 'reef-edge' ? 0 : FLOOR_BIAS });
    root.add(instance);
  }
  const box = (material, geometry = triangle(true)) => new Mesh(geometry, material);
  const triangle = (colors) => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); if (colors) g.setAttribute('color', new Float32BufferAttribute(new Array(9).fill(1), 3)); return g; };
  // the coasts (reef-coast.tsx, kelp-coast.tsx...): flat, vertex-colored, one- and two-sided
  root.add(box(new MeshLambertMaterial({ vertexColors: true, flatShading: true })), box(new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide })));
  // coral heads and the sunken wreck, rocks and anemones, the small life: each given an underwater copy by prepareUnderwater
  [[true, DoubleSide, .32], [false, FrontSide, .45], [false, DoubleSide, .25]].forEach(([flat, side, seabed]) => {
    const part = box(new MeshLambertMaterial({ vertexColors: true, flatShading: flat, side }));
    prepareUnderwater(part, ocean, lite, { bias: FLOOR_BIAS, seabed });
    root.add(part);
  });
  root.add(box(createKelpMaterial(ocean, lite)), box(createSeagrassMaterial(ocean, lite)));
  root.add(box(new MeshLambertMaterial({ color: new Color('#F4F2EE'), transparent: true, depthWrite: false, emissive: '#5A5A5A' })));
  root.add(new InstancedMesh(createTunaGeometry(lite), createSchoolMaterial(ocean, lite), 20));
  const islet = new Group(); islet.add(box(new MeshLambertMaterial({ vertexColors: true, flatShading: true })), box(new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide })));
  submerge(islet, ocean, lite);
  root.add(islet);
  return root;
}

for (const lite of [false, true]) {
  const quality = lite ? 'lite' : 'full';
  // Without a warm-up, the real scene links its programs as it is drawn.
  const cold = makeRenderer(), coldScene = makeScene();
  cold.compile(await realScene(lite), camera, coldScene);
  const needed = cold.info.programs.length;
  assert(needed >= 8, `${quality}: the real scene needs several programs (${needed})`);

  // With one, it finds them all.
  const renderer = makeRenderer(), scene = makeScene();
  // (full quality also draws the stand-ins, one kind at a time as the component does; lite leaves them drawn by the component's frames, below)
  const result = warmUp(renderer, scene, camera, { ocean, quality, habitats, school: true, draw: !lite });
  assert.deepEqual(new Set(result.kinds), new Set(kindsFor(habitats, true)), `${quality}: every kind for every island`);
  assert(result.added > 0 && result.programs === renderer.info.programs.length, `${quality}: the warm-up links programs`);
  const warmed = renderer.info.programs.length, known = new Set(renderer.info.programs.map((p) => normal(p.cacheKey)));
  renderer.compile(await realScene(lite), camera, scene);
  const missed = renderer.info.programs.filter((p) => !known.has(normal(p.cacheKey)));
  for (const p of missed) console.log('  not warmed:', p.cacheKey.slice(0, 60), '...', p.cacheKey.slice(-70));
  assert.equal(missed.length, 0, `${quality}: the real scene linked ${missed.length} program(s) the warm-up had not`);
  assert.equal(warmed, needed, `${quality}: the warm-up links exactly the programs the scene needs`);

  if (lite) { let drawn = 0; while (drawWarmed(renderer, scene, camera) !== null) drawn++; assert.equal(drawn, result.kinds.length, 'lite: a draw for each kind'); }
  assert.equal(drawWarmed(renderer, scene, camera), null, `${quality}: nothing left to draw`);
  // Warming again, or for kinds already done, links nothing.
  const before = renderer.info.programs.length;
  const again = warmUp(renderer, scene, camera, { ocean, quality, habitats, school: true });
  assert.deepEqual(again.kinds, []);
  assert.equal(again.added, 0);
  assert.equal(renderer.info.programs.length, before);
  assert.equal(warmedKinds(renderer).size, result.kinds.length);
  console.log(`${quality}: warm-up links ${warmed} programs (the real scene needs ${needed}), in ${result.ms.toFixed(1)} ms of JavaScript; the real scene then links 0 more, a second warm-up 0`);
}

// A scene's own kinds only: the card of a kelp forest needs no steam, and later ones are added on their own.
{
  const renderer = makeRenderer(), scene = makeScene();
  const kelp = warmUp(renderer, scene, camera, { ocean, habitats: ['kelp'], waters: 1 });
  assert(!kelp.kinds.includes('steam') && kelp.kinds.includes('kelp'));
  const volcano = warmUp(renderer, scene, camera, { ocean, habitats: ['kelp', 'volcanic'], waters: 1 });
  assert.deepEqual(volcano.kinds, ['steam']);
  console.log(`one island at a time: kelp ${kelp.added} programs, then the volcano's ${volcano.added} more`);
}
// One kind a frame (the explorer's idle warm-up): each step links one kind, and together they are the same programs as all at once.
{
  const renderer = makeRenderer(), scene = makeScene(), seen = [];
  let kind;
  while ((kind = warmNext(renderer, scene, camera, { ocean, habitats, school: true })) !== null) seen.push(kind);
  assert.deepEqual(new Set(seen), new Set(kindsFor(habitats, true)));
  assert.equal(seen.length, new Set(seen).size, 'each kind once');
  const all = makeRenderer(); warmUp(all, makeScene(), camera, { ocean, habitats, school: true, draw: true });
  assert.equal(renderer.info.programs.length, all.info.programs.length, 'a kind a frame links the same programs as all at once');
  assert.equal(warmNext(renderer, scene, camera, { ocean, habitats, school: true }), null);
  console.log(`a kind a frame: ${seen.length} steps, ${renderer.info.programs.length} programs, as all at once`);
}
assert(camera instanceof Camera);
console.log('warm-up: programs found ready by the real scene, once for each kind');
process.exit(0);
