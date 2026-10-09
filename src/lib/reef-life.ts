import { createShoreField, islandScale, SEABED_PROPS, shoreDistance, shorePolygons, type ShoreField } from './island-outline';
import type { MarinePose } from './marine-motion';
import { seabedProfile, shelfStretch } from './ocean';
import { SWIM_LEVEL } from './ocean-depth';
import { clamp, ease, smoothstep, wrap } from './steering';
import type { MarineModel } from './swimming';

/**
 * Where a species lives: out in the ring of open water around the island (most of them, steered by
 * marine-motion.ts), or on the reef itself (this file): walking the seabed shelf, hovering over the
 * reef edge where the bottom drops away, or lying in a crevice.
 */
export type MarineHabitat = 'open-water' | 'seabed' | 'reef-edge' | 'crevice';

/**
 * The reef's animals (docs/marine-navigation.md, "Reef habitats"). Where the open-water animals roam,
 * these keep to places on the reef found once per level from the island's outline and the seabed's
 * profile: rocks and dens (anchors) and stretches of shelf and reef edge (zones). There is no
 * pathfinding: each animal steers for a target inside its zone, checked along the way for room. The
 * octopus walks the shelf near its rock, rests beside it and now and then jets a short way; the
 * cuttlefish hovers and glides over its stretch of reef edge, higher in the water, and jets away from
 * a predator; the moray lies in its den with its head out and now and then moves to another den
 * nearby. The open-water animals and the tuna school pay them no attention; they notice large animals
 * passing close above them.
 */
export const REEF_SPECIES = { 'day-octopus': 'octopus', 'giant-cuttlefish': 'cuttlefish', 'giant-moray': 'moray' } as const;
export type ReefModel = keyof typeof REEF_SPECIES;
type Kind = (typeof REEF_SPECIES)[ReefModel];
export const isReefModel = (model: MarineModel): model is ReefModel => Object.hasOwn(REEF_SPECIES, model);

/** How long the scene draws each reef model (world units); MARINE_SIZE (tap-target.ts) takes these. */
export const REEF_SIZE: Record<ReefModel, number> = { 'day-octopus': 1.1, 'giant-cuttlefish': .85, 'giant-moray': 1.65 };

/** A color state as (brightness, saturation, contrast); 1, 1, 1 is the model's own coloring. */
type Tone = readonly [number, number, number];

/**
 * Each reef animal's behavior. Distances are world units; `reach` is the seabed's own distance from
 * the shore (seabedProfile in ocean.ts): the beach slopes down to the shelf by .62, the reef edge
 * drops away past .78. "Apparent" distances are as the camera sees them (see apparentShift).
 */
export const REEF = {
  octopus: {
    /** Its arms' reach: the room it keeps from rocks and corals. */
    radius: .55,
    /** Its patch of shelf: between these reaches, within `spread` (rad) either way of its rock, every arm clear of the beach as seen. */
    reach: [.5, .98], spread: .5, clear: .62,
    /** Walking pace (units/s), fastest turn (rad/s) and how high its body sits off the bottom. */
    crawl: .075, turnRate: .9, lift: .03,
    /** Seconds resting by its rock; walks per outing; how often a walk ends in a pause, and for how long (s). */
    rest: [9, 20], legs: [2, 4], pause: { chance: .35, time: [1.5, 4] },
    /**
     * Now and then a walk is a short jet instead, mantle first: the chance, how far (units), top speed
     * (units/s), the push, glide and settling back down (s), the least time between jets (s), and how
     * high it lifts off the bottom.
     */
    jet: { chance: .4, distance: [.4, .65], speed: .5, push: .6, glide: 1.8, settle: 1.1, cooldown: 30, rise: .1 },
    /** A large shark close above (threat, half-length): within `near` (apparent gap) it goes still, presses flat and darkens, until `far`. */
    wary: { threat: .8, size: .9, near: .55, far: .9 },
    tone: { walk: [1, 1, 1.05], rest: [.82, .85, 1.1], wary: [.7, .78, 1.15], jet: [1.15, 1.18, 1] } satisfies Record<string, Tone>,
  },
  cuttlefish: {
    /** Half its length, and the apparent room it keeps from the island's shore. */
    radius: .43, clear: .55,
    /** Its stretch of reef edge: these reaches, `spread` (rad) either way of its middle; it keeps between these heights (world y), `floor` above the bottom. */
    reach: [.86, 1.28], spread: .5, height: [-.72, -.42], floor: .16,
    /** Gliding speed (units/s) and fastest turn (rad/s); seconds hovering in one place. */
    cruise: .13, turnRate: .55, hover: [4, 9],
    /** Its jet: top speed (units/s); facing the danger, the push and the glide after it (s); the least time between jets, and how often it jets unprompted (s). */
    jet: { speed: .6, brace: .35, push: .55, glide: 1.4, cooldown: 75, every: [120, 240] },
    /** A predator (threat) within this apparent gap startles it into a jet. */
    startle: { threat: .6, near: .3 },
    tone: { calm: [1, 1, 1], glide: [1, 1.05, 1.22], startled: [.82, 1.1, 1.65] } satisfies Record<string, Tone>,
  },
  moray: {
    /** Seconds in its den between outings, and the chance it then moves to its other den (else it stays another while). */
    den: [35, 80], move: .3,
    /** How much of its body stays in the den (share of its length), and how much when a large animal sends it back in. */
    inside: .5, hidden: .82,
    /** Sliding in and out of a den and swimming between dens (units/s); fastest turn (rad/s); a pause inside a den before coming out (s). */
    slide: .16, swim: .2, turnRate: .75, turnAround: [1.5, 3],
    /** Its body lies this high off the bottom; swimming between dens it keeps to this reach. */
    lift: .1, reach: .88,
    /** A large animal (half-length) passing within `near` (apparent gap) of its head sends it back in; it comes out once all are `far` away for `calm` s. */
    retreat: { size: .9, near: .15, far: .5, calm: 3 },
  },
} as const;

const O = REEF.octopus, F = REEF.cuttlefish, M = REEF.moray;
/** The moray's body length (units): how far its body reaches into and out of a den. */
const length = REEF_SIZE['giant-moray'];

/**
 * How alarming each open-water species is to reef animals (0 to 1): sharks most, then the dolphin
 * (octopus and cuttlefish are its prey); big animals that eat neither barely count.
 */
export const REEF_THREAT: Partial<Record<MarineModel, number>> = {
  'great-white-shark': 1, 'tiger-shark': 1, 'scalloped-hammerhead': .9, shark: .85, 'bottlenose-dolphin': .65,
  'whale-shark': .3, 'reef-manta': .2, manta: .2, 'mola-mola': .15, 'green-turtle': .1,
};

