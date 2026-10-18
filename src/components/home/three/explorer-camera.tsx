import { useContext, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from 'three';
import { hazeFor, type Explorer } from '@/lib/explorer-view';
import { OceanContext } from './ocean-context';

/**
 * The explorer's camera (src/app/explore.tsx): the island camera's angle, over the spot and at the
 * zoom the explorer's gestures and buttons have set (explorer-view.ts), read every frame. The view
 * is in screen points; on native the GL canvas is drawn at a reduced size and scaled up
 * (scene-canvas.native.tsx), so the zoom is converted to the canvas's own pixels. While it is open,
 * the top and bottom of the view barely haze over (the explorer fills the screen, not a card), until
 * zoomed out far enough to see past the water's near and far edges, when the haze meets them
 * (hazeFor). It must sit inside the island's environment (it changes the water's haze). The island
 * draws only on demand while its animals are still (reduced motion, or still loading), so every
 * move asks for a frame, and a glide or an eased move keeps asking until it settles.
 */
export function ExplorerCamera({ explorer }: { explorer: Explorer }) {
  const ocean = useContext(OceanContext);
  const width = useThree((state) => state.size.width);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => explorer.watch(() => invalidate()), [explorer, invalidate]);
  // The card's haze comes back when the explorer closes.
  useLayoutEffect(() => {
    if (!ocean) return;
    const edge = ocean.uOceanEdge.value, before = edge.clone();
    return () => { edge.copy(before); };
  }, [ocean]);
  useFrame(({ camera }, delta) => {
    if (!(camera instanceof OrthographicCamera)) return;
    const view = explorer.step(delta), points = Math.max(1, explorer.frame.width);
    camera.position.set(view.x, 12, view.z + 6);
    camera.zoom = view.zoom * width / points;
    camera.lookAt(view.x, -.15, view.z);
    camera.updateProjectionMatrix();
    if (ocean) { const [from, to] = hazeFor(explorer.frame, view); ocean.uOceanEdge.value.set(from, to); }
    if (explorer.moving) invalidate();
  });
  return null;
}
