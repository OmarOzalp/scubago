import { Shape } from 'three';
import { OUTLINES, SHORELINE, type IslandShape } from '@/lib/island-outline';

export { islandScale, islets, shoreDistance, shorePolygons } from '@/lib/island-outline';

/** An island's dry-sand outline in its own plane (x, y), before the -90° rotation into the scene. */
export function shoreline(island: IslandShape = 'reef') {
  const shape = new Shape(), curves = OUTLINES[island];
  shape.moveTo(...curves[0][0]);
  for (const [, c1, c2, end] of curves) shape.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);
  return shape;
}

/** Segments per curve for an island's outline: as many in all as the reef's five curves get with `perCurve`. */
export const curveSegments = (island: IslandShape, perCurve: number) => Math.max(3, Math.round(perCurve * SHORELINE.length / OUTLINES[island].length));
