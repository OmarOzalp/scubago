import { Asset } from 'expo-asset';
import type { MarineModel } from '@/lib/swimming';

const modules: Record<MarineModel, number> = {
  shark: require('@/assets/models/marine/shark.glb'),
  manta: require('@/assets/models/marine/manta.glb'),
  'reef-fish': require('@/assets/models/marine/reef-fish.glb'),
};

export function marineAssetUri(model: MarineModel) {
  return Asset.fromModule(modules[model]).uri;
}
