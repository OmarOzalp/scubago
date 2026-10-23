import type { ShoreField } from './island-outline';
import { OCEAN } from './ocean';
import type { Seabed } from './seabed';
import type { MarineModel } from './swimming';

/**
 * How far each animal's body reaches from its middle (the model's pivot, as drawn: units), measured
 * from the shipped models over a swimming stroke (scripts/verify-marine.mjs checks that none has grown
 * past them): how far below the middle its body hangs, its fins or wings out at the sides (a manta's
 * wingtip at the bottom of a stroke), its nose and its tail (a shark's tail hangs lower than its
 * nose; negative is above the middle), how far above it reaches (a back or dorsal fin), and half its
 * span and half its length. The swimming keeps all of this above the seabed (marine-motion.ts).
 */
export type Hull = { keel: number; wing: number; nose: number; tail: number; crest: number; width: number; length: number };
const HULL_ROWS: Record<MarineModel, readonly [number, number, number, number, number, number, number]> = {
  // The three family models (shark, manta, reef fish) are measured over their artist-made swim clips.
  shark: [.14, .25, .08, .22, .57, .45, 1.24],
  manta: [.17, .34, 0, .05, .42, .83, 1.57],
  'reef-fish': [.12, .07, -.01, .07, .17, .07, .53],
  'whale-shark': [.27, .34, .12, .32, .54, .9, 1.8],
  'tiger-shark': [.18, .29, .09, .2, .44, .62, 1.42],
  'great-white-shark': [.2, .28, .04, .32, .53, .65, 1.5],
  'scalloped-hammerhead': [.15, .22, .05, .16, .45, .5, 1.28],
  'reef-manta': [.13, .36, 0, .08, .35, 1.11, 1.1],
  // Upright in its model (its fins are its height); swimming rolls it onto its side.
  'mola-mola': [1.3, 1.26, .52, .47, 1.3, .38, .93],
  'green-turtle': [.22, .3, .07, .06, .28, .84, .6],
  'bottlenose-dolphin': [.13, .2, .06, .14, .28, .34, .87],
  'great-barracuda': [.11, .16, .06, .16, .17, .24, .9],
  // (Its crest is its sail raised, as it shows it off.)
  sailfish: [.25, .27, .03, .27, .45, .27, 1.1],
  'california-sea-lion': [.28, .33, .06, .07, .14, .5, .72],
  'spotted-eagle-ray': [.12, .31, 0, .1, .29, .71, 1.66],
  'golden-jellyfish': [.21, .07, .09, .15, .22, .25, .24],
  'humpback-whale': [.43, .64, .21, .29, .49, 1.41, 1.91],
  'sperm-whale': [.3, .29, .12, .23, .31, .55, 1.83],
  'oceanic-whitetip': [.18, .26, .05, .22, .52, .76, 1.41],
  'leatherback-turtle': [.52, .6, .1, .25, .59, 1.36, .79],
  'oceanic-manta': [.15, .42, 0, .09, .41, 1.31, 1.29],
  'harbor-seal': [.14, .03, .07, .06, .13, .44, .69],
  'sea-otter': [.09, .1, .05, .1, .1, .25, .47],
  garibaldi: [.11, .06, .05, .06, .13, .1, .3],
  'leafy-seadragon': [.07, .08, .04, .07, .13, .1, .31],
  orca: [.22, .33, .17, .21, .64, .5, 1.33],
  'marine-iguana': [.03, .03, .02, .01, .06, .15, .57],
  'galapagos-shark': [.18, .25, .09, .23, .49, .55, 1.38],
  'thresher-shark': [.21, .24, .04, -.2, .52, .58, 1.74],
  'giant-trevally': [.2, .14, .13, .14, .28, .14, .57],
  'king-angelfish': [.16, .14, .06, .15, .19, .1, .3],
  dugong: [.19, .21, .19, .17, .19, .36, .92],
  sawfish: [.17, .17, .02, .17, .45, .46, 1.62],
  'lemon-shark': [.28, .28, .09, .2, .44, .58, 1.38],
  'southern-stingray': [.07, .07, 0, .1, .11, .51, 1.31],
  tarpon: [.22, .21, .09, .21, .29, .22, .9],
  'grey-reef-shark': [.16, .21, .08, .2, .39, .48, 1.17],
  'blacktip-reef-shark': [.12, .17, .06, .15, .34, .37, .99],
  'whitetip-reef-shark': [.14, .16, .05, .16, .34, .37, 1.08],
  'hawksbill-turtle': [.24, .27, .07, .06, .25, .76, .58],
  'napoleon-wrasse': [.26, .18, .15, .18, .3, .33, .87],
  'bumphead-parrotfish': [.2, .14, .1, .14, .22, .28, .69],
  'sand-tiger-shark': [.28, .24, .08, .15, .54, .53, 1.5],
  'loggerhead-turtle': [.18, .24, .1, .07, .18, .68, .68],
  'goliath-grouper': [.3, .2, .14, .22, .29, .38, 1.05],
  lionfish: [.17, .2, .04, .09, .21, .3, .3],
  batfish: [.34, .34, .11, .09, .37, .16, .38],
  'day-octopus': [.06, .11, .1, .1, .25, .56, .55],
  'giant-cuttlefish': [.07, .03, .04, .06, .09, .2, .44],
  'giant-moray': [.13, .09, .1, .09, .14, .18, .84],
  clownfish: [.1, .05, .05, .05, .11, .1, .28],
};
const HULLS = {} as Record<MarineModel, Hull>;
for (const [model, [keel, wing, nose, tail, crest, width, length]] of Object.entries(HULL_ROWS)) HULLS[model as MarineModel] = { keel, wing, nose, tail, crest, width, length };
export const hullOf = (model: MarineModel): Hull => HULLS[model];

