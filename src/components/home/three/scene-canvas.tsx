import type { ComponentProps } from 'react';
import { Canvas } from '@react-three/fiber';
import { sceneQuality, SceneQualityContext } from './scene-quality';

/** Browsers draw with the real GPU, so the scene runs at full quality unless a tier is forced. */
export function SceneCanvas({ children, ...props }: ComponentProps<typeof Canvas>) {
  return <Canvas {...props}>
    <SceneQualityContext.Provider value={sceneQuality(false)}>{children}</SceneQualityContext.Provider>
  </Canvas>;
}
