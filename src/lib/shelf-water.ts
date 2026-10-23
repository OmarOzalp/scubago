import { frame, TAU, type World } from './steering';

/**
 * The biggest animals on an island with a wide shelf. At the Coral Reef the water a whale shark, a manta, a leatherback (and from the
 * middle levels a tiger shark or a great white) fits in, with all of its body over the bottom and its back under the surface, begins
 * at the very edge of what the camera shows: its crest comes almost to the edge of the frame, and a body with a span of two units has
 * to keep its wingtips off the slope outside it. The reef's outer slope is a steep wall (`OCEAN.reefCrest.wall`, ocean.ts), so that
 * the deep water begins as close to the crest as a body's span allows; what is left is a ring of deep water round the island that is
 * narrow at the edge of the frame, and cut off in a few directions for the widest bodies. This module is how the motion
 * (marine-motion.ts, `waterFor`) deals with that:
 *
 *  - the ocean a body keeps to is a little wider than the usual (`factor`, no more than `REACH` times: the most the frame's bounds allow)
 *    until the water it fits in is a ring all the way round the island;
 *  - where it is still cut off, the edge of that ocean is shore to the body, and it turns about before it comes to such a dead end
 *    (marine-motion.ts, `DEAD_END_LOOK`) rather than be caught in it.
 *
 * Only a body whose water is cut off is touched, and only on an island whose shelf cuts it off: the tuna school asks for less
 * (`SCHOOL_SHELF`), the other islands' animals, the reef's small sharks and every bottom-dweller swim as they always did.
 */

/** The widest ocean a body may be given (a factor of the usual), the share of directions that may stay cut off, and the narrowest stretch of water (units) along a direction that is not. */
const REACH = 1.15, CUT = .1, RING = .4;
/**
 * The radius (units) the water a big body keeps to is opened by (`Seabed.distanceTo`): a neck of it narrower than twice that is
 * closed, and the body turns about before it, as at the end of a ring, instead of being lifted over the slope in it by its wingtip
 * or its tail (a lift shows higher up the picture, and at the edge of the frame out of it). It grows with how far the body reaches
 * from its middle (units, `reach`): the ring's width for one of a unit's reach, twice that for one of a unit and a third.
 */
export const openingFor = (reach: number) => Math.min(.4, Math.max(.2, .2 + .2 * (reach - 1) / .4));
/** Where the edge of the ocean is for a body's middle, a little in from where the frame is, so that none is held past the frame's bound (a share of the ocean). */
const HOLD = .02;

/** The directions looked along, round the island from its middle, and how many each side of a cut one count as cut. */
const RAYS = 72, SPREAD = 2;

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
  /** The radius the water it keeps to is opened by where it is cut off (`openingFor`: half the ring's width unless told). */
  open?: number;
};
export type ShelfWater = {
  /** How much wider than the usual the body's ocean is (1: the usual). */
  factor: number;
  /** Whether a place is out of its water: too shallow, or past the edge of its ocean where the water inside it is cut off. */
  blocked: (x: number, z: number) => boolean;
  /** Whether the water is cut off in any direction (the body cannot go round the island in view). */
  cut: boolean;
  /** The radius (units) the water it keeps to is opened by (seabed.ts, `distanceTo`): none where it is not cut off. */
  opening: number;
};

/**
 * The directions (of `RAYS`, round the island) in which the water the body fits in has no stretch of `width` inside the ocean `world`
 * (the shelf reaches the edge of the view there), and how many there are before the neighbors of each are counted too.
 */
function cutDirections(world: World, shallow: ShelfInput['shallow'], width: number) {
  const cut = new Uint8Array(RAYS), near = new Uint8Array(RAYS);
  let count = 0;
  for (let k = 0; k < RAYS; k++) {
    const ux = Math.cos(k * TAU / RAYS), uz = Math.sin(k * TAU / RAYS);
    let run = 0, longest = 0;
    for (let r = .5; r < 14 && frame(ux * r, uz * r, world).edge <= 1 - HOLD; r += .05) {
      if (shallow(ux * r, uz * r)) run = 0; else longest = Math.max(longest, run += .05);
    }
    if (longest < width) { cut[k] = 1; count++; }
  }
  for (let k = 0; k < RAYS; k++) for (let d = -SPREAD; d <= SPREAD; d++) if (cut[(k + d + RAYS) % RAYS]) near[k] = 1;
  return { cut: near, count };
}

/**
 * The water a body keeps to at an island: the smallest ocean (no wider than the reach) in which the water it fits in is a ring round
 * the island, with all but a tenth of the directions open.
 */
export function shelfWater({ world, shallow, fit, open }: ShelfInput): ShelfWater {
  const ring = fit?.ring ?? RING, reach = fit?.reach ?? REACH, allowed = RAYS * (fit?.cut ?? CUT);
  let factor = 1, found = cutDirections(world, shallow, ring);
  while (factor < reach && found.count > allowed) {
    factor = Math.min(reach, factor + .05);
    found = cutDirections({ x: world.x * factor, z: world.z * factor }, shallow, ring);
  }
  const w = { x: world.x * factor, z: world.z * factor }, cut = found.count > 0;
  // A body that fits all the way round needs no wall: the edge of the frame is steering's.
  if (!cut) return { factor, cut, blocked: shallow, opening: 0 };
  return { factor, cut, blocked: (x, z) => shallow(x, z) || frame(x, z, w).edge > 1 - HOLD, opening: fit ? ring / 2 : open ?? RING / 2 };
}
