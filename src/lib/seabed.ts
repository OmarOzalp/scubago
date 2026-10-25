import { archipelagoBank, bankDepth } from './banks';
import type { Habitat } from './home';
import { islandScale, seabedProps, shapeFor, shoreDistance, shorePolygons, type IslandShape, type ShoreField, type ShoreSample } from './island-outline';
import { OCEAN, reefShape, seabedProfile, shelfStretch, wallMeasure, type OceanConfig } from './ocean';
import { coralHeads } from './reef-coast';
import { REEF_ANEMONE, REEF_ROCK, reefRocks } from './reef-life';
import { seabedLattice, type Lattice, type WaterExtent } from './seabed-lattice';
import { smoothstep, worldFor } from './steering';
import { alongWreck, WRECK } from './wreck';

/** An island in the ocean: its middle (world units) and the habitat whose water surrounds it. */
export type OceanIsland = { x: number; z: number; habitat: Habitat };

/** Past this far from an island's middle (units), its shore is too far to shape the seabed (beyond its islets, the open-ocean depth is reached). */
export const ISLAND_REACH = 10;

type Near = {
  reach: number; x: number; z: number; reef: boolean; island: number;
  /** How much the reef's wall here is an islet's (0 to 1: wallMeasure in ocean.ts): 1 where an islet's shore is nearer than the main island's by `ISLET_WALL`, 0 where it is not nearer. */
  islet: number;
};
/** Over how much nearer an islet's shore is than the main island's (shelf reach) the reef's wall turns from the main island's into an islet's. */
const ISLET_WALL = .5;
export type SeabedField = {
  /** Each island's shores in its own frame: the main island's, then its islets' (x, z pairs). */
  shores: Float32Array[][];
  /** Which islands have the Coral Reef's lagoon and crest. */
  reefs: boolean[];
  /** The nearest island's shelf at a point: how far (in its shelf's reach) and where in its frame, and which island it is. */
  nearest(x: number, z: number): Near;
  /** The seabed's `floor` (world y), the water over it (`depth`) and how wet it is (`wet`: negative on a beach), at a point (world x, z). */
  profileAt(x: number, z: number, near?: Near): { floor: number; depth: number; wet: number; unwalled: number };
  /** The shallow bank the islands stand on, with several of them. */
  bank: ReturnType<typeof archipelagoBank> | null;
  /** The seabed as a mesh, for the water's reach (OCEAN.waterExtent unless told). */
  lattice(reach?: WaterExtent): Lattice;
};
/** The fields made, most recently used last: the water and the animals of the same islands and level share one. */
const fields = new Map<string, SeabedField>();

/**
 * The seabed under a set of islands, one function for everything that needs it: the depth map the
 * water and seabed are drawn from (ocean-mesh.ts) and the animals that swim above it (`createSeabed`).
 * Each island shapes the seabed around it in its own frame (the same shelf its kelp and reef animals
 * stand on), the nearest one wherever two reach; with several islands, they stand on one shallow bank
 * (banks.ts), which the seabed rises to wherever it is shallower than the ocean around the islands.
 */
