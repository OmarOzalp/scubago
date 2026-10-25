// Three 0.186's ESM entry is outside this Expo Jest transform. Keep the loader
// real and substitute only its scene/material boundary (no renderer is needed).
jest.mock('three', () => {
  class MeshStandardMaterial { constructor(values) { Object.assign(this, values); } dispose() {} }
  class MeshLambertMaterial { constructor(values) { Object.assign(this, values); } }
  class Mesh { constructor(geometry, material) { this.material = material; } }
  class Group { children = []; add(mesh) { this.children.push(mesh); } traverse(visit) { this.children.forEach(visit); } }
  class SkinnedMesh extends Mesh { normalizeSkinWeights() { this.renormalized = true; } }
  return { MeshStandardMaterial, MeshLambertMaterial, Mesh, SkinnedMesh, Group, BufferGeometry: class {}, DoubleSide: 2 };
});
jest.mock('expo-asset', () => ({ Asset: { loadAsync: jest.fn() } }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: jest.fn() }));
jest.mock('@/assets/models/marine/shark.glb', () => 1);
jest.mock('@/assets/models/marine/manta.glb', () => 2);
jest.mock('@/assets/models/marine/reef-fish.glb', () => 3);
jest.mock('@/assets/models/marine/whale-shark.glb', () => 4, { virtual: true });
jest.mock('@/assets/models/marine/tiger-shark.glb', () => 5, { virtual: true });
jest.mock('@/assets/models/marine/reef-manta.glb', () => 6, { virtual: true });
jest.mock('@/assets/models/marine/great-white-shark.glb', () => 7, { virtual: true });
jest.mock('@/assets/models/marine/mola-mola.glb', () => 8, { virtual: true });
jest.mock('@/assets/models/marine/green-turtle.glb', () => 9, { virtual: true });
jest.mock('@/assets/models/marine/scalloped-hammerhead.glb', () => 10, { virtual: true });
jest.mock('@/assets/models/marine/bottlenose-dolphin.glb', () => 11, { virtual: true });
jest.mock('@/assets/models/marine/day-octopus.glb', () => 12, { virtual: true });
jest.mock('@/assets/models/marine/giant-cuttlefish.glb', () => 13, { virtual: true });
jest.mock('@/assets/models/marine/giant-moray.glb', () => 14, { virtual: true });
jest.mock('@/assets/models/marine/great-barracuda.glb', () => 15, { virtual: true });
jest.mock('@/assets/models/marine/sailfish.glb', () => 16, { virtual: true });
jest.mock('@/assets/models/marine/california-sea-lion.glb', () => 17, { virtual: true });
jest.mock('@/assets/models/marine/spotted-eagle-ray.glb', () => 18, { virtual: true });
jest.mock('@/assets/models/marine/golden-jellyfish.glb', () => 19, { virtual: true });
jest.mock('@/assets/models/marine/clownfish.glb', () => 20, { virtual: true });
jest.mock('@/assets/models/marine/humpback-whale.glb', () => 21, { virtual: true });
jest.mock('@/assets/models/marine/sperm-whale.glb', () => 22, { virtual: true });
jest.mock('@/assets/models/marine/oceanic-whitetip.glb', () => 23, { virtual: true });
jest.mock('@/assets/models/marine/leatherback-turtle.glb', () => 24, { virtual: true });
jest.mock('@/assets/models/marine/oceanic-manta.glb', () => 25, { virtual: true });
jest.mock('@/assets/models/marine/harbor-seal.glb', () => 26, { virtual: true });
jest.mock('@/assets/models/marine/sea-otter.glb', () => 27, { virtual: true });
jest.mock('@/assets/models/marine/garibaldi.glb', () => 28, { virtual: true });
jest.mock('@/assets/models/marine/leafy-seadragon.glb', () => 29, { virtual: true });
jest.mock('@/assets/models/marine/orca.glb', () => 30, { virtual: true });
jest.mock('@/assets/models/marine/marine-iguana.glb', () => 31, { virtual: true });
jest.mock('@/assets/models/marine/galapagos-shark.glb', () => 32, { virtual: true });
jest.mock('@/assets/models/marine/thresher-shark.glb', () => 33, { virtual: true });
jest.mock('@/assets/models/marine/giant-trevally.glb', () => 34, { virtual: true });
jest.mock('@/assets/models/marine/king-angelfish.glb', () => 35, { virtual: true });
jest.mock('@/assets/models/marine/dugong.glb', () => 36, { virtual: true });
jest.mock('@/assets/models/marine/sawfish.glb', () => 37, { virtual: true });
jest.mock('@/assets/models/marine/lemon-shark.glb', () => 38, { virtual: true });
jest.mock('@/assets/models/marine/southern-stingray.glb', () => 39, { virtual: true });
jest.mock('@/assets/models/marine/tarpon.glb', () => 40, { virtual: true });
jest.mock('@/assets/models/marine/grey-reef-shark.glb', () => 41, { virtual: true });
jest.mock('@/assets/models/marine/blacktip-reef-shark.glb', () => 42, { virtual: true });
jest.mock('@/assets/models/marine/whitetip-reef-shark.glb', () => 43, { virtual: true });
jest.mock('@/assets/models/marine/hawksbill-turtle.glb', () => 44, { virtual: true });
jest.mock('@/assets/models/marine/napoleon-wrasse.glb', () => 45, { virtual: true });
jest.mock('@/assets/models/marine/bumphead-parrotfish.glb', () => 46, { virtual: true });
jest.mock('@/assets/models/marine/sand-tiger-shark.glb', () => 47, { virtual: true });
jest.mock('@/assets/models/marine/loggerhead-turtle.glb', () => 48, { virtual: true });
jest.mock('@/assets/models/marine/goliath-grouper.glb', () => 49, { virtual: true });
jest.mock('@/assets/models/marine/lionfish.glb', () => 50, { virtual: true });
jest.mock('@/assets/models/marine/batfish.glb', () => 51, { virtual: true });

