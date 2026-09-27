import { createContext, useContext } from 'react';

/**
 * How much GPU work the 3D scene may do. 'lite' keeps the look but draws the
 * ocean as one cheap layer and skips per-vertex wave work on the animals, for
 * GPUs emulated in software (the iOS simulator and Android emulator).
 */
export type SceneQuality = 'full' | 'lite';

export const SceneQualityContext = createContext<SceneQuality>('full');
export const useSceneQuality = () => useContext(SceneQualityContext);

/** `EXPO_PUBLIC_SCENE_QUALITY=lite` or `full` forces a tier anywhere, for comparing the two. */
export function sceneQuality(emulated: boolean): SceneQuality {
  const forced = process.env.EXPO_PUBLIC_SCENE_QUALITY;
  if (forced === 'lite' || forced === 'full') return forced;
  return emulated ? 'lite' : 'full';
}
