import { useEffect, useRef, useState } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';

/**
 * Development-only frame timing. Expo GL draws on its own queue after the JS
 * work returns, so this reports how often frames were scheduled and how much
 * JS-thread time each took (every frame callback plus three.js issuing its
 * draw calls), not the displayed frame rate. The native simulator paces its
 * frames to the GL queue (at least 50ms apart), so its scheduled rate is low
 * by design.
 */
export function ScenePerformance({ ready, active }: { ready: boolean; active: boolean }) {
  const [started] = useState(() => performance.now());
  const gl = useThree((state) => state.gl);
  const sample = useRef({ first: false, frames: 0, seconds: 0, frameStart: 0, js: 0, jsMax: 0 });
  // Runs once every root has rendered, closing the measurement the frame callback opened.
  useEffect(() => addAfterEffect(() => {
    const value = sample.current;
    if (!value.frameStart) return;
    const ms = performance.now() - value.frameStart;
    value.frameStart = 0;
    value.js += ms;
    value.jsMax = Math.max(value.jsMax, ms);
    if (value.frames === 122) console.info(`[island] 120 JS frames: ${Math.round(120 / value.seconds)}fps scheduled (not display FPS); JS ${(value.js / 120).toFixed(1)}ms avg, ${Math.round(value.jsMax)}ms max per frame; ${gl.info.render.calls} draw calls; ${gl.info.render.triangles} triangles`);
  }), [gl]);
  // The lowest priority, so this runs before the scene's other frame callbacks.
  useFrame((_, delta) => {
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
    value.frameStart = performance.now();
  }, -10);
  return null;
}
