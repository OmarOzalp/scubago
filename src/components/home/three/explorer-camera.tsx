import { useContext, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from 'three';
import type { Explorer } from '@/lib/explorer-view';
import { OceanContext } from './ocean-context';

/**
 * The explorer's camera (src/app/explore.tsx): the island camera's angle, over the spot and at the
 * zoom the explorer's gestures and buttons have set (explorer-view.ts), read every frame. The view
 * is in screen points; on native the GL canvas is drawn at a reduced size and scaled up
 * (scene-canvas.native.tsx), so the zoom is converted to the canvas's own pixels. While it is open
 * there is no haze: the Home card's top and bottom fade into its background, but the explorer's
 * water reaches past every edge of the screen (EXPLORER.reach). It must sit inside the island's
 * environment (it changes the water's haze). The island draws only on demand while its animals are
 * still (reduced motion, or still loading), so every move asks for a frame, and a glide or an eased
 * move keeps asking until it settles.
 */
export function ExplorerCamera({ explorer }: { explorer: Explorer }) {
  const ocean = useContext(OceanContext);
  const width = useThree((state) => state.size.width);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => explorer.watch(() => invalidate()), [explorer, invalidate]);
  // No haze (it begins past the screen's edge), and the card's comes back when the explorer closes.
  useLayoutEffect(() => {
    if (!ocean) return;
    const edge = ocean.uOceanEdge.value, before = edge.clone();
    edge.set(2, 3);
    return () => { edge.copy(before); };
  }, [ocean]);
  useFrame(({ camera }, delta) => {
    if (!(camera instanceof OrthographicCamera)) return;
    const view = explorer.step(delta), points = Math.max(1, explorer.frame.width);
    camera.position.set(view.x, 12, view.z + 6);
    camera.zoom = view.zoom * width / points;
    camera.lookAt(view.x, -.15, view.z);
    camera.updateProjectionMatrix();
    if (explorer.moving) invalidate();
  });
  return null;
}
