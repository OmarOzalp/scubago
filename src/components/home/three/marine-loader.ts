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