export function createSeabedField(level: number, islands: readonly OceanIsland[], config: OceanConfig = OCEAN): SeabedField {
  // One field serves the water and the animals of the same islands and level (when drawn with the usual ocean).
  const key = config === OCEAN ? `${level}|${JSON.stringify(islands)}` : '', kept = key ? fields.get(key) : undefined;
  if (kept) {
    fields.delete(key); fields.set(key, kept);
    return kept;
  }
  // Each island's own shores, in its own frame (its outline and size: island-outline.ts).
  const shores = islands.map((island) => shorePolygons(level, 24, shapeFor(island.habitat)));
  // The Coral Reef's lagoon and crest (seabedProfile).
  const reefs = islands.map((island) => shapeFor(island.habitat) === 'reef');
  // Each island's main shore and its islets' apart: the Coral Reef's measures need the main shore's distance on its own (and the two together cost no more than all of them).
  const mains = shores.map((polygons) => polygons.slice(0, 1)), rests = shores.map((polygons) => polygons.slice(1));
  const restDistance = (which: number, lx: number, lz: number) => (rests[which].length ? shoreDistance(rests[which], lx, lz) : Infinity);
  // How much the reef's wall is an islet's (Near.islet), `reach` from the nearest shore and `main` from the main island's (shelf reach).
  const isletOf = (main: number, reach: number) => (reach > 0 ? smoothstep(0, ISLET_WALL, main - reach) : 0);
  // The shelf widens and narrows around each island's coast (in its own frame); the land itself is unchanged.
  // Far from an island's middle, only the open ocean's depth is left of its shelf.
  const nearest = (x: number, z: number) => {
    let best = Infinity, nx = x, nz = z, which = 0, main = Infinity;
    for (let n = 0; n < islands.length; n++) {
      const island = islands[n], lx = x - island.x, lz = z - island.z;
      if (Math.hypot(lx, lz) > ISLAND_REACH && best < Infinity) continue;
      const own = shoreDistance(mains[n], lx, lz), distance = Math.min(own, restDistance(n, lx, lz)), stretch = shelfStretch(lx, lz, config);
      const reach = distance > 0 ? distance / stretch : distance;
      if (reach < best) { best = reach; nx = lx; nz = lz; which = n; main = own > 0 ? own / stretch : own; }
    }
    return { reach: best, x: nx, z: nz, reef: reefs[which], island: which, islet: reefs[which] ? isletOf(main, best) : 0 };
  };
  // The Coral Reef's own measure of how far a point is: the profile's distance from the island's main shore (the shelf's reach less how far the crest wanders
  // there). Its inner rings (seabed-lattice.ts) are at fixed values of it, so each is at one height round the island. Where an islet's shelf is nearer than
  // the main island's there is no such measure (it folds back toward the islet): NaN, and the rings are the shelf's usual.
  const crest = (which: number, lx: number, lz: number) => {
    const main = shoreDistance(mains[which], lx, lz);
    if (restDistance(which, lx, lz) < main - 1e-6) return NaN;
    return (main > 0 ? main / shelfStretch(lx, lz, config) : main) - reefShape(lx, lz, config).shift;
  };
  // The same from the nearest of its shores, the main island's or an islet's, as the wall's own measure (wallMeasure in ocean.ts): what the reef's outer
  // wall is at fixed values of, round the islets too. Its outer rings follow it, so the wall is drawn at one height round the main island and the islets alike.
  const wall = (which: number, lx: number, lz: number) => {
    const own = shoreDistance(mains[which], lx, lz), all = Math.min(own, restDistance(which, lx, lz)), stretch = shelfStretch(lx, lz, config);
    const reach = all > 0 ? all / stretch : all, main = own > 0 ? own / stretch : own;
    return wallMeasure(reach - reefShape(lx, lz, config).shift, isletOf(main, reach), config);
  };
  // With several islands, they stand on one shallow bank (banks.ts): the seabed rises to it wherever
  // the bank is shallower than the ocean around the islands would be.
  const bank = islands.length > 1 ? archipelagoBank(islands) : null;
  const profileAt = (x: number, z: number, near = nearest(x, z)) => {
    const own = seabedProfile(near.reach, config, near.reef ? near : undefined);
    if (!bank || near.reach <= 0) return own;
    const held = bankDepth(bank, x, z);
    return held < own.depth ? { floor: config.surfaceLevel - held, depth: Math.max(0, held), wet: held, unwalled: Math.max(own.unwalled, config.surfaceLevel - held) } : own;
  };
  // The seabed as a mesh (seabed-lattice.ts), made once for each reach of the water.
  const lattices = new Map<string, Lattice>();
  const field: SeabedField = {
    shores, reefs, nearest, profileAt, bank,
    lattice(reach?: WaterExtent) {
      const reaching = JSON.stringify(reach ?? null);
      let made = lattices.get(reaching);
      if (!made) { made = seabedLattice({ islands, shores: shores.map((polygons) => polygons[0]), bank, profile: (x, z) => profileAt(x, z), crest, wall }, level, reach); lattices.set(reaching, made); }
      return made;
    },
  };
  if (key) {
    fields.set(key, field);
    if (fields.size > 6) fields.delete(fields.keys().next().value!);
  }
  return field;
}