/**
 * An open-water animal as the reef animals see it (filled in by marine-motion.ts every step): where it
 * appears (world x, z as the camera sees it) and which way it is heading (a unit vector), how alarming
 * it is, its footprint (half its length and width) and how present it is (fading on a dive).
 */
export type ReefVisitor = { x: number; z: number; hx: number; hz: number; threat: number; size: number; width: number; presence: number };

/** The gap between a point and a visitor's footprint (a capsule along its heading), as the camera sees them. */
export function visitorGap(v: ReefVisitor, x: number, z: number) {
  const along = clamp((x - v.x) * v.hx + (z - v.z) * v.hz, -v.size, v.size);
  return Math.hypot(x - v.x - v.hx * along, z - v.z - v.hz * along) - v.width;
}

/**
 * Moray dens in pairs along the coast, facing each other: a moray lives in the first and now and then
 * swims to the other (and later back). Degrees around the island (0 to the right of the view, 90 toward
 * the camera), and how far out on the shelf (reach). Clear of the corals, the reef rock and the islets.
 */
const MORAY_DENS = [
  [{ angle: 165, reach: .7 }, { angle: 226, reach: .74 }],
  [{ angle: 256, reach: .92 }, { angle: 310, reach: .95 }],
] as const;
/** The rocks octopuses live by, the roomiest stretches of shelf first (a fourth octopus shares the first's rock, resting on its other side). */
const OCTOPUS_ROCKS = [{ angle: 95, reach: .66 }, { angle: 340, reach: .66 }, { angle: 125, reach: .66 }] as const;
/** The middle of each cuttlefish's stretch of reef edge (degrees; a fourth shares the first's). */
const CUTTLEFISH_REEFS = [0, 205, 100] as const;
/**
 * Rocks: the boulder over a moray's den (radius, height) and its mouth's distance from the boulder's
 * middle, which keeps the moray's body entering the rock inside it; an octopus rests this far beside
 * its rock.
 */
export const REEF_ROCK = { radius: .24, height: .34, mouth: .16, rest: .5 };

/** A rock on the reef. */
export type ReefRock = {
  /** Where it sits (world x, z) and the bottom's height there (world y). */
  x: number; z: number; floor: number;
  /** A moray's den or the rock an octopus lives by. */
  kind: 'den' | 'rock';
  /** A den's mouth and the way it opens; for a rock, the spot beside it where its octopus rests, facing away. */
  spotX: number; spotZ: number; dirX: number; dirZ: number;
};

type Place = { x: number; z: number; nx: number; nz: number; floor: number; reach: number };
const reachOn = (polygons: Float32Array[], x: number, z: number) => { const d = shoreDistance(polygons, x, z); return d > 0 ? d / shelfStretch(x, z) : d; };
/**
 * Where `reach` is along the ray at `angle` (degrees) from the main island's middle, and the bottom's
 * height there exactly as the seabed is drawn (islets included).
 */
function locate(polygons: Float32Array[], angle: number, reach: number): Place {
  const main = polygons.slice(0, 1), a = angle * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a);
  let lo = 0, hi = 9;
  for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (reachOn(main, ux * mid, uz * mid) < reach) lo = mid; else hi = mid; }
  const x = ux * lo, z = uz * lo, h = .02;
  const nx = shoreDistance(main, x + h, z) - shoreDistance(main, x - h, z), nz = shoreDistance(main, x, z + h) - shoreDistance(main, x, z - h);
  const n = Math.hypot(nx, nz) || 1;
  return { x, z, nx: nx / n, nz: nz / n, floor: seabedProfile(reachOn(polygons, x, z)).floor, reach };
}

/**
 * The reef's rocks at a level: each moray's pair of dens (mouths facing each other along the coast,
 * turned a little out to sea) and each octopus's rock with its resting spot on the side facing the
 * camera. Islands grow with the level, so the rocks move out with them.
 */
const rockCache = new Map<string, { dens: ReefRock[][]; rocks: ReefRock[] }>();
export function reefRocks(level: number, morays: number, octopuses: number) {
  // Found once per level and count (the simulation and the scene's rocks both ask).
  const key = `${level}:${morays}:${octopuses}`, cached = rockCache.get(key);
  if (cached) return cached;
  const polygons = shorePolygons(level), main = polygons.slice(0, 1), scale = islandScale(level);
  const props = Object.values(SEABED_PROPS).map(([x, z]) => [x * scale, z * scale] as const);
  const clearance = (x: number, z: number) => Math.min(...props.map(([px, pz]) => Math.hypot(px - x, pz - z)));
  // Two dens per moray (only two species share the moray's model; any more would share dens).
  const dens = Array.from({ length: morays }, (_, i) => MORAY_DENS[i % MORAY_DENS.length]).map((pair) => {
    const [a, b] = pair.map((p) => locate(polygons, p.angle, p.reach));
    return [a, b].map((p, i): ReefRock => {
      const other = i ? a : b;
      // Along the coast toward the other den, turned in or out so that the moray, coming straight out of
      // the den along its mouth, keeps to the shelf (the coast curves away from a straight line).
      let tx = -p.nz, tz = p.nx;
      if (tx * (other.x - p.x) + tz * (other.z - p.z) < 0) { tx = -tx; tz = -tz; }
      let dx = tx, dz = tz, best = Infinity;
      for (let turn = -.6; turn <= .3; turn += .05) {
        const c = Math.cos(turn), s = Math.sin(turn), ux = tx * c + p.nx * s, uz = tz * c + p.nz * s;
        const off = Math.max(...[.8, 1.4, 2].map((t) => Math.abs(reachOn(main, p.x + ux * t, p.z + uz * t) - p.reach - .04)));
        if (off < best) { best = off; dx = ux; dz = uz; }
      }
      return { x: p.x, z: p.z, floor: p.floor, kind: 'den', spotX: p.x + dx * REEF_ROCK.mouth, spotZ: p.z + dz * REEF_ROCK.mouth, dirX: dx, dirZ: dz };
    });
  });
  const rocks = Array.from({ length: octopuses }, (_, i): ReefRock => {
    const spec = OCTOPUS_ROCKS[i % OCTOPUS_ROCKS.length], p = locate(polygons, spec.angle, spec.reach);
    // Beside the rock along the coast: on the side nearer the camera, unless a coral is in the way there
    // (a second octopus at the same rock takes the other side).
    let tx = -p.nz, tz = p.nx;
    if (tz < 0) { tx = -tx; tz = -tz; }
    const room = (side: number) => clearance(p.x + side * tx * REEF_ROCK.rest, p.z + side * tz * REEF_ROCK.rest);
    if (room(1) < .85 && room(-1) > room(1)) { tx = -tx; tz = -tz; }
    if (Math.floor(i / OCTOPUS_ROCKS.length) % 2) { tx = -tx; tz = -tz; }
    return { x: p.x, z: p.z, floor: p.floor, kind: 'rock', spotX: p.x + tx * REEF_ROCK.rest, spotZ: p.z + tz * REEF_ROCK.rest, dirX: tx, dirZ: tz };
  });
  const result = { dens, rocks };
  rockCache.set(key, result);
  return result;
}

