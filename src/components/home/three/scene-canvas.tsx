import type { ComponentProps } from 'react';
import { Canvas } from '@react-three/fiber';
import { AMBIENT_FPS, FramePacer, FrameRateContext } from './frame-pacer';
import { ProgramKeeper } from './program-keeper';
import { sceneQuality, SceneQualityContext } from './scene-quality';
import { GovernorContext, useCanvasGovernor } from './governor';
import { CanvasDprContext } from './scene-performance';

/**
 * Browsers draw with the real GPU, so the scene runs at full quality unless a tier is forced. While its frameloop is
 * 'always' the scene draws `fps` times a second, 30 unless asked for more: it is ambient, and moves by the time between
 * frames, so animals swim at the same speed at any rate (frame-pacer.tsx). `fps` 60 or more draws at every refresh.
 */
export function SceneCanvas({ children, frameloop = 'always', fps = AMBIENT_FPS, dpr, ...props }: ComponentProps<typeof Canvas> & { fps?: number }) {
  const paced = frameloop === 'always' && fps < 60;
  // The quality governor (governor.tsx) scales the resolution asked for (or the browser's own) by its level's share of a phone's 2.
  const { governor, level } = useCanvasGovernor();
  const base = typeof dpr === 'number' ? dpr : typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return <Canvas {...props} dpr={dpr === undefined && level.dpr === 2 ? undefined : base * level.dpr / 2} frameloop={paced ? 'demand' : frameloop}>
    <FrameRateContext.Provider value={paced ? fps : 60}>
      <SceneQualityContext.Provider value={sceneQuality(false)}><GovernorContext.Provider value={governor}><CanvasDprContext.Provider value={dpr === undefined && level.dpr === 2 ? null : base * level.dpr / 2}>{children}</CanvasDprContext.Provider></GovernorContext.Provider></SceneQualityContext.Provider>
    </FrameRateContext.Provider>
    {paced && <FramePacer fps={fps} />}
    <ProgramKeeper />
  </Canvas>;
}
