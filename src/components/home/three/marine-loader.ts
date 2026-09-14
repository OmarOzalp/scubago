import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MarineModel } from '@/lib/swimming';

const modules: Record<MarineModel, number> = {
  shark: require('@/assets/models/marine/shark.glb'),
  manta: require('@/assets/models/marine/manta.glb'),
  'reef-fish': require('@/assets/models/marine/reef-fish.glb'),
};

export type MarineModels = Record<MarineModel, GLTF>;

async function readModel(module: number): Promise<ArrayBuffer> {
  const [asset] = await Asset.loadAsync(module);
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

function parseModel(buffer: ArrayBuffer): Promise<GLTF> {
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
}

let pending: Promise<MarineModels> | null = null;

/**
 * Loads and parses the three bundled rigs once for the whole app, bypassing
 * three's URL-based loaders so the same code path serves dev, release and web.
 * A failed load clears the cache so the next scene mount can retry.
 */
export function loadMarineModels(): Promise<MarineModels> {
  if (!pending) {
    pending = Promise.all(
      (['shark', 'manta', 'reef-fish'] as const).map((model) => readModel(modules[model]).then(parseModel)),
    )
      .then(([shark, manta, reefFish]) => ({ shark, manta, 'reef-fish': reefFish }))
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}
