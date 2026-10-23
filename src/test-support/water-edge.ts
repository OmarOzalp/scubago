import { createShoreField, shoreDistance, shorePolygons, type IslandShape } from '@/lib/island-outline';
import { hullOf, marginOf, stanceOf, tooShallow } from '@/lib/marine-bodies';
import { MOVEMENT, STEEPEST_BOTTOM } from '@/lib/marine-motion';
import { createSeabed } from '@/lib/seabed';
import type { MarineModel } from '@/lib/swimming';

/**
 * How far from an island's shore (units; the median over the directions round it) the water first has room for a body: out from the
 * shore, the first place where all of it is over the bottom with its back under the surface (marine-bodies.ts, `tooShallow`). A
 * species that "keeps near the shore" keeps near this edge of its water, however far out the shelf's shallows push it.
 */
export function waterEdge(model: MarineModel, shape: IslandShape, level: number) {
  const seabed = createSeabed(level, shape), field = createShoreField(level, shape), polygons = shorePolygons(level, 24, shape);
  const hull = hullOf(model), stance = stanceOf(model);
  const shallow = tooShallow(seabed, field, hull, marginOf(hull), MOVEMENT[model].tilt ?? 0, stance.kind === 'bottom' ? STEEPEST_BOTTOM : Infinity);
  const firsts: number[] = [];
  for (let k = 0; k < 36; k++) {
    const ux = Math.cos(k * Math.PI / 18), uz = Math.sin(k * Math.PI / 18);
    for (let r = .3; r < 8; r += .05) {
      const d = shoreDistance(polygons, ux * r, uz * r);
      if (d > 0 && !shallow(ux * r, uz * r)) { firsts.push(d); break; }
    }
  }
  firsts.sort((a, b) => a - b);
  return firsts[firsts.length >> 1];
}
