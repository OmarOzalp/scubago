import { islandReach, islandScale, shapeFor } from './island-outline';
import { OCEAN } from './ocean';
import type { OceanIsland } from './seabed';

/** A pseudo-random 0..1 for a pair of numbers: the same every time, so the lattices have the same jitter and relief wherever they are built. */
export const hash = (x: number, y: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** How far the water reaches each way from every island's middle (units): one number, or its own for each direction. */
export type WaterExtent = number | { readonly x: number; readonly z: number };
export const extentOf = (extent: WaterExtent) => (typeof extent === 'number' ? { x: extent, z: extent } : extent);
/** The box reaching `extent` units each way from every island's middle (x0, z0, width, depth). */
export function oceanBox(islands: readonly { x: number; z: number }[], extent: WaterExtent) {
  const xs = islands.map((i) => i.x), zs = islands.map((i) => i.z), { x: ex, z: ez } = extentOf(extent);
  const x0 = Math.min(...xs) - ex, z0 = Math.min(...zs) - ez;
  return { x0, z0, width: Math.max(...xs) + ex - x0, depth: Math.max(...zs) + ez - z0 };
}

/** The seabed as a triangle mesh: vertices (x, y, z, one after another) and the triangles' corners. */
export type Lattice = {
  positions: number[]; indices: number[];
  /** Where in `indices` the islands' own terrain begins: before it, the coarse floor between them, which they lie over. */
  terrain: number;
};

/**
 * What the seabed is made from: the islands, each one's main shoreline in its own frame (as x, z pairs: its
 * outline and size), the height of the bottom at a point, and whether the islands stand on a shallow bank.
 */
export type LatticeSource = {
  islands: readonly OceanIsland[]; shores: readonly Float32Array[]; bank: unknown; profile(x: number, z: number): { floor: number; unwalled?: number };
  /**
   * For the Coral Reef: how far a point is from its main shore, in the reef's own measure (its crest is at fixed values of it, wherever the crest wanders
   * and the shelf widens), at (x, z) in island `which`'s frame; NaN where an islet's shore is nearer.
   */
  crest?(which: number, x: number, z: number): number;
  /** The same from the nearest of its shores, the main island's or an islet's: its outer wall is at fixed values of this one, round the islets too. */
  wall?(which: number, x: number, z: number): number;
};
/**
 * The rings of the Coral Reef from this far out (units) follow its own measure of distance (`crest`), not the shore's, and from `WALL_FROM` are not
 * jittered: a wall that steep is smooth only if every ring is at one height round the island. From `WALL_FROM` they follow the wall's measure (`wall`),
 * so they go round the islets' reefs as well as the main island's, where the wall does.
 */
const FOLLOW_FROM = 1.1, WALL_FROM = 1.9;
/** Along each ray, the wall's measure is looked at every `fine` units for `near` units past the last inner ring (the islets' walls lie well inside that), then every `coarse`. */
const SEARCH = { fine: .1, near: 4.5, coarse: .5 };

/**
 * Where along a ray (an offset from the shore) the measure `at` last rises through `target`: the outermost place it is that far, so that a ring
 * there runs round the islets' reefs, past their lagoons, as the wall does. Looked for among `samples` (offsets, and the measure at each, outward),
 * then by halving. Undefined when the measure is past `target` from the first sample, or short of it at the last.
 */
function outermost(samples: { offsets: number[]; values: number[] }, target: number, at: (offset: number) => number) {
  const { offsets, values } = samples;
  let i = values.length - 1;
  if (values[i] < target) return undefined;
  while (i >= 0 && values[i] >= target) i--;
  if (i < 0) return undefined;
  let lo = offsets[i], hi = offsets[i + 1];
  for (let k = 0; k < 16; k++) { const mid = (lo + hi) / 2; if (at(mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * The seabed's mesh: a radial terrain around each island (beach slope, sandy shelf, reef drop-off, deep
 * floor) with a little relief, and under water that reaches past OCEAN.waterExtent (`reach`, the explorer's),
 * the deep floor going on under all of it, past the water's corners. With several islands, each one's
 * terrain stops short of its neighbours' and a coarse deep floor lies under the open sea between them (drawn
 * first, so the islands' terrain lies over it). It is what the water's seabed is drawn from (ocean-mesh.ts)
 * and what the animals swim over (seabed.ts), so the one is always the other: not the profile it is made from,
 * but its triangles, which run straight between their vertices.
 */
export function seabedLattice(field: LatticeSource, level: number, reach: WaterExtent = OCEAN.waterExtent): Lattice {
  const rays = 96;
  const near = [-.12, -.04, 0, .04, .08, .12, .17, .23, .3, .38, .47, .57, .68, .8, .95, 1.15, 1.4, 1.75, 2.2, 2.8, 3.6, 4.6, 6, 8, 10.5];
  const corner = Math.hypot(extentOf(reach).x, extentOf(reach).z) + 1;
  const alone = field.islands.length === 1;
  // Alone, out past the water's corners; among others, no farther than halfway to the nearest (less its own size).
  const spacing = (island: OceanIsland) => Math.min(...field.islands.filter((other) => other !== island).map((other) => Math.hypot(other.x - island.x, other.z - island.z)));
  // The Coral Reef's outer slope falls away as a steep wall (`OCEAN.reefCrest.wall`): rings close together pick it out, in place of those of the usual shelf there.
  const wallRings = [1.94, 1.98, 2.02, 2.06, 2.1, 2.14, 2.18, 2.24], rings = (island: OceanIsland) => (shapeFor(island.habitat) === 'reef' ? [...near.filter((o) => o < 1.9 || o > 2.4), ...wallRings].sort((a, b) => a - b) : near);
  const offsetsFor = (island: OceanIsland) => {
    if (alone) return corner > 12 ? [...rings(island), ...[14, 18, 23, 28].filter((o, i, all) => o < corner || all[i - 1] < corner)] : rings(island);
    const limit = spacing(island) / 2 - islandReach(shapeFor(island.habitat)) * islandScale(level) - .2;
    return rings(island).filter((o, i) => o <= limit || i < 4);
  };
  // Distance from the island center to its shore along each ray: the nearest crossing, so a bay's water
  // has seabed under it too (where the ray crosses land again, the island covers the terrain beneath).
  const shoreRadius = (outline: Float32Array, angle: number) => {
    const dx = Math.cos(angle), dz = Math.sin(angle), n = outline.length / 2;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const ax = outline[i * 2], az = outline[i * 2 + 1], bx = outline[(i + 1) % n * 2], bz = outline[(i + 1) % n * 2 + 1];
      const ex = bx - ax, ez = bz - az, det = dx * -ez + dz * ex;
      if (Math.abs(det) < 1e-9) continue;
      const t = (ax * -ez + az * ex) / det, u = (dx * az - dz * ax) / det;
      if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best === Infinity ? 0 : best;
  };
  const positions: number[] = [], indices: number[] = [];
  // The open sea's floor between the islands: a coarse grid under all the water (finer where the islands
  // stand on a shallow bank, which shows through the clear water above it).
  if (!alone) {
    const box = oceanBox(field.islands, reach), step = field.bank ? .75 : 1.5;
    const cols = Math.ceil(box.width / step) + 1, rows = Math.ceil(box.depth / step) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = box.x0 + c * step, z = box.z0 + r * step;
        positions.push(x, field.profile(x, z).floor, z);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  }
  const terrain = indices.length;
  field.islands.forEach((island, which) => {
    const offsets = offsetsFor(island), first = positions.length / 3, outline = field.shores[which];
    const reef = shapeFor(island.habitat) === 'reef', follows = reef ? field.crest : undefined, walls = reef ? field.wall : undefined;
    // The Coral Reef's rings from the wall out (from `outer`), which follow the wall round the islets too.
    const outer = walls ? offsets.findIndex((o) => o >= WALL_FROM) : -1;
    // Each ray's vertices, ring by ring (x, y, z).
    const rows: number[][][] = [];
    for (let r = 0; r < rays; r++) {
      const angle = Math.PI * 2 * r / rays, radius = shoreRadius(outline, angle);
      const ux = Math.cos(angle), uz = Math.sin(angle);
      // Where along the ray the reef's own measure is `target`: found by halving, the measure growing out from the shore (where it does not, the offset itself).
      const along = (target: number) => {
        if (!follows) return target;
        const at = (o: number) => follows(which, ux * (radius + o), uz * (radius + o)) - target;
        let lo = Math.max(-.3, target * .5 - .6), hi = target * 1.7 + .6;
        // (an islet's shelf nearer than the main island's anywhere along the way: the shelf's usual rings)
        for (let k = 0; k <= 6; k++) if (Number.isNaN(at(lo + (hi - lo) * k / 6))) return target;
        if (at(lo) > 0 || at(hi) < 0) return target;
        for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (at(mid) < 0) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
      };
      // A vertex `offset` past the shore along the ray (on ring `k`, which picks its relief), on the seabed (or where it would be without the reef's wall).
      const vertex = (k: number, offset: number, jitter = 0, unwalled = false) => {
        const x = island.x + ux * (radius + offset + jitter), z = island.z + uz * (radius + offset + jitter);
        const at = field.profile(x, z), floor = unwalled ? at.unwalled ?? at.floor : at.floor;
        // Gentle ripples on the sandy shelf, growing into rougher reef past its edge.
        const roughness = .018 + .07 * Math.min(1, Math.max(0, (offset - .6) / 1.2)) ** 2;
        const relief = (hash(r * 3.1, k * 7.7) - .5) * roughness * Math.min(1, Math.max(0, offset * 4));
        // (never up through the surface, where the Coral Reef's crest comes close to it)
        return [x, offset > .3 ? Math.min(floor + relief, OCEAN.surfaceLevel - .025) : floor + relief, z];
      };
      const row: number[][] = [];
      for (const [k, nominal] of offsets.entries()) {
        if (outer >= 0 && k >= outer) break;
        const offset = nominal >= FOLLOW_FROM ? along(nominal) : nominal;
        // (the reef's wall is not jittered: across a wall that steep it would be fins)
        const jitter = k > 1 && k < offsets.length - 2 && !(follows && nominal >= WALL_FROM) ? (hash(r, k) - .5) * .08 * Math.min(1, nominal) : 0;
        row.push(vertex(k, offset, jitter));
      }
      if (outer < 0) { rows.push(row); continue; }
      // The wall's rings and those past it: where the wall's measure last reaches each one's value along the ray, past the islets' reefs where they
      // lie across it (the main island's measure there, the rings' as they were, if it never does).
      const wall = (o: number) => walls!(which, ux * (radius + o), uz * (radius + o));
      const start = outer > 0 ? Math.hypot(row[outer - 1][0] - island.x, row[outer - 1][2] - island.z) - radius : 0, samples = { offsets: [] as number[], values: [] as number[] };
      for (let o = start, far = offsets[offsets.length - 1] * 1.7 + .6; o <= far; o += o < start + SEARCH.near ? SEARCH.fine : SEARCH.coarse) { samples.offsets.push(o); samples.values.push(wall(o)); }
      // (those out past the wall, on its flat floor, reach no less far than they did: out to the water's corners)
      const placed = offsets.slice(outer).map((nominal) => {
        const found = outermost(samples, nominal, wall);
        return nominal > wallRings[wallRings.length - 1] ? Math.max(found ?? -Infinity, along(nominal)) : found ?? along(nominal);
      });
      // The rings as they were that lie inside the wall here (round an islet: its lagoon and crest, as the main island's rings reach out over them), kept as
      // they were: drawn so before, and only the slope past the crest is the wall's.
      const inside: number[][] = [];
      for (let k = outer; k < offsets.length; k++) {
        const offset = along(offsets[k]);
        if (offset >= placed[0] - 1e-3 || wall(offset) >= offsets[outer]) break;
        inside.push(vertex(k, offset));
      }
      const walled = placed.map((offset, j) => vertex(outer + j, offset));
      // Where they do, the wall's top is on the straight run from the last of them to the next ring as it was, over the reef's slope as it would be
      // without the wall: inside the wall the seabed is drawn as before, and the wall falls from there (never rising first: no lip at its top).
      const next = outer + inside.length;
      if (inside.length && next < offsets.length) {
        const from = inside[inside.length - 1], to = vertex(next, along(offsets[next]), 0, true), at = (v: number[]) => Math.hypot(v[0] - island.x, v[2] - island.z);
        const t = (radius + placed[0] - at(from)) / (at(to) - at(from));
        walled[0][1] = from[1] + (to[1] - from[1]) * Math.max(0, Math.min(1, t));
        for (let j = 1; j < walled.length; j++) walled[j][1] = Math.min(walled[j][1], walled[j - 1][1]);
      }
      rows.push([...row, ...inside, ...walled]);
    }
    // Every ray has as many rings: where fewer of the rings as they were lie inside the wall, the rest are the wall's first, again (no area, nothing drawn).
    const extra = outer < 0 ? 0 : Math.max(...rows.map((row) => row.length)) - offsets.length;
    for (const row of rows) {
      if (outer >= 0) row.splice(outer + (row.length - offsets.length), 0, ...Array.from({ length: extra - (row.length - offsets.length) }, () => row[row.length - (offsets.length - outer)]));
      for (const v of row) positions.push(v[0], v[1], v[2]);
    }
    const n = offsets.length + extra;
    for (let r = 0; r < rays; r++) {
      for (let k = 0; k < n - 1; k++) {
        const a = first + r * n + k, b = first + ((r + 1) % rays) * n + k;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  });
  return { positions, indices, terrain };
}
