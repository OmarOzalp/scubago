/**
 * The island's shape as plain data, shared by the renderer (shoreline layers,
 * depth map, seabed) and by the swimming simulation (keeping animals off the
 * island). Dependency-free so tests and Node scripts can use it directly.
 *
 * The outline lives in its own plane (x, y); lying flat in the scene, y becomes -z.
 */

type Point = readonly [number, number];

/** The dry-sand shoreline: five cubic Bézier curves, closed. */
export const SHORELINE: readonly (readonly [Point, Point, Point, Point])[] = [
  [[-2.1, -.1], [-2.25, .85], [-1.3, 1.5], [-.35, 1.42]],
  [[-.35, 1.42], [.3, 1.38], [.5, .98], [1.12, 1.02]],
  [[1.12, 1.02], [2.02, 1.07], [2.32, .25], [1.9, -.42]],
  [[1.9, -.42], [1.55, -.98], [.75, -1.16], [.15, -1.36]],
  [[.15, -1.36], [-.92, -1.65], [-1.96, -1.07], [-2.1, -.1]],
];

/** Points along the outline, `divisions` per curve (the same points three.js's Shape.getPoints gives). */
export function outlinePoints(divisions = 24): [number, number][] {
  const points: [number, number][] = [];
  for (const [p0, p1, p2, p3] of SHORELINE) {
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      const point: [number, number] = [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
      const last = points[points.length - 1];
      if (last && last[0] === point[0] && last[1] === point[1]) continue;
      points.push(point);
    }
  }
  return points;
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

/**
 * Props on the seabed around the island, at island-group coordinates (x, z; scaled like the island):
 * the corals (from level 2, or 1 in the lagoon), and a third coral and a reef rock (from level 3).
 * The reef's animals keep clear of them (reef-life.ts).
 */
export const SEABED_PROPS = {
  coralA: [-2.1, 1.25], coralB: [2.2, .65], coralC: [1.5, 1.65], reefRock: [-2.1, -1.3],
} as const satisfies Record<string, readonly [number, number]>;

/** Every dry shoreline at this level as world-space (x, z) polygons; the main island comes first. */
export function shorePolygons(level: number, divisions = 24) {
  const outline = outlinePoints(divisions);
  const group = islandScale(level);
  const toWorld = (scale: number, [ox, oz]: [number, number]) => {
    const points = new Float32Array(outline.length * 2);
    outline.forEach((p, i) => { points[i * 2] = group * (ox + p[0] * scale); points[i * 2 + 1] = group * (oz - p[1] * scale); });
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

export type ShoreSample = { distance: number; nx: number; nz: number };
export type ShoreField = {
  /**
   * Distance to the shore and the unit direction pointing away from it. Islets are small sandbars,
   * so they may count `allowance` units smaller than they are (animals pass closer to them).
   */
  island(x: number, z: number, allowance?: number): ShoreSample;
  /** Distance to the nearest shoreline, islets as they are (no blending): the seabed's own measure (seabedProfile). */
  shore(x: number, z: number): number;
};
const fields = new Map<number, ShoreField>();

/** Polynomial smooth minimum: blends the island and islets so the field has no creases between them. */
const smoothMin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };

/**
 * Distance to the shore on coarse grids, for steering: lookups and a gradient per query instead
 * of walking every edge. Islets blend smoothly into the island, so the narrow channels between
 * them fill in and animals pass around the outside. Built once per level.
 */
export function createShoreField(level: number): ShoreField {
  const cached = fields.get(level);
  if (cached) return cached;
  // A coarser outline and grid than the renderer's are plenty for steering, and quick to build on a phone.
  const [main, ...islands] = shorePolygons(level, 12);
  const extent = 6.5, cells = 72, step = 2 * extent / cells;
  // Beyond `reach` of a polygon its exact distance no longer matters (the islets only blend in nearby).
  const grid = (polygons: Float32Array[], reach = Infinity) => {
    const values = new Float32Array((cells + 1) * (cells + 1));
    const centers = polygons.map((poly) => {
      let x = 0, z = 0;
      for (let k = 0; k < poly.length; k += 2) { x += poly[k]; z += poly[k + 1]; }
      return [x * 2 / poly.length, z * 2 / poly.length];
    });
    for (let j = 0; j <= cells; j++) {
      for (let i = 0; i <= cells; i++) {
        const x = -extent + i * step, z = -extent + j * step;
        const near = polygons.filter((_, k) => Math.hypot(x - centers[k][0], z - centers[k][1]) < reach);
        values[j * (cells + 1) + i] = near.length ? shoreDistance(near, x, z) : reach;
      }
    }
    return (x: number, z: number) => {
      const u = Math.max(0, Math.min(cells - 1e-6, (x + extent) / step)), v = Math.max(0, Math.min(cells - 1e-6, (z + extent) / step));
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const k = j * (cells + 1) + i;
      const near = values[k] + (values[k + 1] - values[k]) * fu;
      const far = values[k + cells + 1] + (values[k + cells + 2] - values[k + cells + 1]) * fu;
      return near + (far - near) * fv;
    };
  };
  const island = grid([main]), islets = islands.length ? grid(islands, 4) : null;
  const h = step * .75;
  const field: ShoreField = {
    island(x, z, allowance = 0) {
      const distance = islets ? (px: number, pz: number) => smoothMin(island(px, pz), islets(px, pz) + allowance, 1.5) : island;
      const nx = distance(x + h, z) - distance(x - h, z), nz = distance(x, z + h) - distance(x, z - h);
      const length = Math.hypot(nx, nz);
      // On the rare flat spot, point away from the island's center.
      if (length < 1e-9) { const r = Math.hypot(x, z) || 1; return { distance: distance(x, z), nx: x / r, nz: z / r }; }
      return { distance: distance(x, z), nx: nx / length, nz: nz / length };
    },
    shore: (x, z) => (islets ? Math.min(island(x, z), islets(x, z)) : island(x, z)),
  };
  fields.set(level, field);
  return field;
}