/** The calm water surface (world y), the top of every animal's water. */
export const SURFACE_Y = OCEAN.surfaceLevel;

/**
 * Where the animals can be, past which a baked grid is only edge: the ocean at the last level is the
 * widest, and an animal's body reaches a little past its center (units). (No farther than the water and its seabed are drawn,
 * OCEAN.waterExtent: past that there is no seabed to bake.)
 */
const REACH = { x: Math.min(worldFor(6).x + 1.4, OCEAN.waterExtent - .1), z: Math.min(worldFor(6).z + 1.4, OCEAN.waterExtent - .1) };
/** Grid spacing (units): fine enough for the Coral Reef's crest, whose wall climbs about .4 in .16. */
const STEP = .1;
const COLUMNS = Math.ceil(2 * REACH.x / STEP) + 1, ROWS = Math.ceil(2 * REACH.z / STEP) + 1;
/** Grid spacing (units) of the fields that steer animals away from water too shallow for them: they only steer, so a coarser grid will do. */
const FIELD_STEP = .25;

/**
 * How far (units) a point is from places an animal cannot be (negative inside them), and the direction away
 * from them: called as a function for the distance, or `sample` for both.
 */
export type Shallows = ((x: number, z: number) => number) & { sample(x: number, z: number, out: ShoreSample): void };

/** The seabed an island's animals swim over, in the island's own frame. */
export type Seabed = {
  /**
   * The bottom's height (world y) at (x, z), looked up on a baked grid (never a profile per animal per
   * frame): the seabed as it is drawn, with the Coral Reef's coral heads, rocks and anemones, and the
   * Shipwreck's steamer, standing on it. Past the grid's edge, the edge's.
   */
  floor(x: number, z: number): number;
  /**
   * The bottom with only the big things on it (the steamer): the water a body must fit in, as the little things
   * (coral heads, rocks, anemones) are swum around and over. Where the reef's own animals lie, against their rocks and dens.
   */
  solid(x: number, z: number): number;
  /** The bare seabed, as the water and seabed are drawn from it. */
  ground(x: number, z: number): number;
  /**
   * The bare seabed exactly as it is drawn, point by point: the very triangles of the water's seabed (seabed-lattice.ts), the last
   * drawn over a point the one seen (under the island itself, the height of land). For what lies right on the bottom: `ground` is
   * the highest the drawing is nearby, never lower than it, which over a steep slope is a good deal higher. Slower than the grid's
   * lookups, and the triangles are kept by the first call.
   */
  exact(x: number, z: number): number;
  /**
   * How far (units) a point is from the places `blocked` says no (negative inside them): the lagoon and
   * crest, the shelf, a sandbar or the wreck, for a body too big to be there. Looked up on a grid of its
   * own (a quarter unit: it only steers), found once for each `key`.
   */
  distanceTo(key: string, blocked: (x: number, z: number) => boolean): Shallows;
  /** The deepest the bottom goes anywhere on the grid (world y): the most water any animal can have under it. */
  deepest: number;
  /** The level it was made for. */
  level: number;
};

