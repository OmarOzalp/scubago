import { TAU, type World } from './steering';

/**
 * The biggest animals on an island with a wide shelf. At the Coral Reef the water a whale shark, a manta, a leatherback (and from the
 * middle levels a tiger shark or a great white) fits in, with all of its body over the bottom and its back under the surface, begins
 * not far inside the edge of what the camera shows: its crest comes out toward the edge of the frame, and a body with a span of two
 * units has to keep its wingtips off the slope outside it. The reef's outer slope is a steep wall (`OCEAN.reefCrest.wall`, ocean.ts),
 * so that the deep water begins as close to the crest as a body's span allows, and the view is zoomed out a tenth (`VIEW_ZOOM`,
 * steering.ts), so that what is left is a ring of deep water all the way round the island; narrow, for the widest bodies, at the edge
 * of the frame. So the ocean such a body keeps to (marine-motion.ts, `waterFor`) is a little wider than the usual (`factor`, no more
 * than `REACH` times: the most the frame's bounds allow), until its water is a ring all the way round inside it, and its way round
 * the island (its lane) has room in it everywhere.
 *
 * Only a body whose water would be cut off is touched, and only on an island whose shelf cuts it off: the tuna school asks for less
 * (`SCHOOL_SHELF`), the other islands' animals, the reef's small sharks and every bottom-dweller swim in the usual ocean.
 */

/**
 * The widest ocean a body may be given (a factor of the usual), the share of directions that may stay cut off (a twentieth: at the top levels the
 * deep water round the islets' reefs is narrow in a few directions only, and a body kept to the usual ocean there would be held off it by the
 * frame), and the narrowest stretch of water (units) along a direction that is not.
 */
const REACH = 1.15, CUT = .05, RING = .4;
/** Where the edge of the ocean is for a body's middle, a little in from where the frame is (a share of the ocean). */
const HOLD = .02;

/** The directions looked along, round the island from its middle. */
const RAYS = 72;

/**
 * What a body asks of the water round the island where it is more than a big animal's: the tuna school, a body 2.6 units long and 1.2
 * wide that must hold together to be a school, needs a pass round the island a unit wide; in an ocean no wider than the view is at
 * the sides (1.1 times the usual: a wider one puts the school out of view for a fifth of the time at the top level, and a narrower
 * pass strings it out round the island). It may be cut off in a seventh of the directions (at the top level, where the deep water
 * round the islets' reefs is narrow at the edge of the view in a few directions only, more would leave it the usual ocean, in which
 * it cannot get round the southwest islet's reef).
 */
export const SCHOOL_SHELF = { ring: 1, reach: 1.1, cut: .15 };

export type ShelfInput = {
  /** The ocean the animals keep to at this level. */
  world: World;
  /** What the body asks of the water instead of the big animals' (`SCHOOL_SHELF`). */
  fit?: { ring: number; reach: number; cut: number };
  /** Which places are too shallow for the body. */
  shallow: (x: number, z: number) => boolean;
};
export type ShelfWater = {
  /** How much wider than the usual the body's ocean is (1: the usual). */
  factor: number;
};

/** The distances looked at along each direction (units from the island's middle), and the directions. */
const ALONG = (() => { const at: number[] = []; for (let r = .5; r < 14; r += .05) at.push(r); return Float64Array.from(at); })();
const DIRECTIONS = Array.from({ length: RAYS }, (_, k) => [Math.cos(k * TAU / RAYS), Math.sin(k * TAU / RAYS)] as const);

/**
 * How many of the directions (of `RAYS`, round the island) have no stretch of `width` of the water the body fits in inside the ocean
 * `world` (the shelf reaches the edge of the view there). `shallow(k, s)`: whether the place `ALONG[s]` out along direction `k` is too
 * shallow for it. Each direction is looked along from where the ocean ends inward, until a stretch wide enough is found (the open sea is
 * usually the first), rather than out from the island's middle across the island, the lagoon and the reef: the same stretches either way.
 */
function cutDirections(world: World, shallow: (k: number, s: number) => boolean, width: number) {
  let count = 0;
  for (let k = 0; k < RAYS; k++) {
    const [ux, uz] = DIRECTIONS[k];
    // Where the ocean ends along it: the first place past its bound (the bound only grows outward).
    let lo = 0, hi = ALONG.length;
    while (lo < hi) { const s = (lo + hi) >> 1; if (edgeOf(ux * ALONG[s], uz * ALONG[s], world) <= 1 - HOLD) lo = s + 1; else hi = s; }
    let run = 0, open = false;
    for (let s = lo - 1; s >= 0 && !open; s--) {
      if (shallow(k, s)) run = 0; else open = (run += .05) >= width;
    }
    if (!open) count++;
  }
  return count;
}

/** `frame(x, z, world).edge`, worked out the same way, without the rest. */
function edgeOf(x: number, z: number, world: World) {
  const u = x / world.x, v = z / world.z, u2 = u * u, v2 = v * v, u4 = u2 * u2, v4 = v2 * v2;
  return Math.pow(u4 * u2 + v4 * v2, 1 / 6);
}

/**
 * The ocean a body keeps to at an island: the smallest (no wider than the reach) in which the water it fits in is a ring round the
 * island, with all but a twentieth of the directions open.
 */
export function shelfWater({ world, shallow, fit }: ShelfInput): ShelfWater {
  const ring = fit?.ring ?? RING, reach = fit?.reach ?? REACH, allowed = RAYS * (fit?.cut ?? CUT);
  // (each place judged once, however many oceans are tried: 0 not yet, 1 open, 2 too shallow)
  const seen = new Uint8Array(RAYS * ALONG.length);
  const judged = (k: number, s: number) => {
    const n = k * ALONG.length + s;
    if (!seen[n]) { const [ux, uz] = DIRECTIONS[k]; seen[n] = shallow(ux * ALONG[s], uz * ALONG[s]) ? 2 : 1; }
    return seen[n] === 2;
  };
  let factor = 1, count = cutDirections(world, judged, ring);
  while (factor < reach && count > allowed) {
    factor = Math.min(reach, factor + .05);
    count = cutDirections({ x: world.x * factor, z: world.z * factor }, judged, ring);
  }
  return { factor };
}
