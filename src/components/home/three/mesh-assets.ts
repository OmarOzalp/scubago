import { isDevice } from 'expo-device';
import { Platform } from 'react-native';
import type { Habitat } from '@/lib/home';
import { readAssetBytes } from './asset-bytes';
import { habitatMeshKeys } from './mesh-keys';
import { MESH_FILES } from './mesh-pack-files';
import { hasShippedMesh, readMeshesWith, registerShippedMesh } from './mesh-store';
import { sceneQuality } from './scene-quality';

/**
 * The meshes shipped with the app (mesh-store.ts), read from the app's own files by key, once each, ahead of the scene that wants them: with an island's
 * seabed (seabed-assets.ts), whose wait the scene already makes. A file that cannot be read is a mesh made as before. Only the full quality tier ships
 * anything: a simulator's lite scene makes its own.
 */
const requests = new Map<string, Promise<boolean>>();

/** Whether this device draws the full tier (as the scene's canvas decides). */
const shipsMeshes = () => sceneQuality(Platform.OS !== 'web' && !isDevice) === 'full';

/** Read (once) the file for this key. True once it is held; false where nothing ships for it or it could not be read. */
export function loadShippedMesh(key: string): Promise<boolean> {
  if (hasShippedMesh(key)) return Promise.resolve(true);
  const module = MESH_FILES[key];
  if (module === undefined) return Promise.resolve(false);
  let request = requests.get(key);
  if (!request) {
    request = readAssetBytes(module).then((bytes) => {
      registerShippedMesh(key, new Uint8Array(bytes));
      return true;
    }).catch((error) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`the shipped mesh for ${key} could not be read; making it instead`, error);
      return false;
    });
    requests.set(key, request);
  }
  return request;
}

/** Read the files for an island's coast and what grows on it at this level (they are held for the scene when it builds them). Never rejects. */
export function loadIslandMeshes(habitat: Habitat, level: number): Promise<void> {
  if (!shipsMeshes()) return Promise.resolve();
  return Promise.all(habitatMeshKeys(habitat, level).map(loadShippedMesh)).then(() => undefined);
}

// (a staged scene asks for the file of a mesh as the step that makes it is registered: mesh-store.ts's `wantMesh`)
readMeshesWith((key) => { if (shipsMeshes()) void loadShippedMesh(key); });
