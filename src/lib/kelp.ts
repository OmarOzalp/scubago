import { shoreDistance, shorePolygons } from './island-outline';
import { OCEAN, seabedProfile, shelfStretch } from './ocean';
import { clamp, smoothstep } from './steering';

/**
 * The Kelp Forest island's giant kelp (Macrocystis pyrifera), as plain data shared by the renderer
 * (kelp-forest.tsx) and the swimming simulation: where each plant's holdfast grips the rocky reef,
 * how tall it stands to the surface, and which way its canopy streams.
 *
 * Giant kelp grows in beds on rocky reef from the edge of the surf out to deep water: clumps of
 * plants with channels of open water between them. Each plant is a holdfast with a few stipes
 * rising to the surface, blades along them on gas-filled floats, and at the top the stipes lie
 * along the surface and stream with the current, a floating canopy.
 */
export const KELP = {
  /** Holdfasts from this far off the shore out to this far (units), the beds thinning toward both edges. */
  band: [.45, 3.1] as const,
  /** Candidate holdfasts on a jittered grid this far apart (units). */
  spacing: .3,
  /** How much of the reef the beds cover (0 to 1): candidates where the bed noise is above 1 minus this grow. */
  cover: .5,
  /** The beds' size: the bed noise's features are about this many units across. */
  bedSize: 1.7,
  /** Plants at most, full quality and lite (the beds thinned evenly). */
  plants: { full: 66, lite: 32 },
  /** Which way the current streams the canopy (radians from +x toward +z) and how much plants differ. */
  current: .5, currentSpread: .45,
  /** The canopy's length along the surface (units), shortest to longest. */
  canopy: [.45, .95] as const,
  /** Stipes per plant, fewest to most. */
  stipes: [2, 4] as const,
  /** The surge: how far the stipes' tops swing (units), and its period (s). */
  surge: { reach: .07, period: 9.5 },
};

export type KelpPlant = {
  /** The holdfast's place on the seabed (world units) and the floor's height there. */
  x: number; z: number; floor: number;
  /** Rise from the holdfast to the surface (units). */
  height: number;
  /** The canopy's direction along the surface (unit vector) and its length (units). */
  dx: number; dz: number; canopy: number;
  /** Stipes, its own sway phase (radians) and a size factor for its blades. */
  stipes: number; phase: number; size: number;
};

const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
/** Smooth value noise in 0..1, features about one unit across. */
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
/** The beds: patchy, clumped noise in 0..1. */
const bedNoise = (x: number, z: number) => noise(x / KELP.bedSize + 3.7, z / KELP.bedSize - 1.9) * .7 + noise(x * 2.3 / KELP.bedSize - 5, z * 2.3 / KELP.bedSize + 8) * .3;

const cache = new Map<string, KelpPlant[]>();

/**
 * The kelp around the island at this level: holdfasts on the reef in clumped beds with open channels
 * between them, thinning toward the surf and toward deep water, at most `limit` plants (thinned
 * evenly, keeping the beds' shape). Deterministic.
 */
export function kelpPlants(level: number, limit: number = KELP.plants.full): KelpPlant[] {
  const key = `${level}:${limit}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const polygons = shorePolygons(level);
  const [inner, outer] = KELP.band, step = KELP.spacing, extent = 6;
  const candidates: (KelpPlant & { rank: number })[] = [];
  for (let j = -extent / step; j <= extent / step; j++) {
    for (let i = -extent / step; i <= extent / step; i++) {
      const x = (i + (hash(i, j) - .5) * .8) * step, z = (j + (hash(j + 31, i) - .5) * .8) * step;
      const distance = shoreDistance(polygons, x, z);
      if (distance < inner || distance > outer) continue;
      // Thinner toward the surf and toward the deep edge of the reef.
      const edge = smoothstep(inner, inner + .35, distance) * (1 - smoothstep(outer - .6, outer, distance));
      const bed = bedNoise(x, z) * (.55 + .45 * edge);
      if (bed < 1 - KELP.cover) continue;
      const { floor } = seabedProfile(distance / shelfStretch(x, z));
      const angle = KELP.current + (hash(i * 3.1, j * 1.7) - .5) * 2 * KELP.currentSpread;
      const [shortest, longest] = KELP.canopy;
      candidates.push({
        x, z, floor, height: OCEAN.surfaceLevel - floor,
        dx: Math.cos(angle), dz: Math.sin(angle),
        canopy: shortest + (longest - shortest) * hash(i + 7, j - 3) * clamp(.4 + bed, 0, 1),
        stipes: KELP.stipes[0] + Math.floor(hash(i - 5, j + 9) * (KELP.stipes[1] - KELP.stipes[0] + 1)),
        phase: hash(i * 7.7, j * 5.3) * Math.PI * 2, size: .8 + .4 * hash(i + 13, j + 21),
        rank: hash(i * .37 + 2, j * .71 - 4),
      });
    }
  }
  // Thin evenly to the limit: drop those ranked last, so the beds keep their shape.
  const kept = candidates.length <= limit ? candidates : [...candidates].sort((a, b) => a.rank - b.rank).slice(0, limit);
  const plants = kept.map(({ rank: _rank, ...plant }) => plant);
  cache.set(key, plants);
  return plants;
}
