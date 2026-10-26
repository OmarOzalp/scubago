import { OCEAN, reefCrestAt, seabedPatch, type OceanConfig } from './ocean';
import { coralHeads } from './reef-coast';
import { createSeabedField, type OceanIsland } from './seabed';
import { bakedDepth, bakedShoaling } from './seabed-bake';
import { hash, oceanBox, type WaterExtent } from './seabed-lattice';

/**
 * The numbers the ocean is drawn with (ocean-mesh.ts makes its textures and meshes from them), apart from three.js so
 * they can be built ahead of time (seabed-bake.ts) and checked under Jest: the depth map's texels and the water
 * lattice's vertices.
 */

/**
 * The depth map reaches `margin` units past every island's middle (past it the water is
 * open ocean, which the map's edge texels carry on), at `perUnit` texels a unit (128 across
 * one island's 18 units). `maxDepth` is the deepest depth it encodes.
 */
export const DEPTH = { margin: 9, perUnit: 128 / 18, maxDepth: 4 };
/** How many different waters (palettes) one ocean blends: one channel each of the region maps (four to a map). */
export const OCEAN_REGIONS = 8;
/** How gradually one island's water gives way to the next across the open water between them (units). */
const REGION_BLEND = 2.4;

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The depth map's texels at this level (see buildDepthField in ocean-mesh.ts for what each channel holds), its region
 * maps, and what goes with them. The depth texels are built ahead of time where there is a bake (the very same bytes).
 */
export function depthTexels(level: number, islands: readonly OceanIsland[], config: OceanConfig = OCEAN) {
  // The seabed under the islands (seabed.ts: one function for this map and for the animals above it): each island's own
  // shores in its own frame (its outline and size: island-outline.ts), the nearest one wherever two reach, the Coral
  // Reef's lagoon and crest, and the bank between the islands.
  const { shores, reefs, nearest, profileAt, bank, lattice } = createSeabedField(level, islands, config);
  const xs = islands.map((i) => i.x), zs = islands.map((i) => i.z);
  const x0 = Math.min(...xs) - DEPTH.margin, z0 = Math.min(...zs) - DEPTH.margin;
  const width = Math.max(...xs) - Math.min(...xs) + 2 * DEPTH.margin, depth = Math.max(...zs) - Math.min(...zs) + 2 * DEPTH.margin;
  const columns = Math.round(width * DEPTH.perUnit), rows = Math.round(depth * DEPTH.perUnit);
  const habitats = [...new Set(islands.map((i) => i.habitat))].slice(0, OCEAN_REGIONS);
  // The Coral Reef's bommies' rubble on the lagoon floor.
  const bommies = islands.map((_, n) => (reefs[n] ? coralHeads(level).filter((head) => !head.crest) : []));
  // Every island's shores in the world, for anything measuring from them.
  const polygons = islands.flatMap((island, n) => shores[n].map((poly) => poly.map((v, k) => v + (k % 2 ? island.z : island.x))));
  // The coral channel: the crest's coral and the bommies' rubble up to .5, the crest's surf on to 1.
  const reefAt = (x: number, z: number, reach: number, heads: ReturnType<typeof coralHeads>) => {
    if (reach <= 0) return 0;
    const crest = reefCrestAt(x, z, reach, config);
    let coral = crest.coral;
    if (reach > .85 && reach < 1.5) {
      for (const head of heads) {
        if (Math.abs(x - head.x) > .45 || Math.abs(z - head.z) > .45) continue;
        const d = Math.hypot(x - head.x, z - head.z);
        if (d < head.radius * 1.8) coral = Math.max(coral, .6 * (1 - smooth(head.radius * .7, head.radius * 1.8, d)));
      }
    }
    return .5 * Math.min(1, coral) + .5 * Math.min(crest.surf, coral);
  };
  const baked = config === OCEAN ? bakedDepth(level, islands) : undefined;
  const data = baked && baked.length === columns * rows * 4 ? baked : new Uint8Array(columns * rows * 4);
  const region = new Uint8Array(columns * rows * 4), regionMore = new Uint8Array(columns * rows * 4);
  const weights = new Float32Array(OCEAN_REGIONS);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = x0 + (i + .5) / columns * width, z = z0 + (j + .5) / rows * depth;
      const k = (j * columns + i) * 4;
      if (data !== baked) {
        const near = nearest(x, z);
        const { depth: water, wet } = profileAt(x, z, near);
        data[k] = Math.round(255 * Math.sqrt(Math.min(1, water / DEPTH.maxDepth)));
        data[k + 1] = Math.round(255 * Math.min(1, Math.max(0, -wet) / .2));
        data[k + 2] = Math.round(255 * seabedPatch(near.x, near.z, near.reach));
        data[k + 3] = near.reef ? Math.round(255 * reefAt(near.x, near.z, near.reach, bommies[near.island])) : 0;
      }
      // Each island's water, fading out past the nearer island's across the open sea between them (one island's alone: all its own).
      if (islands.length === 1) { region[k] = 255; continue; }
      weights.fill(0);
      const closest = Math.min(...islands.map((island) => Math.hypot(x - island.x, z - island.z)));
      for (const island of islands) {
        const slot = habitats.indexOf(island.habitat);
        if (slot >= 0) weights[slot] += Math.exp(-(Math.hypot(x - island.x, z - island.z) - closest) / REGION_BLEND);
      }
      const total = weights.reduce((sum, w) => sum + w, 0);
      for (let c = 0; c < 4; c++) { region[k + c] = Math.round(255 * weights[c] / total); regionMore[k + c] = Math.round(255 * weights[c + 4] / total); }
    }
  }
  return {
    data, region, regionMore, habitats, polygons, islands, bank, level,
    area: { x0, z0, width, depth }, columns, rows,
    profile: (x: number, z: number) => profileAt(x, z), lattice,
  };
}

/**
 * The water's lattice, reaching `extent` units each way from every island's middle: jittered triangles, irregular
 * low-poly facets instead of a visible grid (vertex x, 0, z), and how much each vertex's waves shoal over the shallows
 * (`profile`: the seabed's), built ahead of time where there is a bake (the very same values, as the vertex attribute
 * holds them).
 */
export function waterVertices(level: number, islands: readonly OceanIsland[], profile: (x: number, z: number) => { wet: number }, config: OceanConfig, extent: WaterExtent) {
  const s = config.facetSize, h = s * Math.sqrt(3) / 2, box = oceanBox(islands, extent);
  const cols = Math.ceil(box.width / s) + 1, rows = Math.ceil(box.depth / h) + 1;
  const baked = config === OCEAN ? bakedShoaling(level, islands, extent) : undefined;
  const positions: number[] = [], indices: number[] = [];
  const shoaling: number[] | Float32Array = baked && baked.length === cols * rows ? baked : [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edge = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      const jx = edge ? 0 : (hash(c, r) - .5) * .36 * s, jz = edge ? 0 : (hash(r, c + 17) - .5) * .36 * s;
      const x = box.x0 + c * s + (r % 2) * s / 2 + jx, z = box.z0 + r * h + jz;
      positions.push(x, 0, z);
      if (shoaling !== baked) (shoaling as number[]).push(Math.min(1, Math.max(0, profile(x, z).wet / config.waveShoaling)));
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (r % 2 === 0) indices.push(a, d, b, b, d, e);
      else indices.push(a, e, b, a, d, e);
    }
  }
  return { positions, shoaling, indices };
}