/**
 * Room an animal keeps between its lowest point and the bottom (units): a little for any animal, more for
 * a big one, so a whale shark's wing never skims the sand a fish's would. The test of "never clips"
 * (swim-depth.test.ts) asks for half of it.
 */
export const marginOf = (hull: Hull) => .03 + .03 * hull.length;

/** The lowest points of a hull in the body's frame (x to its side, y up, z along it to the nose): 7 points, one after another. */
const POINTS = 7;
const bodies = new WeakMap<Hull, Float64Array>();
const spots = (hull: Hull) => {
  let points = bodies.get(hull);
  if (!points) {
    // (Out to three quarters of its length and .85 of its span: past that a tail, a saw or a wingtip is a thin tip.)
    const side = .85 * hull.width, end = .75 * hull.length, mid = (hull.keel + hull.wing) / 2;
    // The keel at the middle, the nose and the tail, halfway out each side, and the tips of the fins.
    points = Float64Array.of(
      0, -hull.keel, 0, 0, -hull.nose, end, 0, -hull.tail, -end,
      side / 2, -mid, 0, -side / 2, -mid, 0,
      side, -hull.wing, 0, -side, -hull.wing, 0,
    );
    bodies.set(hull, points);
  }
  return points;
};

/**
 * Where the lowest points of a hull are when it swims: the first `POINTS` entries of `out` get each
 * point's world x and z and its height below the animal's middle (negative). The body is rolled about
 * its length, then pitched (nose down is positive), then turned to its heading, as it is drawn.
 */
export function hullBottom(hull: Hull, x: number, z: number, heading: number, pitch: number, roll: number, out: Float64Array) {
  const body = spots(hull);
  const sr = Math.sin(roll), cr = Math.cos(roll), sp = Math.sin(pitch), cp = Math.cos(pitch), sh = Math.sin(heading), ch = Math.cos(heading);
  for (let i = 0; i < POINTS; i++) {
    const px = body[i * 3], py = body[i * 3 + 1], pz = body[i * 3 + 2];
    const rx = px * cr - py * sr, ry = px * sr + py * cr;
    const py2 = ry * cp - pz * sp, pz2 = ry * sp + pz * cp;
    // Turned about the vertical to its heading (its nose along +z at heading 0).
    out[i * 3] = x + rx * ch + pz2 * sh;
    out[i * 3 + 1] = py2;
    out[i * 3 + 2] = z - rx * sh + pz2 * ch;
  }
}

