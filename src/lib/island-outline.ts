/**
 * The islands' shapes as plain data, shared by the renderer (shoreline layers,
 * depth map, seabed) and by the swimming simulation (keeping animals off the
 * island). Dependency-free so tests and Node scripts can use it directly.
 *
 * Each island of the archipelago has its own outline and size (`IslandShape`, `OUTLINES`): the
 * Coral Reef's sandy palm island, the Kelp Forest's long rocky headland with a bay on its south
 * side, the Volcanic Pinnacle's small, round cone with lava lobes reaching the sea, and the
 * Mangroves' long, low, ragged cay. An outline lives in its own plane (x east, y north); lying flat
 * in the scene, y becomes -z.
 */

type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point, Point];

/** Which island's shape: one per island of the archipelago. */
export type IslandShape = 'reef' | 'kelp' | 'volcanic' | 'mangrove' | 'wreck';
/** The shape of a habitat's island; the sandy shores (island, lagoon, cove) all have the reef's. */
export const shapeFor = (habitat: string): IslandShape => (habitat === 'kelp' || habitat === 'volcanic' || habitat === 'mangrove' || habitat === 'wreck' ? habitat : 'reef');

/** The Coral Reef's dry-sand shoreline: five cubic Bézier curves, closed. */
export const SHORELINE: readonly Curve[] = [
  [[-2.1, -.1], [-2.25, .85], [-1.3, 1.5], [-.35, 1.42]],
  [[-.35, 1.42], [.3, 1.38], [.5, .98], [1.12, 1.02]],
  [[1.12, 1.02], [2.02, 1.07], [2.32, .25], [1.9, -.42]],
  [[1.9, -.42], [1.55, -.98], [.75, -1.16], [.15, -1.36]],
  [[.15, -1.36], [-.92, -1.65], [-1.96, -1.07], [-2.1, -.1]],
];

/** A smooth, closed outline through `points` (clockwise): each span a cubic Bézier (Catmull-Rom). */
function smoothOutline(points: readonly Point[]): Curve[] {
  const n = points.length;
  return points.map((p1, i) => {
    const p0 = points[(i + n - 1) % n], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    return [p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2] as const;
  });
}
/** Points at these radii, at evenly spaced angles clockwise from due west. */
const around = (radii: readonly number[]): Point[] => radii.map((r, i) => {
  const a = Math.PI - i * 2 * Math.PI / radii.length;
  return [r * Math.cos(a), r * Math.sin(a)] as const;
});

/** Every island's outline, at its own size (the reef's is the one Home's island always had). */
export const OUTLINES: Record<IslandShape, readonly Curve[]> = {
  reef: SHORELINE,
  // A long, rugged headland running east–west: an arm hooking out south-west, a knob on the north-east,
  // and a deep bay biting into its south side between two rocky points. The largest island.
  kelp: smoothOutline([
    [-2.8, -.55], [-2.62, .25], [-2.05, .8], [-1.25, 1.05], [-.55, 1.5], [.3, 1.32], [1.05, 1.62], [1.9, 1.3], [2.5, .55],
    [2.42, -.25], [1.85, -.7], [1.25, -1.45], [.7, -1.2], [.25, -.45], [-.45, -.35], [-1.1, -.75], [-1.75, -1.05], [-2.35, -1],
  ]),
  // A small, nearly round cone: lava lobes reach the sea on the east (the causeway) and south-west, a
  // shallow bight on the north. The smallest island, and the tallest.
  volcanic: smoothOutline(around([1.5, 1.46, 1.34, 1.29, 1.39, 1.58, 1.76, 1.55, 1.38, 1.39, 1.6, 1.55])),
  // A long, low cay with a ragged fringe of lobes where the mangroves grow out over the water. The
  // longest island, and the flattest.
  mangrove: smoothOutline([
    [-2.72, .05], [-2.55, .62], [-2.1, .78], [-1.7, 1.15], [-1, 1.12], [-.55, 1.3], [0, .98], [.6, 1.08], [1.05, 1.34], [1.7, 1.12],
    [2.15, .92], [2.55, .55], [2.8, .05], [2.55, -.45], [2.05, -.62], [1.7, -1.02], [1.05, -.92], [.45, -1.1], [0, -.8], [-.6, -1.18],
    [-1.3, -1.08], [-1.62, -1.22], [-2.1, -.82], [-2.5, -.62],
  ]),
  // A crescent of sand curving round a bight on its south side, where the wreck lies: thick in the
  // middle (where the island's middle is), its two arms tapering to points. Small and low.
  wreck: smoothOutline([
    [-2.25, -.9], [-2.1, -.4], [-1.65, .05], [-1.05, .37], [-.4, .57], [.25, .55], [.9, .41], [1.5, .09], [1.95, -.33], [2.2, -.8],
    [2.05, -1.03], [1.7, -.77], [1.2, -.47], [.6, -.25], [0, -.17], [-.6, -.21], [-1.15, -.37], [-1.6, -.65], [-1.95, -1.01], [-2.2, -1.13],
  ]),
};

