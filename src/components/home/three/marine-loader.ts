import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { Mesh, MeshLambertMaterial, MeshStandardMaterial } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MarineModel } from '@/lib/swimming';

const modules: Record<MarineModel, number> = {
  'whale-shark': require('@/assets/models/marine/whale-shark.glb'),
  'tiger-shark': require('@/assets/models/marine/tiger-shark.glb'),
  'great-white-shark': require('@/assets/models/marine/great-white-shark.glb'),
  'scalloped-hammerhead': require('@/assets/models/marine/scalloped-hammerhead.glb'),
  'bottlenose-dolphin': require('@/assets/models/marine/bottlenose-dolphin.glb'),
  'mola-mola': require('@/assets/models/marine/mola-mola.glb'),
  'green-turtle': require('@/assets/models/marine/green-turtle.glb'),
  'reef-manta': require('@/assets/models/marine/reef-manta.glb'),
  'day-octopus': require('@/assets/models/marine/day-octopus.glb'),
  'giant-cuttlefish': require('@/assets/models/marine/giant-cuttlefish.glb'),
  'giant-moray': require('@/assets/models/marine/giant-moray.glb'),
  'great-barracuda': require('@/assets/models/marine/great-barracuda.glb'),
  sailfish: require('@/assets/models/marine/sailfish.glb'),
  'california-sea-lion': require('@/assets/models/marine/california-sea-lion.glb'),
  'spotted-eagle-ray': require('@/assets/models/marine/spotted-eagle-ray.glb'),
  'golden-jellyfish': require('@/assets/models/marine/golden-jellyfish.glb'),
  clownfish: require('@/assets/models/marine/clownfish.glb'),
  'humpback-whale': require('@/assets/models/marine/humpback-whale.glb'),
  'sperm-whale': require('@/assets/models/marine/sperm-whale.glb'),
  'oceanic-whitetip': require('@/assets/models/marine/oceanic-whitetip.glb'),
  'leatherback-turtle': require('@/assets/models/marine/leatherback-turtle.glb'),
  'oceanic-manta': require('@/assets/models/marine/oceanic-manta.glb'),
  'harbor-seal': require('@/assets/models/marine/harbor-seal.glb'),
  'sea-otter': require('@/assets/models/marine/sea-otter.glb'),
  garibaldi: require('@/assets/models/marine/garibaldi.glb'),
  'leafy-seadragon': require('@/assets/models/marine/leafy-seadragon.glb'),
  'marine-iguana': require('@/assets/models/marine/marine-iguana.glb'),
  'galapagos-shark': require('@/assets/models/marine/galapagos-shark.glb'),
  'thresher-shark': require('@/assets/models/marine/thresher-shark.glb'),
  'giant-trevally': require('@/assets/models/marine/giant-trevally.glb'),
  'king-angelfish': require('@/assets/models/marine/king-angelfish.glb'),
  dugong: require('@/assets/models/marine/dugong.glb'),
  sawfish: require('@/assets/models/marine/sawfish.glb'),
  'lemon-shark': require('@/assets/models/marine/lemon-shark.glb'),
  'southern-stingray': require('@/assets/models/marine/southern-stingray.glb'),
  tarpon: require('@/assets/models/marine/tarpon.glb'),
  'grey-reef-shark': require('@/assets/models/marine/grey-reef-shark.glb'),
  'blacktip-reef-shark': require('@/assets/models/marine/blacktip-reef-shark.glb'),
  'whitetip-reef-shark': require('@/assets/models/marine/whitetip-reef-shark.glb'),
  'hawksbill-turtle': require('@/assets/models/marine/hawksbill-turtle.glb'),
  'napoleon-wrasse': require('@/assets/models/marine/napoleon-wrasse.glb'),
  'bumphead-parrotfish': require('@/assets/models/marine/bumphead-parrotfish.glb'),
  'sand-tiger-shark': require('@/assets/models/marine/sand-tiger-shark.glb'),
  'loggerhead-turtle': require('@/assets/models/marine/loggerhead-turtle.glb'),
  'goliath-grouper': require('@/assets/models/marine/goliath-grouper.glb'),
  lionfish: require('@/assets/models/marine/lionfish.glb'),
  batfish: require('@/assets/models/marine/batfish.glb'),
  orca: require('@/assets/models/marine/orca.glb'),
  shark: require('@/assets/models/marine/shark.glb'),
  manta: require('@/assets/models/marine/manta.glb'),
  'reef-fish': require('@/assets/models/marine/reef-fish.glb'),
};

export type MarineModels = Partial<Record<MarineModel, GLTF>>;

async function readModel(module: number): Promise<ArrayBuffer> {
  const [asset] = await Asset.loadAsync(module);
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Marine asset request failed (${response.status})`);
    return response.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

function parseModel(buffer: ArrayBuffer): Promise<GLTF> {
  return new GLTFLoader().parseAsync(buffer, '').then((gltf) => {
    // These texture-free assets only need diffuse shading. Convert once per
    // cached asset so every skeleton clone shares the same lightweight material.
    const materials = new Map<MeshStandardMaterial, MeshLambertMaterial>();
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const converted = source.map((material) => {
        if (!(material instanceof MeshStandardMaterial)) return material;
        if (!materials.has(material)) materials.set(material, new MeshLambertMaterial({
          color: material.color, vertexColors: material.vertexColors, side: material.side,
          transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest,
          depthWrite: material.depthWrite, depthTest: material.depthTest,
        }));
        return materials.get(material)!;
      });
      object.material = Array.isArray(object.material) ? converted : converted[0];
    });
    materials.forEach((_, source) => source.dispose());
    return gltf;
  });
}

const pending = new Map<MarineModel, Promise<GLTF>>();
const loaded: MarineModels = {};

/** Return a snapshot only when all requested rigs are ready. */
export function getLoadedMarineModels(requested: readonly MarineModel[]): MarineModels | null {
  if (requested.some((model) => !loaded[model])) return null;
  return Object.fromEntries(requested.map((model) => [model, loaded[model]]));
}

function loadMarineModel(model: MarineModel): Promise<GLTF> {
  if (loaded[model]) return Promise.resolve(loaded[model]!);
  const existing = pending.get(model);
  if (existing) return existing;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Marine model ${model} took too long to load`)), 20000);
  });
  // Only the winning attempt writes the cache. A timed-out read may finish later,
  // but cannot overwrite a successful retry or remove its in-flight entry.
  const request = Promise.race([readModel(modules[model]).then(parseModel), timeout])
    .then((gltf) => { loaded[model] = gltf; return gltf; })
    .finally(() => {
      clearTimeout(timer);
      if (pending.get(model) === request) pending.delete(model);
    });
  pending.set(model, request);
  return request;
}

/** Parse only requested rigs, sharing successful assets and in-flight loads across scenes. */
export async function loadMarineModels(requested: readonly MarineModel[]): Promise<MarineModels> {
  return Object.fromEntries(await Promise.all([...new Set(requested)].map(async (model) => [model, await loadMarineModel(model)])));
}