type Arrival = { stage: 'offstage' | 'entering' | 'arrived'; since: number };
type State =
  // Octopus
  | 'rest' | 'crawl' | 'home' | 'face' | 'pause' | 'aim' | 'jet' | 'glide' | 'settle' | 'emerge'
  // Cuttlefish
  | 'hover' | 'cruise' | 'brace' | 'push' | 'coast' | 'enter'
  // Moray
  | 'den' | 'retreat' | 'return' | 'leave' | 'swim' | 'approach' | 'go-in' | 'inside' | 'come-out';

type Dweller = {
  kind: Kind; model: ReefModel; lane: number;
  /** World x, z; height above the swimming level (like the open-water animals'); heading (rad); signed speed (negative: backward, as in a jet). */
  x: number; z: number; y: number; heading: number; speed: number; turn: number; climb: number; bank: number; pitch: number;
  previous: { x: number; z: number; y: number; heading: number; bank: number; pitch: number };
  state: State; since: number; length: number;
  /** Where it is going (x, z, and for the cuttlefish a height), and a heading to take (a jet's, a den's). */
  tx: number; tz: number; ty: number; aim: number;
  /** Octopus: walks left in this outing, the jet's speed. Moray: which of its dens it is at or going to. */
  legs: number; jetSpeed: number; den: number;
  /** No jet before this time (s); how alarmed it is (0 or 1), and since when calm again (s). */
  nextJet: number; alarm: number; calm: number;
  /** Height off the bottom it eases toward (octopus jets), and the rig inputs. */
  lift: number; rest: number; jet: number; ground: number;
  /** Its color now, and how much of its body is out of sight (from the tail, from the head). */
  tone: [number, number, number]; hide: [number, number];
  /** Its zone's middle (rad around the island), and its rock or dens. */
  angle: number; rock: ReefRock | null; dens: ReefRock[];
  /** Arriving as a new discovery: fading in (0 to 1). */
  arrival: Arrival | null; fade: number;
  /** Choices made so far (each roll is indexed by this). */
  rolls: number;
  pose: MarinePose;
};

/** Seconds an arrival may take at most; then it counts as arrived anyway. */
const ARRIVAL_LIMIT = 30;
const OFFSTAGE = { depth: 1, surfacing: false, y: SWIM_LEVEL, opacity: 0, visible: false };

/**
 * The reef's animals on the island. `members` are reef species only (marine-motion.ts hands them
 * over); `arriving` lanes wait out of sight until arrive() brings them in.
 */
