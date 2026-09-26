import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera } from 'three';

/** Keep the whole swimming area in frame at phone, tablet and browser sizes. */
export function SceneCamera({ inspect = false }: { inspect?: boolean }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    // R3F owns this mutable Three camera; update it after React commits the viewport.
    // eslint-disable-next-line react-hooks/immutability
    camera.zoom = Math.max(1, Math.min(size.width, size.height)) / (inspect ? 6 : 10.8);
    camera.lookAt(0, inspect ? .2 : -.15, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, inspect, invalidate]);
  return null;
}