/**
 * Points along an island's outline: `divisions` per curve of the reef's five (the same points three.js's
 * Shape.getPoints gives), as many in all for the other shapes, spread over their curves.
 */
export function outlinePoints(divisions = 24, shape: IslandShape = 'reef'): [number, number][] {
  const curves = OUTLINES[shape], per = Math.max(3, Math.round(divisions * SHORELINE.length / curves.length));
  const points: [number, number][] = [];
  for (const [p0, p1, p2, p3] of curves) {
    for (let i = 0; i <= per; i++) {
      const t = i / per, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      const point: [number, number] = [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
      const last = points[points.length - 1];
      if (last && last[0] === point[0] && last[1] === point[1]) continue;
      points.push(point);
    }
  }
  return points;
}

/** How far an island's outline reaches from its middle (units, before the level's growth). */
export function islandReach(shape: IslandShape = 'reef') {
  return Math.max(...outlinePoints(8, shape).map(([x, y]) => Math.hypot(x, y)));
}

/** Every island grows slightly with each level. */
export const islandScale = (level: number) => 1 + (level - 1) * .025;

/**
 * Where each island's two islets rise (from levels 5 and 6): position (x, z) and scale inside the island
 * group, each drawn with its island's own outline, just off its shore.
 */
const ISLETS: Record<IslandShape, readonly { position: [number, number]; scale: number }[]> = {
  reef: [{ position: [2.65, -2], scale: .3 }, { position: [-2.8, 2.1], scale: .26 }],
  kelp: [{ position: [3.1, -1.75], scale: .24 }, { position: [-3.15, 1.55], scale: .2 }],
  volcanic: [{ position: [2.35, -1.8], scale: .3 }, { position: [-2.3, 1.95], scale: .26 }],
  mangrove: [{ position: [3.2, -1.65], scale: .2 }, { position: [-3.05, 1.6], scale: .18 }],
  wreck: [{ position: [2.9, 1.25], scale: .22 }, { position: [-2.95, -1.15], scale: .2 }],
};

/** Small islets that appear at higher levels: position and scale inside the island group. */
export function islets(level: number, shape: IslandShape = 'reef'): { position: [number, number]; scale: number }[] {
  return ISLETS[shape].slice(0, level >= 6 ? 2 : level >= 5 ? 1 : 0).map(({ position, scale }) => ({ position: [...position], scale }));
}

/**
 * Props on the seabed around the island, at island-group coordinates (x, z; scaled like the island):
 * the corals (from level 2, or 1 in the lagoon), and a third coral and a reef rock (from level 3).
 * The reef's animals keep clear of them (reef-life.ts).
 */
export const SEABED_PROPS = {
  coralA: [-2.1, 1.25], coralB: [2.2, .65], coralC: [1.5, 1.65], reefRock: [-2.1, -1.3],
} as const satisfies Record<string, readonly [number, number]>;

/** The reef's seabed props at this level, scaled with its island (the other islands have none). */
export function seabedProps(level: number, shape: IslandShape = 'reef'): (readonly [number, number])[] {
  const scale = islandScale(level);
  return shape === 'reef' ? Object.values(SEABED_PROPS).map(([x, z]) => [x * scale, z * scale] as const) : [];
}

/** The shorelines made, by island, level and divisions: asked for many times in a scene, and the same numbers every time (and so the same arrays, which carry the quick distance's edges). */
const shorelines = new Map<string, Float32Array[]>();

/**
 * Every dry shoreline of an island at this level as world-space (x, z) polygons; the main island comes first. Made once: the list is the
 * caller's own, but the polygons in it are shared, and must not be changed.
 */
export function shorePolygons(level: number, divisions = 24, shape: IslandShape = 'reef') {
  const key = `${shape}:${level}:${divisions}`, kept = shorelines.get(key);
  if (kept) return [...kept];
  const outline = outlinePoints(divisions, shape);
  const group = islandScale(level);
  const toWorld = (scale: number, [ox, oz]: [number, number]) => {
    const points = new Float32Array(outline.length * 2);
    outline.forEach((p, i) => { points[i * 2] = group * (ox + p[0] * scale); points[i * 2 + 1] = group * (oz - p[1] * scale); });
    return points;
  };
  const made = [toWorld(1, [0, 0]), ...islets(level, shape).map((islet) => toWorld(islet.scale, islet.position))];
  shorelines.set(key, made);
  return [...made];
}

/** Each shoreline's middle and the farthest its points are from it (its bounding circle), found once. */
const circles = new WeakMap<Float32Array, { x: number; z: number; r: number }>();
function circleOf(poly: Float32Array) {
  let circle = circles.get(poly);
  if (!circle) {
    let x = 0, z = 0, r = 0;
    for (let k = 0; k < poly.length; k += 2) { x += poly[k]; z += poly[k + 1]; }
    x /= poly.length / 2; z /= poly.length / 2;
    for (let k = 0; k < poly.length; k += 2) r = Math.max(r, Math.hypot(poly[k] - x, poly[k + 1] - z));
    circle = { x, z, r };
    circles.set(poly, circle);
  }
  return circle;
}

/**
 * A shoreline prepared for quick questions: its edges as numbers to hand (the very values the plain walk of every edge works out from the points),
 * in runs of neighbouring edges with a bounding box each. A point's distance is then looked for only in the runs whose box could hold an edge
 * nearer than the best so far, and its inside/outside test counts crossings only in the runs whose rows it falls in.
 */
type Outline = {
  n: number; runs: number;
  ax: Float64Array; az: Float64Array; bz: Float64Array; ex: Float64Array; ez: Float64Array; len2: Float64Array;
  minX: Float64Array; maxX: Float64Array; minZ: Float64Array; maxZ: Float64Array;
  /** The run that held the nearest edge for the last point asked (the next one asked is usually close by), and every run's squared distance to the point in hand. */
  last: number; bound: Float64Array;
};
/** Edges in a run: more mean fewer boxes to test for a point, fewer mean fewer edges to test in each run chosen. */
const RUN = 8;
const outlines = new WeakMap<Float32Array, Outline>();
function outlineOf(poly: Float32Array): Outline {
  let outline = outlines.get(poly);
  if (outline) return outline;
  const n = poly.length / 2, runs = Math.ceil(n / RUN);
  const ax = new Float64Array(n), az = new Float64Array(n), bz = new Float64Array(n), ex = new Float64Array(n), ez = new Float64Array(n), len2 = new Float64Array(n);
  const minX = new Float64Array(runs).fill(Infinity), maxX = new Float64Array(runs).fill(-Infinity);
  const minZ = new Float64Array(runs).fill(Infinity), maxZ = new Float64Array(runs).fill(-Infinity);
  // (edge i runs from point j, the one before it, to point i, as in the plain walk)
  for (let i = 0, j = n - 1; i < n; j = i++) {
    ax[i] = poly[j * 2]; az[i] = poly[j * 2 + 1]; bz[i] = poly[i * 2 + 1];
    ex[i] = poly[i * 2] - ax[i]; ez[i] = bz[i] - az[i]; len2[i] = ex[i] * ex[i] + ez[i] * ez[i] || 1;
    const r = Math.floor(i / RUN), bx = poly[i * 2];
    minX[r] = Math.min(minX[r], ax[i], bx); maxX[r] = Math.max(maxX[r], ax[i], bx);
    minZ[r] = Math.min(minZ[r], az[i], bz[i]); maxZ[r] = Math.max(maxZ[r], az[i], bz[i]);
  }
  outline = { n, runs, ax, az, bz, ex, ez, len2, minX, maxX, minZ, maxZ, last: 0, bound: new Float64Array(runs) };
  outlines.set(poly, outline);
  return outline;
}

/** The squared distance to the nearest edge of run `r`, or `nearest` (the nearest so far) if none of them is nearer. */
function nearestInRun(o: Outline, r: number, x: number, z: number, nearest: number) {
  const { n, ax, az, ex, ez, len2 } = o;
  for (let i = r * RUN, end = Math.min(n, i + RUN); i < end; i++) {
    const wx = x - ax[i], wz = z - az[i], px = ex[i], pz = ez[i];
    const t = Math.max(0, Math.min(1, (wx * px + wz * pz) / len2[i]));
    const qx = wx - px * t, qz = wz - pz * t, d = qx * qx + qz * qz;
    if (d < nearest) { nearest = d; o.last = r; }
  }
  return nearest;
}

/** Signed distance from (x, z) to one prepared shoreline: negative on land, positive over water. */
function outlineDistance(o: Outline, x: number, z: number) {
  const { n, runs, az, bz, ax, ex, ez, minX, maxX, minZ, maxZ, bound } = o;
  let inside = false;
  for (let r = 0; r < runs; r++) {
    // Nothing in the run is nearer than its box (squared).
    const dx = x < minX[r] ? minX[r] - x : x > maxX[r] ? x - maxX[r] : 0, dz = z < minZ[r] ? minZ[r] - z : z > maxZ[r] ? z - maxZ[r] : 0;
    bound[r] = dx * dx + dz * dz;
    // An edge crosses this row only if one end is above it and the other is not: so only in a run whose box spans it.
    if (z >= minZ[r] && z < maxZ[r]) {
      for (let i = r * RUN, end = Math.min(n, i + RUN); i < end; i++) {
        if ((az[i] > z) !== (bz[i] > z) && x < ax[i] + (z - az[i]) * ex[i] / ez[i]) inside = !inside;
      }
    }
  }
  // The run that held the nearest edge for the last point first, then any run whose box is not already farther than that (a run is skipped only if
  // it is farther by more than any rounding in measuring it could make up).
  const first = o.last;
  let nearest = nearestInRun(o, first, x, z, Infinity);
  for (let r = 0; r < runs; r++) if (r !== first && bound[r] <= nearest * (1 + 1e-9) + 1e-12) nearest = nearestInRun(o, r, x, z, nearest);
  return (inside ? -1 : 1) * Math.sqrt(nearest);
}

/**
 * Signed distance from (x, z) to the nearest shoreline: negative on land, positive over water. The very same numbers, bit for bit, as
 * `shoreDistanceByEdges` (a shoreline's edges are prepared the first time it is asked about, and must not change after).
 */
export function shoreDistance(polygons: Float32Array[], x: number, z: number) {
  // (a point that is not a finite number is not worth a clever walk)
  if (!Number.isFinite(x) || !Number.isFinite(z)) return shoreDistanceByEdges(polygons, x, z);
  let best = Infinity;
  for (const poly of polygons) {
    // (a shoreline whose bounding circle is farther than the nearest yet cannot be nearer, even with the point inside it: its distance is never less than the circle's)
    if (best < Infinity) { const circle = circleOf(poly); if (Math.hypot(x - circle.x, z - circle.z) - circle.r > best) continue; }
    best = Math.min(best, outlineDistance(outlineOf(poly), x, z));
  }
  return best;
}

/** The plain walk of every edge of every shoreline that `shoreDistance` is quicker than, with the same result: to check it against, and for points it is not trusted with. */
export function shoreDistanceByEdges(polygons: Float32Array[], x: number, z: number) {
  let best = Infinity;
  for (const poly of polygons) {
    // (a shoreline whose bounding circle is farther than the nearest yet cannot be nearer, even with the point inside it: its distance is never less than the circle's)
    if (best < Infinity) { const circle = circleOf(poly); if (Math.hypot(x - circle.x, z - circle.z) - circle.r > best) continue; }
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
const fields = new Map<string, ShoreField>();

/** Polynomial smooth minimum: blends the island and islets so the field has no creases between them. */
const smoothMin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };

/**
 * Distance to the shore on coarse grids, for steering: lookups and a gradient per query instead
 * of walking every edge. Islets blend smoothly into the island, so the narrow channels between
 * them fill in and animals pass around the outside. Built once per island and level.
 */
export function createShoreField(level: number, shape: IslandShape = 'reef'): ShoreField {
  const key = `${shape}:${level}`, cached = fields.get(key);
  if (cached) return cached;
  // A coarser outline and grid than the renderer's are plenty for steering, and quick to build on a phone.
  const [main, ...islands] = shorePolygons(level, 12, shape);
  // (out past the frame's bound at the last level, where the biggest bodies go round the islets' reefs: 1.13 of an ocean 6.5 across from the middle;
  // the cells are 13/72 of a unit wherever it reaches, so the field is the same where it was before)
  const step = 13 / 72, cells = 94, extent = cells * step / 2;
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
  // (asked many times a step: no function made per question)
  const distance = islets ? (px: number, pz: number, allowance: number) => smoothMin(island(px, pz), islets(px, pz) + allowance, 1.5) : (px: number, pz: number) => island(px, pz);
  const field: ShoreField = {
    island(x, z, allowance = 0) {
      const nx = distance(x + h, z, allowance) - distance(x - h, z, allowance), nz = distance(x, z + h, allowance) - distance(x, z - h, allowance);
      const length = Math.hypot(nx, nz);
      // On the rare flat spot, point away from the island's center.
      if (length < 1e-9) { const r = Math.hypot(x, z) || 1; return { distance: distance(x, z, allowance), nx: x / r, nz: z / r }; }
      return { distance: distance(x, z, allowance), nx: nx / length, nz: nz / length };
    },
    shore: (x, z) => (islets ? Math.min(island(x, z), islets(x, z)) : island(x, z)),
  };
  fields.set(key, field);
  return field;
}
