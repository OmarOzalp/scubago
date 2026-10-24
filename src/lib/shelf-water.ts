import { frame, TAU, type World } from './steering';

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

/** The widest ocean a body may be given (a factor of the usual), the share of directions that may stay cut off, and the narrowest stretch of water (units) along a direction that is not. */
const REACH = 1.15, CUT = .1, RING = .4;
/** Where the edge of the ocean is for a body's middle, a little in from where the frame is (a share of the ocean). */
const HOLD = .02;

/** The directions looked along, round the island from its middle. */
const RAYS = 72;

/**
 * What a body asks of the water round the island where it is more than a big animal's: the tuna school, a body 2.6 units long and 1.2
 * wide that must hold together to be a school, needs a pass round the island a unit wide; in an ocean no wider than the view is at
 * the sides (1.1 times the usual: a wider one puts the school out of view for a fifth of the time at the top level, and a narrower
 * pass strings it out round the island). It may be cut off in a quarter of the directions.
 */
export const SCHOOL_SHELF = { ring: 1, reach: 1.1, cut: .25 };

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

/**
 * How many of the directions (of `RAYS`, round the island) have no stretch of `width` of the water the body fits in inside the ocean
 * `world` (the shelf reaches the edge of the view there).
 */
function cutDirections(world: World, shallow: ShelfInput['shallow'], width: number) {
  let count = 0;
  for (let k = 0; k < RAYS; k++) {
    const ux = Math.cos(k * TAU / RAYS), uz = Math.sin(k * TAU / RAYS);
    let run = 0, longest = 0;
    for (let r = .5; r < 14 && frame(ux * r, uz * r, world).edge <= 1 - HOLD; r += .05) {
      if (shallow(ux * r, uz * r)) run = 0; else longest = Math.max(longest, run += .05);
    }
    if (longest < width) count++;
  }
  return count;
}

/**
 * The ocean a body keeps to at an island: the smallest (no wider than the reach) in which the water it fits in is a ring round the
 * island, with all but a tenth of the directions open.
 */
export function shelfWater({ world, shallow, fit }: ShelfInput): ShelfWater {
  const ring = fit?.ring ?? RING, reach = fit?.reach ?? REACH, allowed = RAYS * (fit?.cut ?? CUT);
  let factor = 1, count = cutDirections(world, shallow, ring);
  while (factor < reach && count > allowed) {
    factor = Math.min(reach, factor + .05);
    count = cutDirections({ x: world.x * factor, z: world.z * factor }, shallow, ring);
  }
  return { factor };
}
