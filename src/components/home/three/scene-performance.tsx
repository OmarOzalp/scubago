import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';

/** Development-only JS frame timing; Expo GL may present later on its native queue. */
export function ScenePerformance({ ready, active }: { ready: boolean; active: boolean }) {
  const [started] = useState(() => performance.now());
  const sample = useRef({ first: false, frames: 0, seconds: 0, slow: 0 });
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
    if (delta > .025) value.slow++;
    if (value.frames === 122) console.info(`[island] 120 JS frames: ${Math.round(120 / value.seconds)}fps scheduled (not display FPS); ${value.slow} frames over 25ms; ${gl.info.render.calls} draw calls; ${gl.info.render.triangles} triangles`);
  });
  return null;
}
