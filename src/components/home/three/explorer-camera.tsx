import { useContext, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from 'three';
import { zoomRange, type Explorer } from '@/lib/explorer-view';
import { OceanContext } from './ocean-context';
import type { OceanUniforms } from './ocean-mesh';
import { useGovernor } from './governor';
import { useFrameRate } from './frame-pacer';

/**
 * The explorer's camera (src/app/explore.tsx): the island camera's angle, over the spot and at the
 * zoom the explorer's gestures and buttons have set (explorer-view.ts), read every frame. The view
 * is in screen points; on native the GL canvas is drawn at a reduced size and scaled up
 * (scene-canvas.native.tsx), so the zoom is converted to the canvas's own pixels. While it is open
 * there is no haze: the Home card's top and bottom fade into its background, but the explorer's
 * water reaches past every edge of the screen (EXPLORER.reach). It must sit inside the island's
 * environment (it changes the water's haze). The island draws only on demand while its animals are
 * still (reduced motion, or still loading), so every move asks for a frame, and a glide or an eased
 * move keeps asking until it settles, as does a finger on the screen: those draw at every refresh,
 * the rest of the time the scene draws 30 times a second (frame-pacer.tsx). Pulled back over several
 * islands, the sea is seen as from high above (`uOceanCalm`, between the zooms in `CALM`, relative to all the way out): the waves' glints
 * gather into drifting wind patches instead of repeating stripes, and whitecaps fleck the deep water;
 * closing in on an island brings the waves back as they are close up.
 */
const CALM = { from: 1.05, to: 1.45 };
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How far the sea is seen as from high above: 0 close up, 1 all the way out over the archipelago. */
function calmWater(ocean: OceanUniforms, calm: number) {
  ocean.uOceanCalm.value = calm;
}

export function ExplorerCamera({ explorer }: { explorer: Explorer }) {
  const ocean = useContext(OceanContext);
  const width = useThree((state) => state.size.width);
  const invalidate = useThree((state) => state.invalidate);
  // A phone whose JavaScript cannot keep up draws a steady 30 a second under a finger too (the quality governor's JS ladder): the paced frames only.
  // (only while the pacer draws 30 a second: a still scene, Reduce Motion, draws only on demand and must still follow the finger)
  const governor = useGovernor(), paced = useFrameRate() < 60;
  const everyRefresh = () => !paced || (governor?.jsCurrent().touchFps ?? 60) >= 60;
  useEffect(() => explorer.watch(() => { if (everyRefresh()) invalidate(); }), [explorer, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps
  // No haze (it begins past the screen's edge), and the card's comes back when the explorer closes.
  useLayoutEffect(() => {
    if (!ocean) return;
    const edge = ocean.uOceanEdge.value, before = edge.clone();
    edge.set(2, 3);
    return () => { edge.copy(before); calmWater(ocean, 0); };
  }, [ocean]);
  useFrame(({ camera }, delta) => {
    if (!(camera instanceof OrthographicCamera)) return;
    const view = explorer.step(delta), points = Math.max(1, explorer.frame.width);
    camera.position.set(view.x, 12, view.z + 6);
    camera.zoom = view.zoom * width / points;
    camera.lookAt(view.x, -.15, view.z);
    camera.updateProjectionMatrix();
    // How far in from the whole archipelago (1 = all the way out); with one island, always its full detail.
    if (ocean) calmWater(ocean, (explorer.frame.islands?.length ?? 1) > 1 ? 1 - smoothstep(CALM.from, CALM.to, view.zoom / zoomRange(explorer.frame).min) : 0);
    // Drawn at every refresh while a finger is down or the view eases or glides (ambient frames are 30 a second, frame-pacer.tsx).
    if ((explorer.moving || explorer.touching) && everyRefresh()) invalidate();
  });
  return null;
}
