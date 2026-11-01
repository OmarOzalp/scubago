import type { ComponentProps } from 'react';
import { Canvas } from '@react-three/fiber';
import { AMBIENT_FPS, FramePacer, FrameRateContext } from './frame-pacer';
import { ProgramKeeper } from './program-keeper';
import { sceneQuality, SceneQualityContext } from './scene-quality';

/**
 * Browsers draw with the real GPU, so the scene runs at full quality unless a tier is forced. While its frameloop is
 * 'always' the scene draws `fps` times a second, 30 unless asked for more: it is ambient, and moves by the time between
 * frames, so animals swim at the same speed at any rate (frame-pacer.tsx). `fps` 60 or more draws at every refresh.
 */
export function SceneCanvas({ children, frameloop = 'always', fps = AMBIENT_FPS, ...props }: ComponentProps<typeof Canvas> & { fps?: number }) {
  const paced = frameloop === 'always' && fps < 60;
  return <Canvas {...props} frameloop={paced ? 'demand' : frameloop}>
    <FrameRateContext.Provider value={paced ? fps : 60}>
      <SceneQualityContext.Provider value={sceneQuality(false)}>{children}</SceneQualityContext.Provider>
    </FrameRateContext.Provider>
    {paced && <FramePacer fps={fps} />}
    <ProgramKeeper />
  </Canvas>;
}
