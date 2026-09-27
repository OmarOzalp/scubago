import { Shape } from 'three';
import { SHORELINE } from '@/lib/island-outline';

export { islandScale, islets, shoreDistance, shorePolygons } from '@/lib/island-outline';

/** The island's dry-sand outline in its own plane (x, y), before the -90° rotation into the scene. */
export function shoreline() {
  const shape = new Shape();
  shape.moveTo(...SHORELINE[0][0]);
  for (const [, c1, c2, end] of SHORELINE) shape.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);
  return shape;
}