/** Squared distance transform of a mask (1-D passes, exact: Felzenszwalb & Huttenlocher), in cells: 0 where `inside` is set. */
function distanceToMask(inside: Uint8Array, columns: number, rows: number) {
  const INF = 1e12, grid = new Float64Array(columns * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = inside[i] ? 0 : INF;
  const length = Math.max(columns, rows), f = new Float64Array(length), d = new Float64Array(length), v = new Int32Array(length), z = new Float64Array(length + 1);
  const pass = (count: number, read: (i: number) => number, write: (i: number, value: number) => void) => {
    for (let q = 0; q < count; q++) f[q] = read(q);
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < count; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < count; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
    for (let q = 0; q < count; q++) write(q, d[q]);
  };
  for (let x = 0; x < columns; x++) pass(rows, (y) => grid[y * columns + x], (y, value) => { grid[y * columns + x] = value; });
  for (let y = 0; y < rows; y++) pass(columns, (x) => grid[y * columns + x], (x, value) => { grid[y * columns + x] = value; });
  for (let i = 0; i < grid.length; i++) grid[i] = Math.sqrt(grid[i]);
  return grid;
}

/** Seabeds kept (each is a few hundred kilobytes): the island on screen, its levels as it grows, and a few to swipe back to. */
const KEPT = 8;
const seabeds = new Map<string, Seabed>();

/**
 * The seabed as it is drawn at a point of an island's frame, from the triangles of its lattice (`home`: the island's place in them):
 * the last drawn over a point is the one seen. Where nothing is drawn (under the island itself), the height of land.
 */
function drawnLookup(positions: readonly number[], indices: readonly number[], home: { x: number; z: number }) {
  // The triangles by the small squares they touch (a grid of lists in one array: counted, then filled), each one's corners kept as numbers to hand.
  const CELL = .1, count = indices.length / 3, tri = new Float64Array(count * 9);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const p = indices[t * 3 + k] * 3, x = positions[p], z = positions[p + 2];
      tri[t * 9 + k * 3] = x; tri[t * 9 + k * 3 + 1] = positions[p + 1]; tri[t * 9 + k * 3 + 2] = z;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const columns = Math.floor((maxX - minX) / CELL) + 1, rows = Math.floor((maxZ - minZ) / CELL) + 1, start = new Int32Array(columns * rows + 1);
  const span = (t: number) => {
    const o = t * 9, x0 = Math.min(tri[o], tri[o + 3], tri[o + 6]), x1 = Math.max(tri[o], tri[o + 3], tri[o + 6]), z0 = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), z1 = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    return [Math.floor((x0 - minX) / CELL), Math.floor((x1 - minX) / CELL), Math.floor((z0 - minZ) / CELL), Math.floor((z1 - minZ) / CELL)] as const;
  };
  for (let t = 0; t < count; t++) { const [i0, i1, j0, j1] = span(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) start[j * columns + i + 1]++; }
  for (let c = 0; c < columns * rows; c++) start[c + 1] += start[c];
  const fill = start.slice(0, columns * rows), list = new Int32Array(start[columns * rows]);
  for (let t = 0; t < count; t++) { const [i0, i1, j0, j1] = span(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) list[fill[j * columns + i]++] = t; }
  return (localX: number, localZ: number) => {
    const x = home.x + localX, z = home.z + localZ, i = Math.floor((x - minX) / CELL), j = Math.floor((z - minZ) / CELL);
    if (i < 0 || j < 0 || i >= columns || j >= rows) return LAND;
    // (the last drawn over a point is the one seen)
    for (let q = start[j * columns + i + 1] - 1; q >= start[j * columns + i]; q--) {
      const o = list[q] * 9, ax = tri[o], ay = tri[o + 1], az = tri[o + 2], bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5], cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * ay + l2 * by + l3 * cy;
    }
    return LAND;
  };
}

/** The habitat whose water a lone island's seabed is made for: any one of its shape will do. */
export const HABITATS: Record<IslandShape, Habitat> = { reef: 'island', kelp: 'kelp', volcanic: 'volcanic', mangrove: 'mangrove', wreck: 'wreck' };
/** What the grid holds where no seabed is drawn: under the island itself, which covers it (world y). */
const LAND = OCEAN.surfaceLevel + .5;

/**
 * The seabed around one island, baked once per island, level and neighbours (the explorer's bank): the very
 * triangles the water's seabed is drawn from (seabed-lattice.ts: the shelf, the Coral Reef's lagoon and crest,
 * the bank between the islands), set down on a grid, with the coral heads, rocks and the wreck standing on them.
 * Heights are world y, in the island's own frame. `among.reach` is how far the explorer's water reaches.
 */
