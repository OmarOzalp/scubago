import { useEffect, useRef, useState } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { islandFrameStats, slowFrameMs } from '@/lib/frame-stats';
import { useFrameRate } from './frame-pacer';
import { useSceneQuality } from './scene-quality';

/** Development-only JS frame timing; Expo GL may present later on its native queue. */
export function ScenePerformance({ ready, active }: { ready: boolean; active: boolean }) {
  const [started] = useState(() => performance.now());
  const sample = useRef({ first: false, frames: 0, seconds: 0, slow: 0 });
  const late = slowFrameMs(useFrameRate()) / 1000;
  useFrame(({ gl }, delta) => {
    const value = sample.current;
    if (!value.first) {
      value.first = true;
      console.info(`[island] first scene frame: ${Math.round(performance.now() - started)}ms after mount`);
    }
    if (!ready || !active || value.frames >= 122) return;
    value.frames++;
    // Skip the first two frames, which include shader compilation and rig attachment.
    if (value.frames <= 2) return;
    value.seconds += delta;
    if (delta > late) value.slow++;
    if (value.frames === 122) console.info(`[island] 120 JS frames: ${Math.round(120 / value.seconds)}fps scheduled (not display FPS); ${value.slow} frames over ${Math.round(late * 1000)}ms; ${gl.info.render.calls} draw calls; ${gl.info.render.triangles} triangles`);
  });
  return null;
}

/**
 * On-device readout (EXPO_PUBLIC_ISLAND_PERF=1, the EAS preview profile): per frame, the JS time from
 * the first frame callback until three.js has issued its draw calls, the renderer's counts, and about
 * once a second how long Expo GL's queue takes to finish the frame (a GPU-bound frame shows up there,
 * not in JS time). Feeds islandFrameStats for the badge drawn over the card.
 */
export function IslandPerfProbe() {
  const gl = useThree((state) => state.gl);
  const quality = useSceneQuality();
  const fps = useFrameRate();
  const timing = useRef({ start: 0, last: 0, sampled: 0 });
  // Runs before every other frame callback (the motion steps at -1).
  useFrame(() => { timing.current.start = performance.now(); }, -1000);
  useEffect(() => addAfterEffect(() => {
    const value = timing.current;
    if (!value.start) return;
    const now = performance.now(), js = now - value.start;
    value.start = 0;
    if (now - value.sampled > 1000) {
      value.sampled = now;
      const flush = (gl.getContext() as { flushEXP?: () => void }).flushEXP;
      if (flush) {
        const before = performance.now();
        flush.call(gl.getContext());
        islandFrameStats.gl(performance.now() - before);
      }
    }
    if (value.last) islandFrameStats.frame((now - value.last) / 1000, js, gl.info.render.calls, gl.info.render.triangles, quality, fps);
    value.last = now;
  }), [gl, quality, fps]);
  return null;
}