let loader, Asset, parse, THREE;
beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  THREE = require('three');
  Asset = require('expo-asset').Asset;
  Asset.loadAsync.mockResolvedValue([{ localUri: 'file://model.glb' }]);
  require('expo-file-system').File.mockImplementation(() => ({ arrayBuffer: async () => new ArrayBuffer(0) }));
  parse = jest.fn(async () => ({ scene: new THREE.Group(), animations: [] }));
  require('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader.mockImplementation(() => ({ parseAsync: parse }));
  loader = require('@/components/home/three/marine-loader');
});
afterEach(() => jest.useRealTimers());

test('loads only requested models and deduplicates concurrent and cached requests', async () => {
  const [first, second] = await Promise.all([
    loader.loadMarineModels(['whale-shark', 'whale-shark']),
    loader.loadMarineModels(['whale-shark', 'tiger-shark']),
  ]);
  expect(Object.keys(first)).toEqual(['whale-shark']);
  expect(first['whale-shark']).toBe(second['whale-shark']);
  expect(Asset.loadAsync.mock.calls.map(([module]) => module)).toEqual([4, 5]);
  expect(loader.getLoadedMarineModels(['reef-manta'])).toBeNull();
  const cached = await loader.loadMarineModels(['whale-shark']);
  expect(cached['whale-shark']).toBe(first['whale-shark']);
  expect(Asset.loadAsync).toHaveBeenCalledTimes(2);
  expect(await loader.loadMarineModels([])).toEqual({});
});

test('a failed request retries without throwing away other cached models', async () => {
  const first = await loader.loadMarineModels(['shark']);
  Asset.loadAsync.mockRejectedValueOnce(new Error('offline'));
  await expect(loader.loadMarineModels(['tiger-shark'])).rejects.toThrow('offline');
  await expect(loader.loadMarineModels(['tiger-shark'])).resolves.toHaveProperty('tiger-shark');
  expect(loader.getLoadedMarineModels(['shark']).shark).toBe(first.shark);
});

test('a timed-out parse cannot replace the cache populated by a retry', async () => {
  let finishOld;
  parse.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
  const old = loader.loadMarineModels(['reef-manta']);
  const rejected = expect(old).rejects.toThrow('took too long');
  await jest.advanceTimersByTimeAsync(20000);
  await rejected;
  const fresh = await loader.loadMarineModels(['reef-manta']);
  finishOld({ scene: new THREE.Group(), animations: [] });
  await Promise.resolve();
  await Promise.resolve();
  expect(loader.getLoadedMarineModels(['reef-manta'])['reef-manta']).toBe(fresh['reef-manta']);
});

test('Lambert conversion retains vertex markings and transparent double-sided fins', async () => {
  const material = new THREE.MeshStandardMaterial({ color: '#778899', vertexColors: true, opacity: .75, transparent: true, side: THREE.DoubleSide, alphaTest: .1, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const scene = new THREE.Group();
  scene.add(mesh);
  parse.mockResolvedValueOnce({ scene, animations: [] });
  await loader.loadMarineModels(['whale-shark']);
  expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
  expect(mesh.material.vertexColors).toBe(true);
  expect(mesh.material.color).toBe(material.color);
  expect(mesh.material.opacity).toBe(.75);
  expect(mesh.material.transparent).toBe(true);
  expect(mesh.material.side).toBe(THREE.DoubleSide);
  expect(mesh.material.alphaTest).toBe(.1);
  expect(mesh.material.depthWrite).toBe(false);
});

test('while models parse, the loader keeps their skin weights as stored, and renormalizes again after', async () => {
  const renormalize = THREE.SkinnedMesh.prototype.normalizeSkinWeights;
  const built = [];
  let finish;
  // As GLTFLoader does: each skinned mesh it builds is renormalized.
  parse.mockImplementation(() => new Promise((resolve) => {
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({}));
    mesh.normalizeSkinWeights();
    built.push(mesh);
    const scene = new THREE.Group();
    scene.add(mesh);
    if (!finish) finish = () => resolve({ scene, animations: [] });
    else resolve({ scene, animations: [] });
  }));
  const slow = loader.loadMarineModels(['whale-shark']);
  // Another parse begins and ends while the first is still under way: still skipped for the first.
  await loader.loadMarineModels(['tiger-shark']);
  expect(THREE.SkinnedMesh.prototype.normalizeSkinWeights).not.toBe(renormalize);
  finish();
  await slow;
  expect(built.map((mesh) => !!mesh.renormalized)).toEqual([false, false]);
  expect(THREE.SkinnedMesh.prototype.normalizeSkinWeights).toBe(renormalize);
  // A failed parse puts it back too.
  parse.mockRejectedValueOnce(new Error('bad file'));
  await expect(loader.loadMarineModels(['reef-manta'])).rejects.toThrow('bad file');
  expect(THREE.SkinnedMesh.prototype.normalizeSkinWeights).toBe(renormalize);
});
