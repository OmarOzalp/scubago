import { shoreDistance, shorePolygons } from './island-outline';
import { OCEAN, seabedPatch, seabedProfile, shelfStretch } from './ocean';
import { smoothstep } from './steering';

/**
 * The Mangroves & Seagrass island's seagrass meadows, as plain data for the renderer
 * (seagrass-meadow.tsx): where each tuft of turtle grass grows on the sandy shelf around the island
 * and how tall it stands. Seagrass grows in the clear, shallow water beyond the mangroves' roots, in
 * meadows with bare sand between them (wherever the seabed has its green patches, `seabedPatch`, and
 * in broader meadows of their own), always under the surface, and thins out where the shelf drops
 * away into deeper water.
 */
export const SEAGRASS = {
  /** Tufts from this far off the shore out to this far (units), thinning toward both edges. */
  band: [.08, .95] as const,
  /** Candidate tufts on a jittered grid this far apart (units). */
  spacing: .07,
  /** Grows where the seabed's patches are at least this strong (0 to 1), or the meadows' own noise is. */
  patch: .14,
  /** How much of the shelf the meadows of their own cover (0 to 1), and their size (units across). */
  cover: .5, meadowSize: 1.2,
  /** How far below the calm surface a blade's tip stays at least (units). */
  clearance: .05,
  /** Tufts at most, full quality and lite (thinned evenly), and blades per tuft. */
  tufts: { full: 1150, lite: 420 },
  blades: { full: 4, lite: 3 },
  /** Blade height (units), shortest to longest. */
  height: [.05, .115] as const,
  /** The surge: how far the blades' tips sway (units), and its period (s). */
  surge: { reach: .022, period: 6.5, direction: .9 },
};

export type SeagrassTuft = {
  /** The tuft's place on the seabed (world units from the island's middle) and the floor's height there. */
  x: number; z: number; floor: number;
  /** Blade height (units), its own sway phase (radians) and the way it faces (radians). */
  height: number; phase: number; turn: number;
};

const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
/** Smooth value noise in 0..1, features about one unit across. */
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
/** The meadows of their own: patchy noise in 0..1, strong where it clears the cover's threshold. */
const meadowNoise = (x: number, z: number) => {
  const n = noise(x / SEAGRASS.meadowSize - 2.3, z / SEAGRASS.meadowSize + 4.1) * .7 + noise(x * 2.7 / SEAGRASS.meadowSize + 6, z * 2.7 / SEAGRASS.meadowSize - 3) * .3;
  return smoothstep(1 - SEAGRASS.cover, 1 - SEAGRASS.cover + .25, n);
};

const cache = new Map<string, SeagrassTuft[]>();

/**
 * The seagrass around the island at this level: tufts on the shelf in meadows with bare sand
 * between, thinning toward the roots and toward deep water, at most `limit` (thinned evenly, keeping
 * the meadows' shape). Deterministic.
 */
export function seagrassTufts(level: number, limit: number = SEAGRASS.tufts.full): SeagrassTuft[] {
  const key = `${level}:${limit}`;
  const cached = cache.get(key);
  if (cached) return cached;
  // The Mangroves' own island.
  const polygons = shorePolygons(level, 24, 'mangrove');
  const [inner, outer] = SEAGRASS.band, step = SEAGRASS.spacing, extent = 4.6;
  const candidates: (SeagrassTuft & { rank: number })[] = [];
  for (let j = -extent / step; j <= extent / step; j++) {
    for (let i = -extent / step; i <= extent / step; i++) {
      const x = (i + (hash(i, j) - .5) * .9) * step, z = (j + (hash(j + 17, i) - .5) * .9) * step;
      const distance = shoreDistance(polygons, x, z);
      if (distance < inner || distance > outer) continue;
      const reach = distance / shelfStretch(x, z);
      const meadow = Math.max(seabedPatch(x, z, reach), meadowNoise(x, z)) * (.6 + .4 * smoothstep(inner, inner + .2, distance));
      if (meadow < SEAGRASS.patch) continue;
      const { floor } = seabedProfile(reach);
      const [shortest, tallest] = SEAGRASS.height;
      // Taller in the heart of a meadow, never reaching the surface.
      const height = Math.min(OCEAN.surfaceLevel - SEAGRASS.clearance - floor, shortest + (tallest - shortest) * Math.min(1, hash(i + 5, j - 9) * .5 + meadow * .6));
      if (height < shortest * .6) continue;
      candidates.push({
        x, z, floor, height,
        phase: hash(i * 3.3, j * 7.1) * Math.PI * 2, turn: hash(i - 2, j + 11) * Math.PI,
        rank: hash(i * .53 + 3, j * .29 - 7),
      });
    }
  }
  const kept = candidates.length <= limit ? candidates : [...candidates].sort((a, b) => a.rank - b.rank).slice(0, limit);
  const tufts = kept.map(({ rank: _rank, ...tuft }) => tuft);
  cache.set(key, tufts);
  return tufts;
}