export function createSeabed(level: number, shape: IslandShape = 'reef', among?: { islands: readonly OceanIsland[]; index: number; reach?: WaterExtent }): Seabed {
  const where = among && among.islands.length > 1 ? among : undefined;
  const key = `${shape}:${level}:${where ? `${where.index}:${where.islands.map((i) => `${i.x},${i.z},${i.habitat}`).join(';')}:${JSON.stringify(where.reach ?? null)}` : ''}`, cached = seabeds.get(key);
  if (cached) {
    // (most recently used last)
    seabeds.delete(key); seabeds.set(key, cached);
    return cached;
  }
  const reef = shape === 'reef', islands = where ? where.islands : [{ x: 0, z: 0, habitat: HABITATS[shape] }], home = islands[where ? where.index : 0];
  const { positions, indices } = createSeabedField(level, islands).lattice(where?.reach);
  // Each triangle, in the order they are drawn (a later one over an earlier), sampled at twice the grid's fineness.
  const fineColumns = 2 * COLUMNS - 1, fineRows = 2 * ROWS - 1, half = STEP / 2, fine = new Float32Array(fineColumns * fineRows).fill(LAND);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a] - home.x, az = positions[a + 2] - home.z, bx = positions[b] - home.x, bz = positions[b + 2] - home.z, cx = positions[c] - home.x, cz = positions[c + 2] - home.z;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) + REACH.x) / half)), i1 = Math.min(fineColumns - 1, Math.floor((Math.max(ax, bx, cx) + REACH.x) / half));
    const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) + REACH.z) / half)), j1 = Math.min(fineRows - 1, Math.floor((Math.max(az, bz, cz) + REACH.z) / half));
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (i1 < i0 || j1 < j0 || Math.abs(det) < 1e-12) continue;
    const ay = positions[a + 1], by = positions[b + 1], cy = positions[c + 1];
    for (let j = j0; j <= j1; j++) {
      const z = -REACH.z + j * half;
      for (let i = i0; i <= i1; i++) {
        const x = -REACH.x + i * half, l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
        if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) fine[j * fineColumns + i] = l1 * ay + l2 * by + l3 * cy;
      }
    }
  }
  // A grid point holds the highest the drawing is within a cell of it, so what is read between the points (a blend of four of them) is never lower than it.
  const floors = new Float32Array(COLUMNS * ROWS);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLUMNS; i++) {
      let top = -Infinity;
      for (let fj = Math.max(0, 2 * j - 2); fj <= Math.min(fineRows - 1, 2 * j + 2); fj++) {
        for (let fi = Math.max(0, 2 * i - 2); fi <= Math.min(fineColumns - 1, 2 * i + 2); fi++) if (fine[fj * fineColumns + fi] > top) top = fine[fj * fineColumns + fi];
      }
      floors[j * COLUMNS + i] = top;
    }
  }
  const bare = Float32Array.from(floors);
  let deepest = Infinity;
  for (let i = 0; i < floors.length; i++) if (floors[i] < deepest) deepest = floors[i];
  // Things standing on the bottom: each is stamped in as a dome (a capsule for the wreck) of its own height over the floor.
  const stamp = (cx: number, cz: number, radius: number, height: number, base = -Infinity) => {
    const i0 = Math.max(0, Math.floor((cx - radius + REACH.x) / STEP)), i1 = Math.min(COLUMNS - 1, Math.ceil((cx + radius + REACH.x) / STEP));
    const j0 = Math.max(0, Math.floor((cz - radius + REACH.z) / STEP)), j1 = Math.min(ROWS - 1, Math.ceil((cz + radius + REACH.z) / STEP));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-REACH.x + i * STEP - cx, -REACH.z + j * STEP - cz);
        if (d >= radius) continue;
        const k = j * COLUMNS + i, top = (Number.isFinite(base) ? base : floors[k]) + height * Math.sqrt(1 - (d / radius) ** 2);
        if (top > floors[k]) floors[k] = top;
      }
    }
  };
  if (shape === 'wreck') {
    // The steamer lies in the bight, her hull a capsule from stern to bow: from the bottom up past the water on the bow side.
    const scale = islandScale(level);
    for (let t = 0; t <= 1; t += .04) {
      const at = alongWreck(t);
      stamp(at.x * scale, at.z * scale, WRECK.beam * scale * .7, WRECK.depth + WRECK.sheer + .1, at.y);
    }
  }
  // (what a body must fit over: the bare seabed, and the steamer where there is one)
  const solid = shape === 'wreck' ? Float32Array.from(floors) : bare;
  if (reef) {
    for (const head of coralHeads(level)) stamp(head.x, head.z, head.radius, head.height, head.floor);
    // The showpiece corals and the reef rock (from level 2 and 3), the moray's boulders, the octopus's rocks and the anemones, all the places the reef has.
    seabedProps(level, shape).forEach(([x, z], n) => stamp(x, z, n === 3 ? .17 : .22, n === 3 ? .12 : .2));
    const { dens, rocks, anemones } = reefRocks(level, 2, 3, 2, shape);
    for (const rock of [...dens.flat(), ...rocks]) stamp(rock.x, rock.z, REEF_ROCK.radius + .06, REEF_ROCK.height);
    for (const a of anemones) stamp(a.x, a.z, REEF_ANEMONE.radius, REEF_ANEMONE.height);
  }
  /** Bilinear lookup in a baked grid of heights, held at the edge beyond it (asked many times a frame: no calls, no allocation). */
  const lookup = (grid: Float32Array) => (x: number, z: number) => {
    let u = (x + REACH.x) / STEP, v = (z + REACH.z) / STEP;
    u = u < 0 ? 0 : u > COLUMNS - 1 - 1e-6 ? COLUMNS - 1 - 1e-6 : u;
    v = v < 0 ? 0 : v > ROWS - 1 - 1e-6 ? ROWS - 1 - 1e-6 : v;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * COLUMNS + i;
    const near = grid[k] + (grid[k + 1] - grid[k]) * fu, far = grid[k + COLUMNS] + (grid[k + COLUMNS + 1] - grid[k + COLUMNS]) * fu;
    return near + (far - near) * fv;
  };
  const sampled = new Map<string, Shallows>();
  const ground = lookup(bare);
  let exact: ((x: number, z: number) => number) | null = null;
  const seabed: Seabed = {
    level,
    deepest,
    floor: lookup(floors),
    solid: solid === bare ? ground : lookup(solid),
    ground,
    exact: (x, z) => {
      if (!exact) { const drawn = createSeabedField(level, islands).lattice(where?.reach); exact = drawnLookup(drawn.positions, drawn.indices, home); }
      return exact(x, z);
    },
    distanceTo(name, blocked) {
      let found = sampled.get(name);
      if (!found) {
        // The places blocked and the places not, each cell's distance to the other kind, on a grid of its own.
        const step = FIELD_STEP, columns = Math.ceil(2 * REACH.x / step) + 1, rows = Math.ceil(2 * REACH.z / step) + 1;
        const no = new Uint8Array(columns * rows), yes = new Uint8Array(columns * rows);
        let free = 0;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < columns; i++) {
            const is = blocked(-REACH.x + i * step, -REACH.z + j * step), n = j * columns + i;
            no[n] = is ? 1 : 0; yes[n] = is ? 0 : 1;
            if (!is) free++;
          }
        }
        // Nowhere it can be at all (a body bigger than any water there is): nowhere is blocked, and it only keeps to the land's rules.
        if (!free) {
          found = Object.assign(() => 1e3, { sample(_x: number, _z: number, out: ShoreSample) { out.distance = 1e3; out.nx = 0; out.nz = 1; } });
          sampled.set(name, found);
          return found;
        }
        const toNo = distanceToMask(no, columns, rows), toYes = distanceToMask(yes, columns, rows);
        const signed = new Float32Array(columns * rows), toward = new Float32Array(columns * rows * 2);
        // Half a cell either way puts the edge between the two kinds of cell, not on one of them.
        for (let n = 0; n < signed.length; n++) signed[n] = (no[n] ? -(toYes[n] - .5) : toNo[n] - .5) * step;
        // The way out of them, by differences across a cell (a unit direction, or nothing on a flat spot).
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < columns; i++) {
            const n = j * columns + i, dx = signed[j * columns + Math.min(i + 1, columns - 1)] - signed[j * columns + Math.max(i - 1, 0)];
            const dz = signed[Math.min(j + 1, rows - 1) * columns + i] - signed[Math.max(j - 1, 0) * columns + i], length = Math.sqrt(dx * dx + dz * dz);
            toward[2 * n] = length > 1e-9 ? dx / length : 0; toward[2 * n + 1] = length > 1e-9 ? dz / length : 0;
          }
        }
        found = Object.assign((x: number, z: number) => {
          let u = (x + REACH.x) / step, v = (z + REACH.z) / step;
          u = u < 0 ? 0 : u > columns - 1 - 1e-6 ? columns - 1 - 1e-6 : u;
          v = v < 0 ? 0 : v > rows - 1 - 1e-6 ? rows - 1 - 1e-6 : v;
          const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * columns + i;
          const near = signed[k] + (signed[k + 1] - signed[k]) * fu, far = signed[k + columns] + (signed[k + columns + 1] - signed[k + columns]) * fu;
          return near + (far - near) * fv;
        }, {
          sample(x: number, z: number, out: ShoreSample) {
            let u = (x + REACH.x) / step, v = (z + REACH.z) / step;
            u = u < 0 ? 0 : u > columns - 1 - 1e-6 ? columns - 1 - 1e-6 : u;
            v = v < 0 ? 0 : v > rows - 1 - 1e-6 ? rows - 1 - 1e-6 : v;
            const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * columns + i, k2 = k + columns;
            const w0 = (1 - fu) * (1 - fv), w1 = fu * (1 - fv), w2 = (1 - fu) * fv, w3 = fu * fv;
            out.distance = signed[k] * w0 + signed[k + 1] * w1 + signed[k2] * w2 + signed[k2 + 1] * w3;
            const nx = toward[2 * k] * w0 + toward[2 * k + 2] * w1 + toward[2 * k2] * w2 + toward[2 * k2 + 2] * w3;
            const nz = toward[2 * k + 1] * w0 + toward[2 * k + 3] * w1 + toward[2 * k2 + 1] * w2 + toward[2 * k2 + 3] * w3, n = Math.sqrt(nx * nx + nz * nz) || 1;
            out.nx = nx / n; out.nz = nz / n;
          },
        });
        sampled.set(name, found);
      }
      return found;
    },
  };
  seabeds.set(key, seabed);
  if (seabeds.size > KEPT) seabeds.delete(seabeds.keys().next().value!);
  return seabed;
}