/**
 * How far the dry land reaches into a hull at this pose, and which way out is (units, and a unit direction):
 * the deepest of its points inside the island's dry sand (`land` is the island's steering field, whose shore
 * distance is negative on land, islets included). Zero where none is. `skip` leaves out the points that
 * share (bit n for point n) is hidden: a moray's tail inside its den. A point within `DRY` of the waterline
 * counts too: the field is a grid, a hair off the island's drawn outline.
 */
const DRY = .02;
const scratch = new Float64Array(POINTS * 3);
export function landReach(land: ShoreField, hull: Hull, x: number, z: number, heading: number, pitch: number, roll: number, skip = 0) {
  hullBottom(hull, x, z, heading, pitch, roll, scratch);
  let deepest = DRY, at = -1;
  for (let i = 0; i < POINTS; i++) {
    if (skip & (1 << i)) continue;
    const d = land.shore(scratch[i * 3], scratch[i * 3 + 2]);
    if (d < deepest) { deepest = d; at = i; }
  }
  if (at < 0) return null;
  const out = land.island(scratch[at * 3], scratch[at * 3 + 2]);
  return { depth: DRY - deepest, nx: out.nx, nz: out.nz };
}

/**
 * The lowest its middle may be (world y) over this bottom: every one of the hull's points at least
 * `margin` above the seabed under it, at this position, heading and tilt.
 */
export function lowestMiddle(seabed: Pick<Seabed, 'floor'>, hull: Hull, margin: number, x: number, z: number, heading: number, pitch: number, roll: number) {
  hullBottom(hull, x, z, heading, pitch, roll, scratch);
  let lowest = -Infinity;
  for (let i = 0; i < POINTS; i++) lowest = Math.max(lowest, seabed.floor(scratch[i * 3], scratch[i * 3 + 2]) - scratch[i * 3 + 1]);
  return lowest + margin;
}

/**
 * The room an animal keeps from the places too shallow for its body (units): half the reach of its nose and tail (a body swings round
 * on its middle), more for a wide one, and at most as much as a whale does, so a turn takes its nose over the shallows no farther than
 * the room it has to rise to clear them.
 */
export const shallowClearOf = (hull: Hull) => Math.max(.1, Math.min(.5, Math.max(.375 * hull.length, .4 * hull.width)));

/**
 * How much of its height may stand out of the water in water too shallow for all of it: the top fifth
 * of a back or dorsal fin, as a shark's does in the shallows of a lagoon.
 */
export const POKE = .2;
/** How much shallower than the deepest water still counts as deep enough for a body that needs more than there is (units). */
const DEEP_SLACK = .15;
/**
 * How far (rad) off the coast's direction a body is judged to swim either way too: a lane or a turn has it across the coast a little (a
 * wing sweeping round over a crest it clears abreast of it). The headings across that are close enough that a wingtip (or the nose) is
 * no farther than `TIP_GAP` from where it is at the nearest heading judged: about the reach of the bottom's own grid (seabed.ts,
 * `ground`), so a wall is not stepped over between two headings. A small body has three, the widest nine.
 */
const SWING = .45, TIP_GAP = .18, MOST_HEADINGS = 9;
const headingsFor = (reach: number) => Math.min(MOST_HEADINGS, 2 * Math.max(1, Math.ceil(SWING * reach / TIP_GAP)) + 1);
/**
 * Whether a body (`hull`, with `margin` under it, resting at `tilt`) is too big for the water at (x, z): it
 * could not swim there with all of it above the bottom (its nose, tail, fins and keel each over the bottom
 * under them) and the top fifth of its back out of the water. Judged as animals swim, along the coast
 * (`coast` is the island's steering field, whose normal says which way that is) and too shallow if it fails
 * going either way round. The steering keeps animals out of such places (seabed.ts, avoidShallows).
 * The body is judged over the bottom with only the big things on it (`solid`): a coral head is swum around
 * and over, but not where its middle would be over one. With `steepest`, a bottom too uneven under it (units
 * from the lowest of the seven places to the highest) is too shallow too: a bottom-dweller lies along the bottom.
 */
