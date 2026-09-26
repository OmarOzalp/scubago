import { Shape } from 'three';

/** The island's dry-sand outline in its own plane (x, y), before the -90° rotation into the scene. */
export function shoreline() {
  const shape = new Shape();
  shape.moveTo(-2.1, -.1);
  shape.bezierCurveTo(-2.25, .85, -1.3, 1.5, -.35, 1.42);
  shape.bezierCurveTo(.3, 1.38, .5, .98, 1.12, 1.02);
  shape.bezierCurveTo(2.02, 1.07, 2.32, .25, 1.9, -.42);
  shape.bezierCurveTo(1.55, -.98, .75, -1.16, .15, -1.36);
  shape.bezierCurveTo(-.92, -1.65, -1.96, -1.07, -2.1, -.1);
  return shape;
}

/** The island grows slightly with each level. */
export const islandScale = (level: number) => 1 + (level - 1) * .025;

/** Small islets that appear at higher levels: position and scale inside the island group. */
export function islets(level: number): { position: [number, number]; scale: number }[] {
  return [
    ...(level >= 5 ? [{ position: [2.65, -2] as [number, number], scale: .3 }] : []),
    ...(level >= 6 ? [{ position: [-2.8, 2.1] as [number, number], scale: .26 }] : []),
  ];
}

/** Every dry shoreline at this level as world-space (x, z) polygons. */
export function shorePolygons(level: number) {
  const outline = shoreline().getPoints(24);
  const group = islandScale(level);
  const toWorld = (scale: number, [ox, oz]: [number, number]) => {
    const points = new Float32Array(outline.length * 2);
    // The shape lies in (x, y); rotating it flat maps y to -z.
    outline.forEach((p, i) => { points[i * 2] = group * (ox + p.x * scale); points[i * 2 + 1] = group * (oz - p.y * scale); });
    return points;
  };
  return [toWorld(1, [0, 0]), ...islets(level).map((islet) => toWorld(islet.scale, islet.position))];
}

/** Signed distance from (x, z) to the nearest shoreline: negative on land, positive over water. */
export function shoreDistance(polygons: Float32Array[], x: number, z: number) {
  let best = Infinity;
  for (const poly of polygons) {
    let nearest = Infinity, inside = false;
    const n = poly.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = poly[j * 2], az = poly[j * 2 + 1], bx = poly[i * 2], bz = poly[i * 2 + 1];
      const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
      const t = Math.max(0, Math.min(1, (wx * ex + wz * ez) / (ex * ex + ez * ez || 1)));
      const dx = wx - ex * t, dz = wz - ez * t;
      nearest = Math.min(nearest, dx * dx + dz * dz);
      if ((az > z) !== (bz > z) && x < ax + (z - az) * ex / (bz - az)) inside = !inside;
    }
    best = Math.min(best, (inside ? -1 : 1) * Math.sqrt(nearest));
  }
  return best;
}