/**
 * The island's steering field with the places an animal cannot be (`blocked`: water too shallow for its
 * body, see marine-bodies.ts) counted as shore: it keeps clear of the lagoon and crest, the shelf and the
 * sandbars the way it keeps clear of the beach, and the steering that follows the coast follows them too.
 * The land's own distance is unchanged; the blocked places count `offset` units nearer than they are, so an
 * animal with `islandClearance` from the land keeps `islandClearance - offset` from them (a smaller room:
 * its body is already counted in where it cannot be, and the wet-sand fringe of the beach is not there).
 */
export function avoidShallows(field: ShoreField, blocked: Shallows, offset: number): ShoreField {
  const SOFT = .6, away: ShoreSample = { distance: 0, nx: 0, nz: 1 };
  return {
    island(x: number, z: number, allowance = 0) {
      // (the land's field makes a new sample each time, which this one becomes: asked many times a step, so nothing is made here)
      const own = field.island(x, z, allowance), s = blocked(x, z) + offset;
      // Nowhere near any of them: the land's, as it was.
      if (s - own.distance > SOFT) return own;
      blocked.sample(x, z, away);
      const h = Math.max(SOFT - Math.abs(own.distance - s), 0) / SOFT;
      // The two blended where they are close, as islets blend into the island (a polynomial smooth minimum).
      const distance = Math.min(own.distance, s) - h * h * SOFT / 4, ownWeight = own.distance < s ? 1 - h / 2 : h / 2;
      const nx = own.nx * ownWeight + away.nx * (1 - ownWeight), nz = own.nz * ownWeight + away.nz * (1 - ownWeight), n = Math.sqrt(nx * nx + nz * nz) || 1;
      own.distance = distance; own.nx = nx / n; own.nz = nz / n;
      return own;
    },
    shore: field.shore,
  };
}

/** The water over the bottom at a point (x, z): how far down the bottom is from the calm surface (units), never negative. */
export const waterOver = (seabed: Seabed, x: number, z: number) => Math.max(0, SURFACE_Y - seabed.floor(x, z));