export function tooShallow(seabed: Seabed, coast: ShoreField, hull: Hull, margin: number, tilt = 0, steepest = Infinity, poke = POKE) {
  // A body taller than the deepest water (the sunfish): it fits where the water is deepest, with whatever of it stands out.
  const deepest = lowestMiddle({ floor: () => seabed.deepest }, hull, margin, 0, 0, 0, 0, tilt) + DEEP_SLACK;
  const top = Math.max(OCEAN.surfaceLevel - hullTop(hull, 0, tilt) * (1 - poke), deepest);
  if (tilt) {
    // A body lying on its side has one fin out to each side by turns: the seven places differ going either way round.
    const solid = { floor: seabed.solid }, cos = Math.cos(tilt), below = Math.max(hull.keel * cos, -hull.crest * cos);
    return (x: number, z: number) => {
      const shore = coast.island(x, z), along = Math.atan2(-shore.nz, shore.nx);
      return lowestMiddle(solid, hull, margin, x, z, along, 0, tilt) > top || lowestMiddle(solid, hull, margin, x, z, along + Math.PI, 0, tilt) > top
        || seabed.floor(x, z) + below + margin > top;
    };
  }
  // Level, going either way round it is over the same seven places (its middle, nose and tail, halfway out each side, and
  // its fin tips) with only its nose's and tail's depths swapped: the bottom is read under them once.
  const end = .75 * hull.length, side = .85 * hull.width, mid = (hull.keel + hull.wing) / 2, { keel, wing, nose, tail } = hull;
  const headings = headingsFor(Math.max(end, side));
  return (x: number, z: number) => {
    // Its heading along the coast: along is (-nz, nx), across (nx, nz); and turned either way by `SWING`, as lanes and turns have it (a wing
    // sweeping round over a crest that it clears when abreast of it).
    const shore = coast.island(x, z), solid = seabed.solid;
    const f0 = solid(x, z), fm = Math.max(f0 + keel, seabed.floor(x, z) + keel) + margin;
    if (fm > top) return true;
    for (let k = 0; k < headings; k++) {
      const turn = SWING * (2 * k / (headings - 1) - 1), c = Math.cos(turn), q = Math.sin(turn);
      const ax = -shore.nz * c + shore.nx * q, az = shore.nx * c + shore.nz * q, nx = shore.nx * c - -shore.nz * q, nz = shore.nz * c - shore.nx * q;
      const fn = solid(x + ax * end, z + az * end), ft = solid(x - ax * end, z - az * end);
      const fa = solid(x + nx * side / 2, z + nz * side / 2), fb = solid(x - nx * side / 2, z - nz * side / 2);
      const fc = solid(x + nx * side, z + nz * side), fd = solid(x - nx * side, z - nz * side);
      const rest = Math.max(f0 + keel, Math.max(fa, fb) + mid, Math.max(fc, fd) + wing) + margin;
      if (Math.max(rest, fn + nose + margin, ft + tail + margin) > top || Math.max(rest, fn + tail + margin, ft + nose + margin) > top) return true;
      // (a bottom-dweller lies along the bottom it swims along: how uneven it is across the turned headings is no matter)
      if (steepest < Infinity && turn === 0 && Math.max(f0, fn, ft, fa, fb, fc, fd) - Math.min(f0, fn, ft, fa, fb, fc, fd) > steepest) return true;
    }
    return false;
  };
}

/** The height of the highest part of a hull above its middle once pitched and rolled (units), for staying under the surface. */
export function hullTop(hull: Hull, pitch: number, roll: number) {
  // The back or fin, and the nose and tail's rise when pitched; rolled, the high wingtip lifts by its span.
  return hull.crest * Math.cos(roll) * Math.cos(pitch) + hull.width * Math.abs(Math.sin(roll)) * .85 + hull.length * .8 * Math.abs(Math.sin(pitch)) * .3;
}

/**
 * Where in the water an animal lives (docs/marine-navigation.md, "Depth"): `bottom` animals hover close
 * above the seabed and follow it (`band` is how far above their margin, in units); `reef` animals swim at
 * mid-depth over and around the reef, and `open` animals deeper in the open water, off the reef and out of
 * the shallow lagoon (for both, `band` is how far up the water over them they swim, 0 just above the bottom
 * to 1 just under the surface). Air-breathers still come up for a breath (`breathe` in marine-motion.ts).
 */
