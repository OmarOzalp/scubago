import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree, type RootState } from '@react-three/fiber';
import { OrthographicCamera } from 'three';
import { OCEAN_GROWTH } from '@/lib/steering';

/** Fit the view: the swimming area at `scale` (1 at the first level) across the canvas's shorter side. */
function fit({ camera, size, invalidate }: RootState, inspect: boolean, scale: number) {
  if (!(camera instanceof OrthographicCamera)) return;
  camera.zoom = Math.max(1, Math.min(size.width, size.height)) / (inspect ? 6 : 10.8 * scale);
  camera.lookAt(0, inspect ? .2 : -.15, 0);
  camera.updateProjectionMatrix();
  invalidate();
}

/**
 * Keep the whole swimming area in frame at phone, tablet and browser sizes. `scale` pulls the view
 * back as the ocean grows with the island's level (oceanScale in steering.ts); a change eases in at
 * the same pace as the animals' space widens, so nothing jumps.
 */
export function SceneCamera({ inspect = false, scale = 1 }: { inspect?: boolean; scale?: number }) {
  const get = useThree((state) => state.get);
  const width = useThree((state) => state.size.width), height = useThree((state) => state.size.height);
  const shown = useRef(scale);
  // R3F owns the mutable Three camera; update it after React commits the viewport.
  useLayoutEffect(() => { fit(get(), inspect, shown.current); }, [get, width, height, inspect]);
  useFrame((state, delta) => {
    const gap = scale - shown.current;
    if (Math.abs(gap) < 1e-4) return;
    // A long or out-of-order frame never makes the view jump.
    const dt = Math.max(0, Math.min(delta, .1));
    shown.current = Math.abs(gap) < 2e-3 ? scale : shown.current + gap * (1 - Math.exp(-OCEAN_GROWTH.ease * dt));
    fit(state, inspect, shown.current);
  });
  return null;
}