export function createReefLife(members: readonly { model: ReefModel; lane: number }[], level: number, options: { seed?: number; arriving?: readonly number[] } = {}) {
  const seed = options.seed ?? 0;
  let current = level, scale = islandScale(level);
  let field: ShoreField = createShoreField(level);
  let time = 0;
  const count = (kind: Kind) => members.filter((m) => REEF_SPECIES[m.model] === kind).length;
  let layout = reefRocks(level, count('moray'), count('octopus'));
  /** Every rock (each moray's dens, each octopus's rock). */
  let rocks = layout.dens.flat().concat(layout.rocks);
  /** Corals and the reef rock (always counted, whatever the level shows): reef animals keep clear of them. */
  let props = Object.values(SEABED_PROPS).map(([x, z]) => ({ x: x * scale, z: z * scale }));
  const range = (d: Dweller, [low, high]: readonly [number, number]) => low + (high - low) * roll(d);
  function roll(d: Dweller) {
    const v = Math.sin((d.lane * 7.31 + seed * 97.3 + 3.7) * 91.7 + d.rolls++ * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  // --- The seabed and the island, as these animals need them ---
  /** The seabed's distance from the shore here (reach) and the bottom's height (world y), as the seabed is drawn (on the field's grid). */
  const reach = (x: number, z: number) => { const d = field.shore(x, z); return d > 0 ? d / shelfStretch(x, z) : d; };
  const floor = (x: number, z: number) => seabedProfile(reach(x, z)).floor;
  /** How far toward the viewer something this high (above the swimming level) appears shifted (see apparentShift). */
  const shiftAt = (y: number) => .4 - .5 * (y + .02);
  /**
   * Its apparent distance from the island's shore (what the camera shows against the beach), on the
   * steering field, which blends the islets in: near one, it keeps a little farther off.
   */
  const apparent = (x: number, z: number, y: number) => field.island(x, z + shiftAt(y)).distance;
  /** Where `reach` is along the ray at `angle` (rad) from the island's middle. */
  function pointAt(angle: number, target: number) {
    const ux = Math.cos(angle), uz = Math.sin(angle);
    let lo = .5, hi = 8;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (reach(ux * mid, uz * mid) < target) lo = mid; else hi = mid; }
    return { x: ux * lo, z: uz * lo };
  }

  let rockIndex = 0, denIndex = 0, reefIndex = 0;
  const dwellers: Dweller[] = [];
  for (const member of members) {
    const kind = REEF_SPECIES[member.model];
    const d: Dweller = {
      kind, model: member.model, lane: member.lane, x: 0, z: 0, y: 0, heading: 0, speed: 0, turn: 0, climb: 0, bank: 0, pitch: 0,
      previous: { x: 0, z: 0, y: 0, heading: 0, bank: 0, pitch: 0 }, state: 'rest', since: 0, length: 0,
      tx: 0, tz: 0, ty: 0, aim: 0, legs: 0, jetSpeed: 0, den: 0, nextJet: 0, alarm: 0, calm: -Infinity,
      lift: 0, rest: 0, jet: 0, ground: 1, tone: [1, 1, 1], hide: [0, 0],
      angle: 0, rock: null, dens: [], arrival: options.arriving?.includes(member.lane) ? { stage: 'offstage', since: 0 } : null, fade: 1, rolls: 0,
      pose: { x: 0, y: 0, z: 0, heading: 0, bank: 0, effort: 1, pace: 0, turn: 0, speed: 0, climb: 0, pitch: 0, air: 0, rest: 0, jet: 0, ground: 1, tone: [1, 1, 1], hide: [0, 0] },
    };
    if (kind === 'octopus') { d.rock = layout.rocks[rockIndex++]; d.angle = Math.atan2(d.rock.z, d.rock.x); }
    else if (kind === 'moray') { d.dens = layout.dens[denIndex++]; d.angle = Math.atan2(d.dens[0].z, d.dens[0].x); }
    else d.angle = CUTTLEFISH_REEFS[reefIndex++ % CUTTLEFISH_REEFS.length] * Math.PI / 180;
    dwellers.push(d);
  }
  for (const d of dwellers) {
    settleIn(d);
    if (d.arrival) d.fade = 0;
    remember(d);
    publishOne(d, 1);
  }
  const byLane = new Map(dwellers.map((d) => [d.lane, d]));
  const swimmers = dwellers.map((d) => ({ model: d.model as MarineModel, lane: d.lane, leader: d.lane, index: 0 }));

  /** Place an animal in its usual spot, settled: the octopus resting by its rock, the moray in its den, the cuttlefish hovering. */
  function settleIn(d: Dweller) {
    d.speed = 0; d.turn = 0; d.climb = 0; d.rolls += 1;
    if (d.kind === 'octopus') {
      const r = d.rock!;
      d.x = r.spotX; d.z = r.spotZ; d.heading = Math.atan2(r.dirX, r.dirZ);
      set(d, 'rest', range(d, REEF.octopus.rest));
      d.legs = Math.round(range(d, REEF.octopus.legs));
      d.nextJet = time + range(d, [8, 25]);
      d.rest = 1; d.lift = 0;
    } else if (d.kind === 'moray') {
      inDen(d, REEF.moray.inside);
      set(d, 'den', range(d, REEF.moray.den));
      d.rest = 1;
    } else {
      const spot = hoverSpot(d);
      d.x = spot.x; d.z = spot.z; d.y = spot.y; d.ty = spot.y;
      d.heading = d.angle + Math.PI / 2 + (roll(d) - .5);
      set(d, 'hover', range(d, REEF.cuttlefish.hover));
      d.nextJet = time + range(d, REEF.cuttlefish.jet.every);
    }
    d.hide[1] = 0;
    if (d.kind !== 'moray') d.hide[0] = 0;
    if (d.kind !== 'cuttlefish') d.y = floor(d.x, d.z) - SWIM_LEVEL + (d.kind === 'moray' ? REEF.moray.lift : REEF.octopus.lift);
    const tone = d.kind === 'octopus' ? REEF.octopus.tone.rest : REEF.cuttlefish.tone.calm;
    d.tone[0] = tone[0]; d.tone[1] = tone[1]; d.tone[2] = tone[2];
  }
  function set(d: Dweller, state: State, length = 0) { d.state = state; d.since = 0; d.length = length; }
  function remember(d: Dweller) {
    const p = d.previous;
    p.x = d.x; p.z = d.z; p.y = d.y; p.heading = d.heading; p.bank = d.bank; p.pitch = d.pitch;
  }

  /** The nearest alarming visitor's apparent gap from `x, z`, among those at least `threat` and `size`. */
  function gap(x: number, z: number, threat: number, size: number, visitors: readonly ReefVisitor[]) {
    let best = Infinity;
    for (const v of visitors) if (v.presence >= .5 && v.threat >= threat && v.size >= size) best = Math.min(best, visitorGap(v, x, z));
    return best;
  }
  /** Turn toward `heading` at up to `rate` (rad/s), easing in and out of turns. */
  function turnToward(d: Dweller, heading: number, rate: number, dt: number, gain = 1.6) {
    const want = clamp(wrap(heading - d.heading) * gain, -rate, rate);
    d.turn += (want - d.turn) * ease(5, dt);
    d.heading = wrap(d.heading + d.turn * dt);
  }
  function move(d: Dweller, dt: number) {
    d.x += Math.sin(d.heading) * d.speed * dt;
    d.z += Math.cos(d.heading) * d.speed * dt;
  }
  /** Ease toward a color state. */
  function look(d: Dweller, tone: Tone, dt: number, rate = 1.2) {
    const k = ease(rate, dt);
    for (let i = 0; i < 3; i++) d.tone[i] += (tone[i] - d.tone[i]) * k;
  }

  // --- Octopus ---
  /** Ground an octopus may be on: its patch of shelf, its arms clear of the beach (as seen), of corals and rocks (it may stay close by its own). */
  function octopusGround(d: Dweller, x: number, z: number) {
    const r = reach(x, z);
    if (r < O.reach[0] || r > O.reach[1] || Math.abs(wrap(Math.atan2(z, x) - d.angle)) > O.spread) return false;
    if (apparent(x, z, floor(x, z) - SWIM_LEVEL + O.lift) < O.clear) return false;
    for (const p of props) if (Math.hypot(p.x - x, p.z - z) < .25 + O.radius * .8) return false;
    for (const rock of rocks) {
      if (Math.hypot(rock.x - x, rock.z - z) < REEF_ROCK.radius + (rock === d.rock ? .2 : O.radius * .8)) return false;
    }
    return true;
  }
  /** Room for it here: good ground, and well clear of the other reef animals on the bottom (and where they are going). */
  function octopusRoom(d: Dweller, x: number, z: number) {
    if (!octopusGround(d, x, z)) return false;
    for (const o of dwellers) {
      if (o === d || o.kind === 'cuttlefish' || o.arrival?.stage === 'offstage') continue;
      if (Math.hypot(o.x - x, o.z - z) < 1 || (o.kind === 'octopus' && Math.hypot(o.tx - x, o.tz - z) < 1)) return false;
      if (o.kind === 'moray') for (const den of o.dens) if (Math.hypot(den.spotX + den.dirX * .4 - x, den.spotZ + den.dirZ * .4 - z) < .9) return false;
    }
    return true;
  }
  /** Room all along the way from where it is to `x, z` (its first stretch aside: it may be starting beside its rock). */
  function octopusPath(d: Dweller, x: number, z: number) {
    for (const t of [.35, .65, 1]) if (!octopusRoom(d, d.x + (x - d.x) * t, d.z + (z - d.z) * t)) return false;
    return true;
  }
  /** A spot to walk to on its patch (on its own side of its rock, so its walks never cross it), a short way off; false when none has room. */
  function planWalk(d: Dweller) {
    const side = Math.sign(wrap(Math.atan2(d.rock!.spotZ, d.rock!.spotX) - d.angle)) || 1;
    for (let i = 0; i < 10; i++) {
      const p = pointAt(d.angle + side * O.spread * (.15 + .85 * roll(d)), O.reach[0] + .03 + (O.reach[1] - O.reach[0] - .06) * roll(d));
      const distance = Math.hypot(p.x - d.x, p.z - d.z);
      if (distance < .3 || distance > 1.1 || !octopusPath(d, p.x, p.z)) continue;
      d.tx = p.x; d.tz = p.z;
      set(d, 'crawl');
      return true;
    }
    return false;
  }
  /** A short jet, mantle first (backward), if there is room behind it: it first turns a little to line up. */
  function planJet(d: Dweller) {
    const distance = range(d, O.jet.distance);
    for (const turn of [0, .35, -.35, .7, -.7]) {
      const heading = d.heading + turn, x = d.x - Math.sin(heading) * distance, z = d.z - Math.cos(heading) * distance;
      if (!octopusPath(d, x, z)) continue;
      d.aim = heading; d.tx = x; d.tz = z;
      // Push and glide together cover about .58 units at the base speed.
      d.jetSpeed = O.jet.speed * distance / .58;
      d.nextJet = time + O.jet.cooldown * (1 + roll(d));
      set(d, 'aim');
      return true;
    }
    return false;
  }
  function goHome(d: Dweller) {
    d.tx = d.rock!.spotX; d.tz = d.rock!.spotZ;
    set(d, 'home');
  }
  /** What next after a walk, a pause or a jet: another walk, a pause, a jet, or back to its rock. */
  function nextLeg(d: Dweller) {
    if (d.legs <= 0) { goHome(d); return; }
    d.legs--;
    if (d.state === 'crawl' && roll(d) < O.pause.chance) { set(d, 'pause', range(d, O.pause.time)); return; }
    if (time >= d.nextJet && roll(d) < O.jet.chance && planJet(d)) return;
    if (!planWalk(d)) goHome(d);
  }
  function stepOctopus(d: Dweller, visitors: readonly ReefVisitor[], dt: number) {
    const danger = gap(d.x, d.z + shiftAt(d.y), O.wary.threat, O.wary.size, visitors);
    d.alarm = d.alarm ? (danger < O.wary.far ? 1 : 0) : (danger < O.wary.near ? 1 : 0);
    const still = d.alarm && d.state !== 'jet' && d.state !== 'glide' && d.state !== 'settle';
    let speed = 0, rest = 0, jet = 0, ground = 1, lift = 0;
    switch (d.state) {
      case 'emerge':
      case 'crawl':
      case 'home': {
        const dx = d.tx - d.x, dz = d.tz - d.z, distance = Math.hypot(dx, dz), heading = Math.atan2(dx, dz);
        turnToward(d, heading, O.turnRate, dt);
        // It turns before it walks off, and slows as it arrives.
        speed = O.crawl * smoothstep(.2, .85, Math.cos(wrap(heading - d.heading))) * smoothstep(0, .12, distance) * (d.state === 'emerge' ? 1.5 : 1);
        if (distance < .03 || d.since > 40) {
          if (d.state === 'crawl') nextLeg(d);
          else { d.aim = Math.atan2(d.rock!.dirX, d.rock!.dirZ); set(d, 'face'); }
        }
        break;
      }
      case 'face':
        turnToward(d, d.aim, O.turnRate * 1.3, dt);
        if (Math.abs(wrap(d.aim - d.heading)) < .12 || d.since > 5) {
          set(d, 'rest', range(d, O.rest));
          d.legs = Math.round(range(d, O.legs));
        }
        break;
      case 'rest':
        rest = 1;
        turnToward(d, d.heading, O.turnRate, dt);
        if (d.since > d.length && !d.alarm) {
          nextLeg(d);
          // No room to set out just now: it rests a while longer and tries again.
          if ((d.state as State) === 'home') { set(d, 'rest', range(d, O.rest)); d.legs = Math.round(range(d, O.legs)); }
        }
        break;
      case 'pause':
        rest = .25;
        turnToward(d, d.heading, O.turnRate, dt);
        if (d.since > d.length) nextLeg(d);
        break;
      case 'aim':
        // Lining up for the jet, drawing water into its mantle.
        jet = .3;
        turnToward(d, d.aim, O.turnRate * 1.4, dt);
        if ((Math.abs(wrap(d.aim - d.heading)) < .06 && d.since > .4) || d.since > 1.5) set(d, 'jet', O.jet.push);
        break;
      case 'jet':
        jet = 1; ground = 0; lift = O.jet.rise;
        turnToward(d, d.heading, O.turnRate, dt);
        d.speed += (-d.jetSpeed - d.speed) * ease(7, dt);
        if (d.since > d.length) set(d, 'glide', O.jet.glide);
        break;
      case 'glide':
        ground = 0; lift = O.jet.rise;
        turnToward(d, d.heading, O.turnRate, dt);
        d.speed += (0 - d.speed) * ease(1.3, dt);
        if (d.since > d.length) set(d, 'settle', O.jet.settle);
        break;
      case 'settle':
        turnToward(d, d.heading, O.turnRate, dt);
        d.speed += (0 - d.speed) * ease(3, dt);
        if (d.since > d.length) nextLeg(d);
        break;
    }
    if (d.state !== 'jet' && d.state !== 'glide' && d.state !== 'settle') {
      // Wary, it stops where it is and presses flat.
      const target = still ? 0 : speed;
      d.speed += (target - d.speed) * ease(still ? 4 : 2, dt);
    }
    if (still) rest = Math.max(rest, .6);
    // A jet heading out of its patch (a rock, the beach) stops short.
    if (d.speed < 0 && !octopusGround(d, d.x - Math.sin(d.heading) * .1, d.z - Math.cos(d.heading) * .1)) {
      d.speed += (0 - d.speed) * ease(6, dt);
    }
    move(d, dt);
    d.lift += (lift - d.lift) * ease(lift > d.lift ? 5 : 2.2, dt);
    d.rest = rest; d.jet = jet; d.ground = ground;
    const y = floor(d.x, d.z) - SWIM_LEVEL + O.lift + d.lift;
    d.climb = clamp((y - d.y) / dt / .05, -1, 1);
    d.y = y;
    look(d, d.alarm ? O.tone.wary : jet || ground < 1 ? O.tone.jet : rest > .5 ? O.tone.rest : O.tone.walk, dt, jet ? 4 : 1.2);
  }

  // --- Cuttlefish ---
  /** Room for a cuttlefish: over its stretch of reef edge, clear of the island as seen, and of the other cuttlefish. */
  function cuttlefishRoom(d: Dweller, x: number, z: number) {
    const r = reach(x, z);
    if (r < F.reach[0] - .04 || r > F.reach[1] + .06 || Math.abs(wrap(Math.atan2(z, x) - d.angle)) > F.spread + .1) return false;
    if (apparent(x, z, -.55 - SWIM_LEVEL) < F.clear) return false;
    for (const o of dwellers) if (o !== d && o.kind === 'cuttlefish' && o.arrival?.stage !== 'offstage' && Math.hypot(o.x - x, o.z - z) < 1.1) return false;
    return true;
  }
  /** Heights it may hover at here (above the swimming level): its band, kept off the bottom. */
  function heights(x: number, z: number) {
    const low = Math.max(F.height[0], floor(x, z) + F.floor);
    return [low - SWIM_LEVEL, Math.max(low, F.height[1]) - SWIM_LEVEL] as const;
  }
  function hoverSpot(d: Dweller) {
    for (let i = 0; i < 12; i++) {
      const p = pointAt(d.angle + (roll(d) - .5) * 2 * F.spread, F.reach[0] + (F.reach[1] - F.reach[0]) * roll(d));
      if (i < 11 && !cuttlefishRoom(d, p.x, p.z)) continue;
      const [low, high] = heights(p.x, p.z);
      return { x: p.x, z: p.z, y: low + (high - low) * roll(d) };
    }
    return { x: d.x, z: d.z, y: d.y };
  }
  function planGlide(d: Dweller) {
    for (let i = 0; i < 8; i++) {
      const spot = hoverSpot(d), distance = Math.hypot(spot.x - d.x, spot.z - d.z);
      if (distance < .35 || distance > 1.3) continue;
      d.tx = spot.x; d.tz = spot.z; d.ty = spot.y;
      set(d, 'cruise');
      return;
    }
    set(d, 'hover', range(d, F.hover));
  }
  /**
   * A jet away, backward: facing `toward` (the danger), or as near that as leaves it room behind over
   * its reef edge. False (no jet) if there is none.
   */
  function brace(d: Dweller, toward: number) {
    for (const turn of [0, .5, -.5, 1, -1, 1.5, -1.5, 2, -2]) {
      const heading = toward + turn;
      // Room all the way along the push and the glide after it (about .7 units).
      if ([.3, .55, .8].some((t) => !cuttlefishRoom(d, d.x - Math.sin(heading) * t, d.z - Math.cos(heading) * t))) continue;
      d.aim = heading;
      d.nextJet = time + Math.max(F.jet.cooldown, range(d, F.jet.every));
      set(d, 'brace', F.jet.brace);
      return true;
    }
    return false;
  }
  function stepCuttlefish(d: Dweller, visitors: readonly ReefVisitor[], dt: number) {
    const shift = shiftAt(d.y);
    let speed = 0, jet = 0;
    if ((d.state === 'hover' || d.state === 'cruise') && time - d.calm > F.jet.cooldown) {
      // A predator close by: it faces it and jets away.
      let nearest: ReefVisitor | null = null, best: number = F.startle.near;
      for (const v of visitors) {
        if (v.presence < .5 || v.threat < F.startle.threat) continue;
        const g = visitorGap(v, d.x, d.z + shift);
        if (g < best) { best = g; nearest = v; }
      }
      if (nearest) { d.alarm = 1; d.calm = time; brace(d, Math.atan2(nearest.x - d.x, nearest.z - (d.z + shift))); }
    }
    switch (d.state) {
      case 'hover':
        // Hovering in place, it looks about.
        turnToward(d, d.aim + .35 * Math.sin(time * .23 + d.lane), .25, dt);
        if (d.since > d.length) {
          if (time >= d.nextJet) {
            d.alarm = 0;
            if (!brace(d, d.heading + (roll(d) - .5))) { d.nextJet = time + 10; planGlide(d); }
          } else planGlide(d);
        }
        break;
      case 'enter':
      case 'cruise': {
        const dx = d.tx - d.x, dz = d.tz - d.z, distance = Math.hypot(dx, dz), heading = Math.atan2(dx, dz);
        turnToward(d, heading, F.turnRate, dt);
        speed = F.cruise * smoothstep(-.2, .8, Math.cos(wrap(heading - d.heading))) * smoothstep(0, .25, distance) * (d.state === 'enter' ? 1.3 : 1);
        if (distance < .06 || d.since > 30) { d.aim = d.heading; set(d, 'hover', range(d, F.hover)); }
        break;
      }
      case 'brace':
        // It swings round to face the danger (or as near as leaves it room), drawing water in, then jets.
        jet = .3;
        turnToward(d, d.aim, 3.5, dt, 3);
        if ((d.since > d.length && Math.abs(wrap(d.aim - d.heading)) < .15) || d.since > 1.4) set(d, 'push', F.jet.push);
        break;
      case 'push':
        jet = 1;
        turnToward(d, d.aim, F.turnRate, dt);
        d.speed += (-F.jet.speed - d.speed) * ease(9, dt);
        if (d.since > d.length) set(d, 'coast', F.jet.glide);
        break;
      case 'coast':
        turnToward(d, d.heading, F.turnRate, dt);
        d.speed += (0 - d.speed) * ease(1.6, dt);
        if (d.since > d.length) { d.aim = d.heading; d.ty = clamp(d.y, ...heights(d.x, d.z)); set(d, 'hover', range(d, F.hover) * .6); d.alarm = 0; }
        break;
    }
    if (d.state === 'hover' || d.state === 'cruise' || d.state === 'enter' || d.state === 'brace') d.speed += (speed - d.speed) * ease(d.state === 'brace' ? 6 : 1.2, dt);
    // A jet that would carry it off its reef edge (toward the island, out over the deep) stops short.
    if (d.speed < 0 && !cuttlefishRoom(d, d.x - Math.sin(d.heading) * .15, d.z - Math.cos(d.heading) * .15)) d.speed += (0 - d.speed) * ease(6, dt);
    move(d, dt);
    // Up and down within its band, gently; a jet lifts it a little.
    const [low, high] = heights(d.x, d.z), goal = clamp(d.ty + (d.state === 'push' || d.state === 'coast' ? .05 : 0), low, high);
    const y = d.y + clamp((goal - d.y) * .8, -.05, .05) * dt;
    d.climb = clamp((y - d.y) / dt / .05, -1, 1);
    // Arriving, it rises into its band from deeper water.
    d.y = d.state === 'enter' ? y : clamp(y, low - .02, high + .05);
    d.bank += (clamp(-d.turn * .35, -.12, .12) - d.bank) * ease(1.5, dt);
    d.rest = 0; d.jet = jet; d.ground = 0;
    const startled = d.alarm && (d.state === 'brace' || d.state === 'push' || d.state === 'coast' || time - d.calm < 3);
    look(d, startled ? F.tone.startled : d.state === 'hover' ? F.tone.calm : F.tone.glide, dt, startled ? 5 : 1);
  }

  // --- Moray ---
  /** Lie in its den, `inside` of its body (from the tail) in the rock, head out along the mouth. */
  function inDen(d: Dweller, inside: number) {
    const den = d.dens[d.den];
    d.heading = Math.atan2(den.dirX, den.dirZ);
    d.x = den.spotX - den.dirX * (inside - .5) * length;
    d.z = den.spotZ - den.dirZ * (inside - .5) * length;
    d.hide[0] = inside; d.hide[1] = 0;
  }
  /** How far along its body (0 tail, 1 head) a den's mouth is, along `heading`. */
  function cut(d: Dweller, den: ReefRock) {
    return .5 + ((den.spotX - d.x) * Math.sin(d.heading) + (den.spotZ - d.z) * Math.cos(d.heading)) / length;
  }
  function stepMoray(d: Dweller, visitors: readonly ReefVisitor[], dt: number) {
    const den = d.dens[d.den];
    const headX = den.spotX + den.dirX * .4, headZ = den.spotZ + den.dirZ * .4;
    const danger = gap(headX, headZ + shiftAt(d.y), 0, M.retreat.size, visitors);
    if (danger < M.retreat.near) { d.alarm = 1; d.calm = time; }
    else if (d.alarm && danger > M.retreat.far && time - d.calm > M.retreat.calm) d.alarm = 0;
    else if (danger <= M.retreat.far) d.calm = time;
    let speed = 0, rest = 0;
    switch (d.state) {
      case 'den': {
        // Its body slides a touch in and out as it breathes and looks about.
        rest = 1;
        const goal = M.inside + .03 * Math.sin(time * .21 + d.lane * 1.7);
        inDen(d, d.hide[0] + clamp(goal - d.hide[0], -.02 * dt, .02 * dt));
        if (d.alarm) set(d, 'retreat');
        else if (d.since > d.length) {
          if (roll(d) < M.move) set(d, 'leave');
          else set(d, 'den', range(d, M.den));
        }
        break;
      }
      case 'retreat':
      case 'return': {
        // Drawn back in (a large animal close by), then out again once it has gone.
        rest = 1;
        const goal = d.state === 'retreat' ? M.hidden : M.inside, rate = (d.state === 'retreat' ? M.slide * 2 : M.slide * .8) / length;
        inDen(d, d.hide[0] + clamp(goal - d.hide[0], -rate * dt, rate * dt));
        if (d.state === 'retreat' && !d.alarm) set(d, 'return');
        else if (d.state === 'return' && d.alarm) set(d, 'retreat');
        else if (d.state === 'return' && Math.abs(d.hide[0] - M.inside) < .002) set(d, 'den', range(d, M.den) * .5);
        break;
      }
      case 'leave':
        // Out of the den along its mouth, the body sliding through it.
        rest = 1 - smoothstep(0, 2, d.since);
        speed = M.slide;
        d.hide[0] = Math.max(0, cut(d, den));
        if (d.alarm && d.hide[0] > .3) set(d, 'retreat');
        else if (d.hide[0] <= 0) { d.den = 1 - d.den; set(d, 'swim'); }
        break;
      case 'swim':
      case 'approach': {
        // Along the shelf toward the other den, then in line with its mouth.
        const to = d.dens[d.den], hx = d.x + Math.sin(d.heading) * length / 2, hz = d.z + Math.cos(d.heading) * length / 2;
        const toMouth = Math.hypot(to.spotX - hx, to.spotZ - hz);
        let heading: number;
        if (d.state === 'swim') {
          const shore = field.island(hx, hz);
          let tx = -shore.nz, tz = shore.nx;
          if (tx * (to.spotX - hx) + tz * (to.spotZ - hz) < 0) { tx = -tx; tz = -tz; }
          const out = clamp((M.reach - reach(hx, hz)) * 2.5, -.8, .8);
          heading = Math.atan2(tx + shore.nx * out, tz + shore.nz * out);
          // Nearing the den, it swings out in front of its mouth to come in straight.
          const lead = Math.min(.7, toMouth * .6), px = to.spotX + to.dirX * lead, pz = to.spotZ + to.dirZ * lead;
          if (toMouth < 1.6) heading = Math.atan2(px - hx, pz - hz);
          if (toMouth < .5) set(d, 'approach');
          // Lost its way (it shouldn't): it slips into the den out of sight.
          if (d.since > 60) { inDen(d, 1); set(d, 'inside', 1); }
        } else {
          const lead = Math.min(.5, toMouth * .8);
          heading = Math.atan2(to.spotX + to.dirX * lead - hx, to.spotZ + to.dirZ * lead - hz);
          if (cut(d, to) < 1) set(d, 'go-in');
        }
        turnToward(d, heading, M.turnRate, dt, 2);
        speed = M.swim * (d.state === 'approach' ? .7 : 1);
        break;
      }
      case 'go-in': {
        // Head first into the den: what has gone in is out of sight.
        const to = d.dens[d.den];
        turnToward(d, Math.atan2(-to.dirX, -to.dirZ), M.turnRate, dt, 2);
        speed = M.slide * 1.1;
        d.hide[1] = clamp(1 - cut(d, to), 0, 1);
        if (d.hide[1] >= 1) { set(d, 'inside', range(d, M.turnAround)); d.hide[0] = 1; d.hide[1] = 0; inDen(d, 1); }
        break;
      }
      case 'inside':
        // Out of sight, it turns round to face out of the mouth.
        rest = 1;
        inDen(d, 1);
        if (d.since > d.length && !d.alarm) set(d, 'come-out');
        break;
      case 'come-out':
        rest = smoothstep(.5, 3, d.since);
        speed = M.slide * .85;
        d.hide[0] = clamp(cut(d, den), M.inside, 1);
        if (d.hide[0] <= M.inside + 1e-3) { inDen(d, M.inside); set(d, 'den', range(d, M.den)); }
        break;
    }
    d.speed += (speed - d.speed) * ease(2.5, dt);
    if (d.state !== 'den' && d.state !== 'retreat' && d.state !== 'return' && d.state !== 'inside') move(d, dt);
    else d.speed = 0;
    d.rest += (rest - d.rest) * ease(2, dt);
    d.jet = 0; d.ground = 1;
    // At a den it lies on the bottom by the den's mouth (most of the rest of it is in the rock); swimming, under its middle.
    const atDen = d.state !== 'swim' && d.state !== 'approach';
    const y = (atDen ? d.dens[d.den].floor : floor(d.x, d.z)) - SWIM_LEVEL + M.lift;
    d.climb = 0;
    d.y += (y - d.y) * ease(3, dt);
  }

  /** A new discovery arriving: the octopus edges out from beside its rock, the cuttlefish glides in from the deep side of the reef edge, the moray comes out of its den. */
  function enter(d: Dweller) {
    settleIn(d);
    d.arrival = { stage: 'entering', since: 0 };
    d.fade = 0;
    if (d.kind === 'octopus') {
      const r = d.rock!;
      d.tx = r.spotX; d.tz = r.spotZ;
      d.x = r.spotX - r.dirX * .3; d.z = r.spotZ - r.dirZ * .3;
      set(d, 'emerge');
    } else if (d.kind === 'cuttlefish') {
      d.tx = d.x; d.tz = d.z;
      const shore = field.island(d.x, d.z);
      d.x += shore.nx * .9; d.z += shore.nz * .9; d.y -= .25;
      d.heading = Math.atan2(d.tx - d.x, d.tz - d.z);
      set(d, 'enter');
    } else {
      inDen(d, 1);
      set(d, 'inside', .6);
    }
    remember(d);
  }
  function progressArrival(d: Dweller, dt: number) {
    const A = d.arrival;
    if (!A || A.stage === 'offstage') return;
    A.since += dt;
    if (A.stage !== 'entering') return;
    d.fade = Math.min(1, d.fade + dt / (d.kind === 'moray' ? .5 : 2.6));
    const done = d.kind === 'octopus' ? d.state !== 'emerge' : d.kind === 'cuttlefish' ? d.state !== 'enter' : d.state === 'den';
    if ((done && d.fade >= 1) || A.since > ARRIVAL_LIMIT) { A.stage = 'arrived'; A.since = 0; d.fade = 1; }
  }

  function publishOne(d: Dweller, t: number) {
    const p = d.previous, pose = d.pose;
    pose.x = p.x + (d.x - p.x) * t;
    pose.z = p.z + (d.z - p.z) * t;
    pose.y = p.y + (d.y - p.y) * t;
    pose.heading = p.heading + wrap(d.heading - p.heading) * t;
    pose.bank = p.bank + (d.bank - p.bank) * t;
    pose.pitch = p.pitch + (d.pitch - p.pitch) * t;
    const cruise = d.kind === 'octopus' ? O.crawl : d.kind === 'cuttlefish' ? F.cruise : M.swim;
    pose.turn = d.turn; pose.speed = Math.abs(d.speed); pose.climb = d.climb; pose.air = 0;
    pose.pace = Math.abs(d.speed) / cruise;
    pose.effort = .65 + .35 * Math.min(pose.pace, 1.5);
    pose.rest = d.rest; pose.jet = d.jet; pose.ground = d.ground;
    pose.tone![0] = d.tone[0]; pose.tone![1] = d.tone[1]; pose.tone![2] = d.tone[2];
    pose.hide![0] = d.hide[0]; pose.hide![1] = d.hide[1];
  }

  return {
    /** The reef animals to draw (each a lone animal, a group of one). */
    swimmers,
    /** The rocks the scene draws for them: each moray's two dens and each octopus's rock. */
    get rocks() { return rocks; },
    get(lane: number): MarinePose | undefined { return byLane.get(lane)?.pose; },
    /** Reef animals never dive; an arriving one fades in (as from the deep), and one deep in its den counts as out of sight. */
    dive(lane: number) {
      const d = byLane.get(lane);
      if (!d || d.arrival?.stage === 'offstage') return OFFSTAGE;
      const hidden = Math.max(d.hide[0], d.hide[1]);
      return { depth: 1 - d.fade, surfacing: d.fade < 1, y: SWIM_LEVEL, opacity: d.fade * (hidden > .9 ? 0 : 1), visible: hidden < .999 };
    },
    arrive(lane: number, how: { instant?: boolean } = {}) {
      const d = byLane.get(lane);
      if (!d?.arrival || d.arrival.stage !== 'offstage') return false;
      if (how.instant) { settleIn(d); d.arrival = { stage: 'arrived', since: 0 }; d.fade = 1; remember(d); return true; }
      enter(d);
      return true;
    },
    arrival(lane: number): Readonly<Arrival> | null { return byLane.get(lane)?.arrival ?? null; },
    /** What it is doing, for tests and tuning. */
    inspect(lane: number) {
      const d = byLane.get(lane);
      return d && { state: d.state, x: d.x, z: d.z, y: d.y, heading: d.heading, aim: d.aim, alarm: d.alarm, den: d.den, rock: d.rock, dens: d.dens, reach: reach(d.x, d.z) };
    },
    /** One fixed step (s) with the open-water animals as they are now. */
    step(dt: number, visitors: readonly ReefVisitor[]) {
      time += dt;
      for (const d of dwellers) {
        remember(d);
        if (d.arrival?.stage === 'offstage') continue;
        d.since += dt;
        if (d.kind === 'octopus') stepOctopus(d, visitors, dt);
        else if (d.kind === 'cuttlefish') stepCuttlefish(d, visitors, dt);
        else stepMoray(d, visitors, dt);
        progressArrival(d, dt);
      }
    },
    /** Poses `t` of the way from the last step to this one. */
    publish(t: number) { for (const d of dwellers) publishOne(d, t); },
    /** A new level: the island grows a little, and the rocks (and everyone with them) move out with it. */
    setLevel(next: number) {
      if (next === current) return;
      const ratio = islandScale(next) / scale;
      current = next; scale = islandScale(next); field = createShoreField(next);
      layout = reefRocks(next, count('moray'), count('octopus'));
      rocks = layout.dens.flat().concat(layout.rocks);
      props = Object.values(SEABED_PROPS).map(([x, z]) => ({ x: x * scale, z: z * scale }));
      let rockIndex = 0, denIndex = 0;
      for (const d of dwellers) {
        if (d.kind === 'octopus') d.rock = layout.rocks[rockIndex++];
        if (d.kind === 'moray') d.dens = layout.dens[denIndex++];
        d.x *= ratio; d.z *= ratio; d.tx *= ratio; d.tz *= ratio;
        if (d.kind === 'moray' && (d.state === 'den' || d.state === 'retreat' || d.state === 'return' || d.state === 'inside')) inDen(d, d.hide[0]);
        if (d.kind === 'octopus' && d.state === 'rest') { d.x = d.rock!.spotX; d.z = d.rock!.spotZ; }
        remember(d);
      }
    },
  };
}
export type ReefLife = ReturnType<typeof createReefLife>;