export type Stance = { kind: 'bottom' | 'reef' | 'open'; band: number };
const bottom = (hover: number): Stance => ({ kind: 'bottom', band: hover });
const reef = (band: number): Stance => ({ kind: 'reef', band });
const open = (band: number): Stance => ({ kind: 'open', band });
export const STANCES: Record<MarineModel, Stance> = {
  // Big open-water animals: deep and off the reef.
  'whale-shark': open(.3), 'great-white-shark': open(.45), 'tiger-shark': open(.4), 'scalloped-hammerhead': open(.45), 'reef-manta': open(.55), 'mola-mola': open(.5),
  'humpback-whale': open(.35), 'sperm-whale': open(.3), 'oceanic-whitetip': open(.7), 'oceanic-manta': open(.5), orca: open(.45), 'thresher-shark': open(.4), 'galapagos-shark': open(.4),
  sailfish: open(.75), 'bottlenose-dolphin': open(.75), 'leatherback-turtle': open(.45), shark: open(.45), manta: open(.5),
  // Reef animals: mid-depth over and around the reef.
  'green-turtle': reef(.35), 'hawksbill-turtle': reef(.35), 'loggerhead-turtle': reef(.4), 'great-barracuda': reef(.55), 'california-sea-lion': reef(.7), 'spotted-eagle-ray': reef(.5),
  'golden-jellyfish': reef(.9), 'harbor-seal': reef(.6), 'sea-otter': reef(.9), garibaldi: reef(.35), 'marine-iguana': reef(1), 'giant-trevally': reef(.55), 'king-angelfish': reef(.35),
  'lemon-shark': reef(.3), tarpon: reef(.6), 'grey-reef-shark': reef(.45), 'blacktip-reef-shark': reef(.7), 'napoleon-wrasse': reef(.45), 'bumphead-parrotfish': reef(.35),
  'sand-tiger-shark': reef(.35), 'reef-fish': reef(.5),
  // Bottom-dwellers: close above the seabed, following it.
  'southern-stingray': bottom(.04), sawfish: bottom(.06), 'whitetip-reef-shark': bottom(.05), 'goliath-grouper': bottom(.08), lionfish: bottom(.06), batfish: bottom(.08),
  'leafy-seadragon': bottom(.12), dugong: bottom(.08),
  // The reef's own (reef-life.ts steers these along the bottom itself).
  'day-octopus': bottom(.03), 'giant-cuttlefish': reef(.4), 'giant-moray': bottom(.03), clownfish: bottom(.12),
};
/**
 * Species drawn with a family's model that live differently from it: the wobbegong, zebra and nurse
 * sharks and the bottom-living rays and fish rest on or hover over the bottom; the mako, silky and
 * devil rays are open-water animals.
 */
const SPECIES_STANCES: Readonly<Record<string, Stance>> = {
  'zebra-shark': bottom(.04), 'tasselled-wobbegong': bottom(.03), 'nurse-shark': bottom(.06), 'bull-shark': reef(.35), 'shortfin-mako': open(.6), 'silky-shark': open(.6), 'basking-shark': open(.5),
  'munks-devil-ray': open(.55), 'marbled-ray': bottom(.04), 'bluespotted-ribbontail-ray': bottom(.04), 'giant-guitarfish': bottom(.04), 'marbled-electric-ray': bottom(.04),
  stonefish: bottom(.03), 'leaf-scorpionfish': bottom(.03), 'giant-frogfish': bottom(.03), 'ribbon-eel': bottom(.03), 'garden-eel': bottom(.03), mandarinfish: bottom(.05), crocodilefish: bottom(.03),
  'flying-gurnard': bottom(.04), 'yellowhead-jawfish': bottom(.04), lingcod: bottom(.06), 'common-seahorse': bottom(.1), porcupinefish: reef(.3),
};
/** How an animal lives in the water: its species' own way if it has one (a family's model is shared), else its model's. */
export const stanceOf = (model: MarineModel, species?: string): Stance => (species && Object.hasOwn(SPECIES_STANCES, species) ? SPECIES_STANCES[species] : STANCES[model]);
