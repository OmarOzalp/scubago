import { breachFlight, breachHeight, DOLPHIN_BREACH, type BreachConfig, type BreachStage } from './breach';
import { createShoreField } from './island-outline';
import { GROUP_STYLES, type GroupStyle } from './marine-groups';
import { OCEAN } from './ocean';
import { sampleDive, SWIM_LEVEL } from './ocean-depth';
import { apparentShift, clamp, ease, frame, OCEAN_GROWTH, roamFor, smoothstep, TAU, variation, viewHeight, WORLD, worldFor, wrap } from './steering';
import type { MarineModel } from './swimming';
import { attackRoll, createTunaSchool, GREAT_WHITE_HUNT, SCHOOL_REACTIONS, TUNA_SCHOOL, type SchoolNeighbor } from './tuna-school';

export { WORLD } from './steering';

/**
 * One species on the island. `group` animals of it swim together as one (see marine-groups.ts):
 * the species' own animal leads, and the rest follow it. 1, the default, is a lone animal.
 */
export type MarineMember = { model: MarineModel; lane: number; group?: number };
/** An animal the scene draws: a species' leader (`index` 0, `leader` its own lane) or a follower in its group. */
export type MarineSwimmer = { model: MarineModel; lane: number; leader: number; index: number };
/** Followers' lanes: clear of the species' own (0 to 7) and one per group member. */
export const followerLane = (leader: number, index: number) => 100 + leader * 8 + index;
/**
 * `effort` drives artist swim clips (never below .65); `pace` is speed relative to the
 * species' cruise and drives procedural rigs. `turn` is the heading change in rad/s
 * (positive toward the animal's left), `speed` in world units/s, `climb` -1..1. `pitch` is the
 * body's pitch (rad, positive nose down) and `air` how far it is out of the water (0..1).
 */
export type MarinePose = {
  x: number; y: number; z: number; heading: number; bank: number; effort: number; pace: number; turn: number; speed: number; climb: number;
  pitch: number; air: number;
};

/**
 * How a species moves through the scene; its swimming gait (stroke rate and amplitude) lives in
 * src/lib/marine-rigs.ts. Distances are world units: the island is about 4.3 across.
 */
export type Movement = {
  /** Cruising speed (units/s), slow speed changes (fraction and period in s) and occasional surges (fraction of cruise). */
  cruise: number; swing: number; swingPeriod: number; surge: number;
  /** Top turn rate (rad/s), and how quickly its heading settles onto a new course (1/s): low values give wide, lazy arcs. */
  turnRate: number; turnEase: number;
  /** Roll into turns: rad per rad/s of turn, the largest roll, how quickly roll follows (1/s), and an occasional lazy roll (rad). */
  bank: number; bankMax: number; bankEase: number; lazyRoll: number;
  /** Resting roll (rad): the ocean sunfish drifts tilted onto its side. */
  tilt: number;
  /** Footprint seen from above, most of the fins included: half its length and half its width (units). */
  halfLength: number; halfWidth: number;
  /** Gap it tries to keep between its footprint and other animals' (units), and how readily it steers for it (0–1). */
  personalSpace: number; avoidance: number;
  /** Closest its center comes to the island's shore (units), and how much farther out it likes to roam: [inner, outer]. */
  islandClearance: number; roam: readonly [number, number];
  /** How the roaming distance changes: period (s), and 0 (smooth drift) to 1 (hold a line, then cross over decisively). */
  roamPeriod: number; patrol: number;
  /** Depth offset (units, negative is deeper) and vertical drift: amplitude (units) and period (s). */
  depth: number; bob: number; bobPeriod: number;
  /** Average seconds between reversals of its circling direction (0 = never). */
  reverseEvery: number;
  /** A slow meander of its course (rad either way) and its period (s): curious, curving paths instead of a steady line. */
  weave?: number; weavePeriod?: number;
  /**
   * Air-breathers come up to the surface now and then: a breath every `every` seconds (skipped while
   * a dive is near), rising and sinking back over `rise` seconds each and staying up for `hold`,
   * with its middle `clearance` units below the calm surface.
   */
  breathe?: { every: number; rise: number; hold: number; clearance: number };
  /** How far its body pitches with its rise and fall (rad per unit/s; the default is .35). */
  pitch?: number;
  /** Now and then a breath becomes a leap clear of the water (see breach.ts). */
  breach?: BreachConfig;
};

const FAMILY: Movement = {
  cruise: .36, swing: .17, swingPeriod: TAU / .19, surge: 0, turnRate: .38, turnEase: .5, bank: .48, bankMax: .3, bankEase: 2, lazyRoll: 0, tilt: 0,
  halfLength: 1.1, halfWidth: .4, personalSpace: .25, avoidance: .8, islandClearance: .95, roam: [.3, 1], roamPeriod: 60, patrol: 0,
  depth: 0, bob: .045, bobPeriod: TAU / .31, reverseEvery: 100,
};
export const MOVEMENT: Record<MarineModel, Movement> = {
  // Enormous and unhurried: steady speed, very wide arcs, stays well offshore and barely yields to anything.
  'whale-shark': {
    cruise: .27, swing: .06, swingPeriod: 44, surge: 0, turnRate: .17, turnEase: .25, bank: .35, bankMax: .09, bankEase: .6, lazyRoll: 0, tilt: 0,
    halfLength: 1.4, halfWidth: .6, personalSpace: .2, avoidance: .35, islandClearance: 1.3, roam: [.4, .95], roamPeriod: 90, patrol: 0,
    depth: -.18, bob: .065, bobPeriod: 27, reverseEvery: 0,
  },
  // Medium cruise with confident curves, happy closer to shore, and the occasional lazy roll onto one side.
  'tiger-shark': {
    cruise: .41, swing: .14, swingPeriod: 30, surge: 0, turnRate: .38, turnEase: .5, bank: .5, bankMax: .2, bankEase: 1.3, lazyRoll: .16, tilt: 0,
    halfLength: 1.1, halfWidth: .42, personalSpace: .25, avoidance: .8, islandClearance: .85, roam: [.2, .8], roamPeriod: 55, patrol: .2,
    depth: -.04, bob: .04, bobPeriod: 19, reverseEvery: 95,
  },
  // Fastest and most maneuverable: holds a line, then turns decisively; now and then a powerful surge.
  'great-white-shark': {
    cruise: .5, swing: .07, swingPeriod: 26, surge: .2, turnRate: .5, turnEase: .7, bank: .42, bankMax: .2, bankEase: 2.4, lazyRoll: 0, tilt: 0,
    halfLength: 1.15, halfWidth: .45, personalSpace: .3, avoidance: .9, islandClearance: .95, roam: [.4, 1.1], roamPeriod: 45, patrol: .85,
    depth: -.08, bob: .03, bobPeriod: 21, reverseEvery: 110,
  },
  // Underwater flight: wide weaving turns with deep banks, long climbs and descents, fairly close to the reef.
  'reef-manta': {
    cruise: .33, swing: .2, swingPeriod: 12, surge: 0, turnRate: .3, turnEase: .45, bank: 1.9, bankMax: .38, bankEase: 1.1, lazyRoll: 0, tilt: 0,
    halfLength: .7, halfWidth: 1, personalSpace: .25, avoidance: .8, islandClearance: 1.2, roam: [.1, .8], roamPeriod: 50, patrol: 0,
    depth: .06, bob: .09, bobPeriod: 17, reverseEvery: 80,
  },
  // Slow, heavy and a little clumsy: drifts tilted on its side through deeper water, turning reluctantly.
  'mola-mola': {
    cruise: .23, swing: .1, swingPeriod: 37, surge: 0, turnRate: .16, turnEase: .25, bank: .25, bankMax: .07, bankEase: .5, lazyRoll: 0, tilt: .95,
    halfLength: .8, halfWidth: .95, personalSpace: .2, avoidance: .5, islandClearance: 1.25, roam: [.3, .85], roamPeriod: 80, patrol: 0,
    depth: -.12, bob: .085, bobPeriod: 23, reverseEvery: 150,
  },
  // Calm and fairly agile: cruises over the shallows close to shore, yielding readily to bigger animals.
  'green-turtle': {
    cruise: .37, swing: .12, swingPeriod: 20, surge: 0, turnRate: .4, turnEase: .55, bank: .6, bankMax: .14, bankEase: 1.5, lazyRoll: 0, tilt: 0,
    halfLength: .55, halfWidth: .6, personalSpace: .2, avoidance: 1, islandClearance: .9, roam: [0, .45], roamPeriod: 45, patrol: 0,
    depth: .12, bob: .06, bobPeriod: 15, reverseEvery: 70,
  },
  // Agile and curious: medium speed with smooth, fairly tight arcs that meander in and out, a moderate
  // bank, mid-water, a little closer to shore than the whale shark.
  'scalloped-hammerhead': {
    cruise: .43, swing: .12, swingPeriod: 24, surge: .08, turnRate: .52, turnEase: .82, bank: .62, bankMax: .24, bankEase: 1.8, lazyRoll: 0, tilt: 0,
    halfLength: 1.05, halfWidth: .36, personalSpace: .25, avoidance: .85, islandClearance: 1, roam: [.25, 1], roamPeriod: 36, patrol: 0,
    depth: -.1, bob: .05, bobPeriod: 16, reverseEvery: 75, weave: .26, weavePeriod: 13,
  },
  // Playful and athletic: medium-fast with short bursts, the most agile turns, gentle banks, swimming
  // highest and rising and falling the most, and coming up to breathe now and then.
  'bottlenose-dolphin': {
    cruise: .47, swing: .16, swingPeriod: 14, surge: .3, turnRate: .62, turnEase: .9, bank: .75, bankMax: .3, bankEase: 1.6, lazyRoll: .08, tilt: 0,
    halfLength: .8, halfWidth: .26, personalSpace: .25, avoidance: 1, islandClearance: .85, roam: [.1, .9], roamPeriod: 30, patrol: 0,
    depth: .16, bob: .1, bobPeriod: 11, reverseEvery: 60, weave: .2, weavePeriod: 9,
    breathe: { every: 26, rise: 3.2, hold: 1.8, clearance: .2 }, pitch: 1.3, breach: DOLPHIN_BREACH,
  },
  // Family representatives stand in for species without their own model.
  shark: FAMILY,
  manta: { ...FAMILY, cruise: .31, turnRate: .3, turnEase: .45, halfLength: .9, halfWidth: .8, islandClearance: 1.05 },
  'reef-fish': { ...FAMILY, cruise: .44, turnRate: .45, turnEase: .65, halfLength: .4, halfWidth: .1, personalSpace: .2, avoidance: 1, islandClearance: .5, roam: [0, .8], reverseEvery: 60 },
};

/** Simulation step (s): fixed, so a 20 fps simulator and a 60 fps phone move animals identically. */
const STEP = 1 / 60;
/** How far ahead (s) animals look for another animal crossing their path, and for one they will pass. */
const LOOKAHEAD = 3, LANE_LOOKAHEAD = 14;
/** How long (s) before an animal returns from a dive (see ocean-depth.ts) the others start making room for it. */
const SURFACING_LEAD = 6;
/** The tuna school steps every other simulation step (30 Hz, interpolated like the animals): smooth for small fish, half the cost. */
const SCHOOL_STEP = STEP * 2;
/** Islets are small sandbars without a wet-sand fringe: animals keep just their footprint plus this much (units) clear of them. */
const ISLET_MARGIN = .25;
/** The calm surface as a height above the swimming level, like the animals' heights here (see ocean-depth.ts). */
const SURFACE = OCEAN.surfaceLevel - SWIM_LEVEL;
/** Seconds each member of a group dives after the one before it. */
const DIVE_STAGGER = .8;
/** The most a leap's run-up turns to line up (rad), and how much nimbler it turns while doing so. */
const LEAP_TURN = .85, LINE_UP = 2;

/** How far a footprint (half-length a along heading h, half-width b across it) reaches toward the unit direction u. */
const reachToward = (a: number, b: number, hx: number, hz: number, ux: number, uz: number) =>
  Math.hypot(a * (ux * hx + uz * hz), b * (ux * hz - uz * hx));

/**
 * Clear water between two footprints (negative where they overlap): the widest gap across a few
 * axes (between their centers, and along and across each), a close lower bound that is cheap.
 * `qx, qz` runs from the first to the second.
 */
function footprintGap(a: Movement, ah: number, b: Movement, bh: number, qx: number, qz: number) {
  const d = Math.hypot(qx, qz) || 1e-6, ahx = Math.sin(ah), ahz = Math.cos(ah), bhx = Math.sin(bh), bhz = Math.cos(bh);
  const gap = (ux: number, uz: number) => Math.abs(qx * ux + qz * uz)
    - reachToward(a.halfLength, a.halfWidth, ahx, ahz, ux, uz) - reachToward(b.halfLength, b.halfWidth, bhx, bhz, ux, uz);
  return Math.max(gap(qx / d, qz / d), gap(ahz, -ahx), gap(bhz, -bhx), gap(ahx, ahz), gap(bhx, bhz));
}

/** Where the roaming distance from shore sits right now, 0 (inner) to 1 (outer). */
function roamBand(m: Movement, time: number, lane: number) {
  const wave = Math.sin(time * TAU / m.roamPeriod + lane * 1.71);
  const shaped = (1 - m.patrol) * wave + m.patrol * Math.tanh(2.5 * wave) / Math.tanh(2.5);
  return .5 + .5 * shaped;
}

/**
 * A hunter's stalking of the tuna school (GREAT_WHITE_HUNT in tuna-school.ts): swimming as usual
 * (`normal`), near the school (`encounter`, which may become a charge: decided once, when it
 * begins), charging through it (`charge`), then easing back to its cruise (`exit`).
 */
export type HuntPhase = 'normal' | 'encounter' | 'charge' | 'exit';
type Hunt = {
  phase: HuntPhase;
  /** Seconds in this phase; encounters so far (each one's roll is indexed by this); whether this one becomes a charge; charges so far. */
  since: number; encounters: number; attack: boolean; charges: number;
  /** It has left the school's surroundings since its last encounter, so its next approach is a new one. */
  away: boolean;
  /** No new encounter before this time (s): the cooldown after a charge. */
  rested: number;
  /** Where the charge is aimed; close to the school it commits to a heading and drives straight through. */
  aimX: number; aimZ: number; committed: boolean; line: number;
  /** Why an encounter that will become a charge has not yet (for tuning): 'dive', 'range', 'bearing' or 'line'. */
  waiting: string;
};

/**
 * A leap clear of the water (DOLPHIN_BREACH in breach.ts): the run-up (`build`), the arc through the
 * air (`air`), the plunge back under and the return to its depth (`reentry`); or a run-up called
 * off at its last check, blending into an ordinary breath (`settle`). One stage at a time, in order.
 */
type Leap = {
  stage: BreachStage | 'settle';
  /** Seconds into this stage; its speed when the run-up began; the heading it lines up on, and whether that is now fixed. */
  since: number; from: number; heading: number; locked: boolean;
  /** Where it leaves the water and lands again, as last judged (for tuning overlays). */
  exitX: number; exitZ: number; landX: number; landZ: number;
  /** A called-off run-up: its height's difference from the breath it blends into, fading out. */
  offset: number;
  /** Where the run-up started: its height and vertical speed (a breath may already be rising). */
  start: { y: number; speed: number };
};
/** A follower's place beside and behind its leader: across and behind (units), moving `from` one `to` another in a trade. */
type Place = { from: readonly [number, number]; to: readonly [number, number]; since: number; dip: number };
/** Animals that swim together: the leader first (a lone animal is a group of one). */
type Group = {
  /** How it swims together (null for a lone animal), how many it has, and its members, the leader first. */
  style: GroupStyle | null; size: number; members: Animal[];
  /** When its last leap ended (s); the next time two members trade places; trades so far and when the last began. */
  lastLeap: number; nextSwap: number; swaps: number; traded: number;
  /** A follower's place ran up against the island: the group swings its places to the open side. */
  blocked: boolean;
};

type Animal = {
  model: MarineModel; lane: number;
  /** How it moves. The species' own (`base`) for most; a group's leader steers with a footprint wide enough for all of it. */
  m: Movement; base: Movement;
  group: Group;
  /** 0 for the leader, 1 on for followers; a follower's place, and where that is in the water now (for overlays). */
  index: number; place: Place | null; slotX: number; slotZ: number;
  /** Seconds its dive and breaths run behind its leader's. */
  delay: number;
  /** The breath cycle it last decided on, the one in which it leapt (that breath is skipped), and until when a leap it rolled may still begin. */
  cycle: number; leapt: number; waiting: number;
  leap: Leap | null;
  /** Body pitch (rad, positive nose down), how far out of the water it is (0..1), and its world height last step. */
  pitch: number; air: number; worldY: number;
  x: number; z: number; y: number; heading: number; speed: number; turn: number; bank: number; climb: number;
  /** Apparent offset toward the viewer (see apparentShift), and how much closer than its island clearance it may pass islets. */
  shift: number; allowance: number;
  /** +1 or -1: which way it circles the island. A half turn keeps to one side (+1 or -1, as `turn`) until it is done. */
  direction: number; halfTurn: number; nextReverse: number; reversals: number;
  /** Smoothed desired change of heading (rad), relative to the current heading. */
  want: number;
  /** Slowing (0..1) and rise (units) while making room for another animal; the pace of one it waits behind; how involved it is with others (0..1). */
  brake: number; lift: number; follow: number; followSpeed: number; busy: number;
  previous: { x: number; z: number; y: number; heading: number; bank: number; pitch: number };
  /** Its depth before any breath at the surface (air-breathers rise from it and settle back to it). */
  level: number;
  pose: MarinePose;
  steering: { roam: [number, number]; island: [number, number]; animals: [number, number]; frame: [number, number]; band: number; lane: number };
  /** Only for species that hunt the tuna school, when there is one. */
  hunt: Hunt | null;
};

/** A group's leader steers for all of it: its footprint and island clearance widen to take in its followers' places. */
function spread(m: Movement, style: GroupStyle, followers: number): Movement {
  const places = style.places.slice(0, followers);
  const across = Math.max(...places.map(([x]) => Math.abs(x))) + style.wander;
  const behind = Math.max(...places.map(([, z]) => z)) + style.wander;
  return { ...m, halfWidth: m.halfWidth + .7 * across, halfLength: m.halfLength + .5 * behind, islandClearance: m.islandClearance + .25 * across };
}

/**
 * A small shared simulation (see docs/marine-navigation.md). Each animal blends a few steering
 * influences into one desired direction: roaming along the coast at its own distance offshore,
 * passing other animals in lanes (smaller, nimbler ones making most of the room), keeping its
 * species' clearance from the island and islets, and staying in frame. The result is smoothed,
 * and turning is rate-limited and damped per species, so course changes read as intentional.
 * A species that swims in a group (marine-groups.ts) is steered by its leader, with the others
 * following in loose places of their own; air-breathers now and then leap clear of the water
 * (breach.ts). The ocean area grows with the island's level (OCEAN_GROWTH in steering.ts).
 */
export function createMarineMotion(members: readonly MarineMember[], level = 1, options: {
  /** Add the tuna school: true for TUNA_SCHOOL.size fish (0 leaves it out), or a number of fish. */
  school?: boolean | number;
  /** Varies the school's start, the hunter's rolls and the leaps (0..1); the same seed replays the same scene. */
  seed?: number;
  /** Replaces every leaper's chance that a breath becomes a leap (0..1), for reviewing leaps. */
  leap?: number;
} = {}) {
  let field = createShoreField(level), current = level;
  const seed = options.seed ?? 0;
  /** Species on the island: dives are staggered among them (see ocean-depth.ts); group members count once. */
  const population = members.length;
  // The ocean area animals keep to and their extra roaming room: this level's, easing to a new level's after setLevel().
  const ocean = { world: worldFor(level), roam: roamFor(level) };
  let goal = { world: worldFor(level), roam: roamFor(level) };
  const size = typeof options.school === 'number' ? options.school : options.school ? TUNA_SCHOOL.size : 0;
  const school = size > 0 ? createTunaSchool(field, { seed, size, ocean }) : null;
  let time = 0, accumulator = 0, schoolTick = 0;
  /** The last few splashes (a leap's exit and re-entry), oldest overwritten first: where, when (s) and how strong (0..1). */
  const splashes = Array.from({ length: 8 }, () => ({ x: 0, z: 0, time: -Infinity, strength: 0 }));
  let splashHead = 0;
  const animals: Animal[] = members.map((member, index) => {
    const base = MOVEMENT[member.model], style = GROUP_STYLES[member.model] ?? null;
    const count = style ? clamp(Math.round(member.group ?? 1), 1, 1 + style.places.length) : 1;
    const m = count > 1 ? spread(base, style!, count - 1) : base;
    const shift = apparentShift(m.depth);
    const direction = variation(member.lane, 0) < .68 ? 1 : -1;
    // Start spread around the island in the middle of the species' roaming band, heading along the coast.
    const angle = index * TAU / Math.max(1, members.length) + .3;
    const target = m.islandClearance + (m.roam[0] + m.roam[1]) / 2;
    let radius = 1.5;
    const allowance = Math.max(0, m.islandClearance - m.halfWidth - ISLET_MARGIN);
    while (frame(radius * Math.cos(angle), radius * Math.sin(angle), ocean.world).edge < .9
      && field.island(radius * Math.cos(angle), radius * Math.sin(angle), allowance).distance < target) radius += .05;
    const x = radius * Math.cos(angle), apparentZ = radius * Math.sin(angle), z = apparentZ - shift;
    const shore = field.island(x, apparentZ, allowance);
    const heading = Math.atan2(-shore.nz * direction, shore.nx * direction);
    const y = -.02 + m.depth + Math.sin(member.lane * 1.7) * m.bob;
    const group: Group = { style: count > 1 ? style : null, size: count, members: [], lastLeap: -Infinity, nextSwap: Infinity, swaps: 0, traded: -Infinity, blocked: false };
    const animal: Animal = {
      model: member.model, lane: member.lane, group, m, base, x, z, y, heading, speed: m.cruise, turn: 0, bank: m.tilt, climb: 0, shift, allowance,
      direction, halfTurn: 0, nextReverse: m.reverseEvery ? m.reverseEvery * (.5 + variation(member.lane, 1)) : Infinity, reversals: 0,
      want: 0, brake: 0, lift: 0, follow: 0, followSpeed: m.cruise, busy: 0,
      previous: { x, z, y, heading, bank: m.tilt, pitch: 0 }, level: y,
      pose: { x, y, z, heading, bank: m.tilt, effort: 1, pace: 1, turn: 0, speed: m.cruise, climb: 0, pitch: 0, air: 0 },
      steering: { roam: [0, 0], island: [0, 0], animals: [0, 0], frame: [0, 0], band: target, lane: target },
      hunt: school && SCHOOL_REACTIONS[member.model].hunts
        ? { phase: 'normal' as HuntPhase, since: 0, encounters: 0, attack: false, charges: 0, away: true, rested: 0, aimX: 0, aimZ: 0, committed: false, line: 0, waiting: '' }
        : null,
      index: 0, place: null, slotX: x, slotZ: z, delay: 0, cycle: NaN, leapt: NaN, waiting: -Infinity, leap: null, pitch: 0, air: 0, worldY: NaN,
    };
    group.members.push(animal);
    if (group.style) group.nextSwap = group.style.swapEvery ? group.style.swapEvery * (.5 + variation(member.lane + 17, 0)) : Infinity;
    return animal;
  });
  /** Followers: each group's other members, starting in their places behind the leader. */
  const followers: Animal[] = [];
  for (const head of animals) {
    const style = head.group.style;
    for (let index = 1; style && index < head.group.size; index++) {
      const m = head.base, [across, behind] = style.places[index - 1];
      const hx = Math.sin(head.heading), hz = Math.cos(head.heading), allowance = Math.max(0, m.islandClearance - m.halfWidth - ISLET_MARGIN);
      let x = head.x + hz * across - hx * behind, z = head.z - hx * across - hz * behind;
      const shore = field.island(x, z + head.shift, allowance);
      if (shore.distance < m.islandClearance) { x += shore.nx * (m.islandClearance - shore.distance); z += shore.nz * (m.islandClearance - shore.distance); }
      const y = head.y + style.depthSpread * (index % 2 ? -1 : 1), lane = followerLane(head.lane, index);
      const follower: Animal = {
        model: head.model, lane, group: head.group, m, base: m, x, z, y, heading: head.heading, speed: head.speed, turn: 0, bank: m.tilt, climb: 0,
        shift: head.shift, allowance, direction: head.direction, halfTurn: 0, nextReverse: Infinity, reversals: 0,
        want: 0, brake: 0, lift: 0, follow: 0, followSpeed: m.cruise, busy: 0,
        previous: { x, z, y, heading: head.heading, bank: m.tilt, pitch: 0 }, level: y,
        pose: { x, y, z, heading: head.heading, bank: m.tilt, effort: 1, pace: 1, turn: 0, speed: m.cruise, climb: 0, pitch: 0, air: 0 },
        steering: { roam: [0, 0], island: [0, 0], animals: [0, 0], frame: [0, 0], band: 0, lane: 0 },
        hunt: null,
        index, place: { from: style.places[index - 1], to: style.places[index - 1], since: Infinity, dip: 0 }, slotX: x, slotZ: z,
        delay: index * DIVE_STAGGER, cycle: NaN, leapt: NaN, waiting: -Infinity, leap: null, pitch: 0, air: 0, worldY: NaN,
      };
      head.group.members.push(follower);
      followers.push(follower);
    }
  }
  /** Everyone drawn: the species' animals, then the followers. */
  const everyone = [...animals, ...followers];
  const groups = animals.map((a) => a.group);
  const swimmers: MarineSwimmer[] = everyone.map((a) => ({ model: a.model, lane: a.lane, leader: a.group.members[0].lane, index: a.index }));
  /** What the school sees of the animals (every one of them, as itself), refreshed in place every step. */
  const neighbors: SchoolNeighbor[] = everyone.map((a) => ({
    model: a.model, x: a.x, y: a.y, z: a.z, heading: a.heading, speed: a.speed, halfLength: a.base.halfLength, halfWidth: a.base.halfWidth, presence: 1, charging: false,
  }));
  const byLane = new Map(everyone.map((animal) => [animal.lane, animal]));
  /** For each pair in an encounter, which side the first of the two keeps (+1 outside), decided once for the whole encounter. */
  const encounters = new Map<number, number>();
  /** Its dive (see ocean-depth.ts): a group dives together on its leader's cycle, each member a little after the one before. */
  const diveOf = (a: Animal, at: number) => sampleDive(at - a.delay, a.group.members[0].lane, population);
  /**
   * How much an animal counts for the others: 1 near the surface, fading to 0 while it is deep
   * below them on a dive, and back to 1 a few seconds before it returns.
   */
  const presence = (a: Animal) => Math.max(diveOf(a, time).opacity, diveOf(a, time + SURFACING_LEAD).opacity);
  /**
   * An air-breather's breath cycle: which one it is in, how far into it (s), and how long a breath
   * lasts (s). Breaths come every `breathe.every` seconds, staggered by lane; a group's members
   * breathe one after another, `stagger` seconds apart.
   */
  function breathCycle(a: Animal) {
    const b = a.m.breathe!, at = time + a.group.members[0].lane * 7.3 - a.index * (a.group.style?.stagger ?? 0);
    const index = Math.floor(at / b.every);
    return { index, into: at - index * b.every, length: 2 * b.rise + b.hold };
  }
  /** A third member of a group now and then stays under for a breath, decided per breath. */
  const skips = (a: Animal, cycle: number) => a.index >= 2 && variation(a.group.members[0].lane * 3.1 + a.index, cycle) < (a.group.style?.skip ?? 0);
  /**
   * 0 to 1: how far an air-breather is into a breath at the surface, eased in and out: only while it
   * is up in the water for the whole of one (never next to a dive), and not in a breath it leapt in.
   */
  function breathing(a: Animal) {
    const b = a.m.breathe;
    if (!b) return 0;
    const { index, into, length } = breathCycle(a);
    if (into >= length || index === a.leapt || skips(a, index)) return 0;
    const start = time - into;
    if (diveOf(a, start).depth > 0 || diveOf(a, start + length).depth > 0) return 0;
    return smoothstep(0, b.rise, into) * (1 - smoothstep(b.rise + b.hold, length, into));
  }
  /** Its height with any breath: from its depth up to just below the surface and back. */
  function breathHeight(a: Animal) {
    const breath = breathing(a);
    return breath > 0 ? a.level + (SURFACE - a.m.breathe!.clearance - a.level) * breath : a.level;
  }
  for (const a of everyone) {
    a.worldY = a.y + diveOf(a, 0).y;
    if (a.m.breathe) a.cycle = breathCycle(a).index;
  }

  /** Leave a splash on the water where a leap breaks the surface. */
  function splash(x: number, z: number, strength: number) {
    const s = splashes[splashHead];
    s.x = x; s.z = z; s.time = time; s.strength = strength;
    splashHead = (splashHead + 1) % splashes.length;
  }
  /**
   * Whether a leap along `heading` fits, `progress` of the way through the run-up (0 when deciding,
   * `lock` at the last check; deciding asks for a little more room, as the run-up may drift): the
   * rest of the run-up, the arc and the plunge after it (which carries on a little while it slows)
   * stay clear of the island and islets by the species' clearance and a margin, and inside the frame;
   * and every other animal, its own group included, is well clear of it at each point of the leap
   * when it gets there (judged from where each is and where it is heading). Writes the exit and
   * landing it judged.
   */
  function leapFits(a: Animal, c: BreachConfig, progress: number, heading: number, into: Leap | null) {
    const { speed } = breachFlight(c), hx = Math.sin(heading), hz = Math.cos(heading), deciding = progress === 0;
    const rest = (1 - progress) * c.build, runUp = rest * (a.speed + speed) / 2, reach = c.length + c.runOut;
    const ex = a.x + hx * runUp, ez = a.z + hz * runUp;
    if (into) { into.exitX = ex; into.exitZ = ez; into.landX = ex + hx * c.length; into.landZ = ez + hz * c.length; }
    // Deciding asks for a little more room than the last check, as the run-up may drift a little.
    const margin = c.islandMargin + (deciding ? .1 : 0), edge = c.frameEdge + (deciding ? -.03 : .02), view = c.view + (deciding ? 0 : .04);
    const { rise, gravity } = breachFlight(c), scale = ocean.world.x / WORLD.x;
    // The run-up's last stretch, the arc and the plunge (it lines up on the heading through the rest of the run-up).
    for (let k = -1; k <= 6; k++) {
      const t = k < 0 ? runUp * k / 3 : reach * k / 6, x = ex + hx * t, z = ez + hz * t + a.shift;
      if (field.island(x, z, a.allowance).distance < a.base.islandClearance + margin || frame(x, z, ocean.world).edge > edge) return false;
      // The arc and the splashes stay in the clear middle of the view (judged at the leap's height).
      const air = Math.min(Math.max(t, 0), c.length) / speed;
      if (k >= 0 && Math.abs(viewHeight(OCEAN.surfaceLevel + Math.max(0, rise * air - gravity * air * air / 2), ez + hz * t, scale)) > view) return false;
    }
    for (let k = 0; k <= 6; k++) {
      // Where the leap is at this point, and when (s from now): the arc at the leap's speed, the plunge slowing.
      const t = reach * k / 6, x = ex + hx * t, z = ez + hz * t;
      const when = rest + Math.min(t, c.length) / speed + Math.max(0, t - c.length) / speed;
      for (const o of everyone) {
        if (o === a || presence(o) < .1) continue;
        const ox = o.x + Math.sin(o.heading) * o.speed * when, oz = o.z + Math.cos(o.heading) * o.speed * when;
        const room = o.group === a.group ? o.base.halfWidth + a.base.halfWidth + c.podGap : (o.base.halfLength + o.base.halfWidth) / 2 + a.base.halfWidth + c.animalGap;
        if (Math.hypot(ox - x, oz - z) < room) return false;
      }
    }
    return true;
  }
  /**
   * Deciding on a leap: it needs open water around it now (no other large animal's footprint within
   * `crowd` of its own, its group aside), and a heading close to its own along which all of the leap
   * fits (it then lines up on that through the run-up, turning away from its group if need be). Null
   * when there is none.
   */
  function leapHeading(a: Animal, c: BreachConfig, into: Leap) {
    for (const o of everyone) {
      if (o === a || o.group === a.group || o.base.halfLength < .7 || presence(o) < .1) continue;
      if (footprintGap(a.base, a.heading, o.base, o.heading, o.x - a.x, o.z - a.z) < c.crowd) return null;
    }
    // The smallest turn that fits, among headings the run-up can still turn onto: either way from its own,
    // and along the coastline either way (where the ring of water is usually longest).
    const shore = field.island(a.x, a.z + a.shift, a.allowance), coast = Math.atan2(-shore.nz, shore.nx);
    const turns = [0, .15, -.15, .3, -.3, .45, -.45, .6, -.6, .8, -.8];
    for (const way of [coast, coast + Math.PI]) for (const off of [0, .15, -.15]) turns.push(wrap(way + off - a.heading));
    turns.sort((p, q) => Math.abs(p) - Math.abs(q) || (a.turn < 0 ? p - q : q - p));
    for (const turn of turns) {
      if (Math.abs(turn) > LEAP_TURN) break;
      const heading = wrap(a.heading + turn);
      if (leapFits(a, c, 0, heading, into)) return heading;
    }
    return null;
  }
  /**
   * As each of its breaths begins, an air-breather that leaps rolls, once, whether this breath becomes
   * a leap (`chance`, shared out in a pod). It needs nobody in its group already leaping (one leap per group at a time) or
   * within the group's cooldown after the last one, and no dive near; then, within the breath's first
   * `window` seconds, room for all of it (checked a few times a second). Otherwise the breath is an
   * ordinary one. A leap is never forced.
   */
  function considerLeap(a: Animal) {
    const c = a.m.breach;
    if (!c || !a.m.breathe) return;
    const cycle = breathCycle(a), g = a.group;
    if (cycle.index !== a.cycle) {
      a.cycle = cycle.index;
      a.waiting = -Infinity;
      if (g.members.some((o) => o.leap) || time - g.lastLeap < c.cooldown || skips(a, cycle.index)) return;
      if (diveOf(a, time).depth > 0 || diveOf(a, time + cycle.length).depth > 0) return;
      // In a pod the followers leap more often than the leader, which steers for them all; the pod's
      // breaths still average `chance`.
      const n = g.members.length, share = n === 1 ? 1 : a.index ? (n - .5) / (n - 1) : .5;
      if (variation(a.lane * 3.7 + seed * 131 + 5, cycle.index) >= (options.leap ?? c.chance) * share) return;
      a.waiting = time + c.window;
    }
    if (a.leap || time > a.waiting || Math.round(time / STEP) % 6 || g.members.some((o) => o.leap)) return;
    const leap: Leap = {
      stage: 'build', since: 0, from: a.speed, heading: a.heading, locked: false, exitX: 0, exitZ: 0, landX: 0, landZ: 0, offset: 0,
      start: { y: a.y, speed: (a.y - a.previous.y) / STEP },
    };
    const heading = leapHeading(a, c, leap);
    if (heading === null) return;
    leap.heading = heading;
    a.leap = leap;
    a.waiting = -Infinity;
  }
  /**
   * One step through a leap's stages. At the last check of the run-up the heading is fixed and the
   * whole leap judged again: clear, it commits (from here the arc always completes); otherwise it
   * blends into an ordinary breath. Breaking the surface on the way out and back in leaves splashes.
   */
  function progressLeap(a: Animal) {
    const L = a.leap!, c = a.m.breach!;
    L.since += STEP;
    if (L.stage === 'build') {
      if (!L.locked && L.since >= c.lock * c.build) {
        // It may still be turning onto the heading it lined up for: both that and where it points now must fit.
        if (leapFits(a, c, c.lock, a.heading, null) && leapFits(a, c, c.lock, L.heading, L)) L.locked = true;
        else { L.stage = 'settle'; L.offset = a.y - breathHeight(a); L.since = 0; return; }
      }
      if (L.since >= c.build) { L.stage = 'air'; L.since -= c.build; a.leapt = a.cycle; splash(a.x, a.z, c.splash.exit); }
    } else if (L.stage === 'air') {
      if (L.since >= c.air) { L.stage = 'reentry'; L.since -= c.air; splash(a.x, a.z, c.splash.reentry); }
    } else if (L.stage === 'reentry') {
      if (L.since >= c.reentry) { a.leap = null; a.group.lastLeap = time; }
    } else if (L.since >= c.settle) a.leap = null;
  }
  /** A leap's own speed over the ground: up to the leap's through the run-up, steady in the air, easing back to cruise after (null otherwise). */
  function leapSpeed(a: Animal) {
    const L = a.leap;
    if (!L || L.stage === 'settle') return null;
    const c = a.m.breach!, { speed } = breachFlight(c);
    if (L.stage === 'build') return L.from + (speed - L.from) * smoothstep(0, .85, L.since / c.build);
    if (L.stage === 'air') return speed;
    return speed + (a.base.cruise - speed) * smoothstep(0, .5, L.since / c.reentry);
  }
  /** How firmly a leap holds its heading: fixed through the arc (the run-up lines up on it), freed gradually after the plunge. */
  function leapLock(a: Animal) {
    const L = a.leap;
    if (!L) return 0;
    if (L.stage === 'air') return 1;
    if (L.stage === 'reentry') return 1 - smoothstep(0, .3, L.since / a.m.breach!.reentry);
    return 0;
  }
  /**
   * Its new height: easing toward `target` (its depth and drift), with a breath or a leap on top. A
   * leap follows breach.ts's curves; a called-off one fades into the breath.
   */
  function rise(a: Animal, target: number) {
    a.level += (target - a.level) * ease(.9, STEP);
    const L = a.leap;
    if (!L) return breathHeight(a);
    if (L.stage === 'settle') return breathHeight(a) + L.offset * (1 - smoothstep(0, a.m.breach!.settle, L.since));
    return breachHeight(L.stage, L.since, a.level, SURFACE, a.m.breach, L.start)[0];
  }
  /** Take a new height: climb for the rig, body pitch following its path through the water (and air), and how far out it is. */
  function settleHeight(a: Animal, y: number) {
    const m = a.m;
    a.climb = clamp((y - a.y) / STEP / (m.bob * TAU / m.bobPeriod + .02), -1, 1);
    a.y = y;
    const world = y + diveOf(a, time).y, rate = (world - a.worldY) / STEP;
    a.worldY = world;
    const flying = !!a.leap && a.leap.stage !== 'settle';
    const target = flying ? -Math.atan2(rate, Math.max(a.speed, .05)) : clamp(-rate * (m.pitch ?? .35), -.22, .22);
    // Leaping, the body follows its path closely (level at the apex, nose first back in).
    a.pitch += (target - a.pitch) * ease(flying ? 30 : a.leap ? 9 : 1.6, STEP);
    a.air = smoothstep(SURFACE - .05, SURFACE + .3, y);
  }
  /** Roll into turns (a slow lazy roll for some species), settling around any resting tilt. */
  function roll(a: Animal) {
    const m = a.m, lazy = m.lazyRoll * Math.sin(time * TAU / 27 + a.lane * 2.1) ** 5;
    const bank = clamp(-a.turn * m.bank + lazy, -m.bankMax, m.bankMax) + m.tilt * (1 + .12 * Math.sin(time * TAU / 31 + a.lane));
    a.bank += (bank - a.bank) * ease(m.bankEase, STEP);
  }
  function remember(a: Animal) {
    const p = a.previous;
    p.x = a.x; p.z = a.z; p.y = a.y; p.heading = a.heading; p.bank = a.bank; p.pitch = a.pitch;
  }

  /**
   * How much room a half turn toward `side` (+1 or -1, as `turn`) has: the least clearance, from the
   * island and from the frame, at the far side of its turning circle and halfway round.
   */
  function turnRoom(a: Animal, side: number) {
    const hx = Math.sin(a.heading), hz = Math.cos(a.heading), r = .9 * a.speed / a.m.turnRate;
    let room = Infinity;
    for (const [along, across] of [[r, r], [0, 2 * r]]) {
      const x = a.x + hx * along + side * hz * across, z = a.z + a.shift + hz * along - side * hx * across;
      room = Math.min(room, field.island(x, z, a.allowance).distance - a.m.islandClearance, (1 - frame(x, z, ocean.world).edge) * 4);
    }
    return room;
  }
  /** Which way to swing a half turn: toward the side with more room, keeping a turn already under way unless it is cramped. */
  function halfTurnSide(a: Animal) {
    const left = turnRoom(a, 1), right = turnRoom(a, -1), bias = Math.abs(a.turn) > .03 ? Math.sign(a.turn) * .3 : 0;
    return left + bias >= right - bias ? 1 : -1;
  }

  /** Where a charge aims: the school's middle, a little toward its front, leading it by where it will be. */
  function aim(a: Animal, hunt: Hunt) {
    const s = school!.state, speed = Math.hypot(s.velocityX, s.velocityZ) || 1e-6;
    const lead = .6 * Math.min(3, Math.hypot(s.centerX - a.x, s.centerZ - a.z) / (a.m.cruise * GREAT_WHITE_HUNT.chargeSpeed));
    hunt.aimX = s.centerX + s.velocityX * lead + s.velocityX / speed * s.spread * .35;
    hunt.aimZ = s.centerZ + s.velocityZ * lead + s.velocityZ / speed * s.spread * .35;
  }
  /**
   * Whether a charge fits now: the hunter stays in view for all of it (no dive due), the school is
   * within about 90° of its heading and far enough off to build up speed, and the line through it,
   * and 1.5 units beyond, is clear of the island and inside the frame.
   */
  function chargeFits(a: Animal, hunt: Hunt) {
    const H = GREAT_WHITE_HUNT;
    if (presence(a) < .95 || diveOf(a, time + H.chargeDuration).opacity < .9) { hunt.waiting = 'dive'; return false; }
    aim(a, hunt);
    const dx = hunt.aimX - a.x, dz = hunt.aimZ - a.z, d = Math.hypot(dx, dz);
    if (d < .7 || d > H.encounterRadius + 2.5) { hunt.waiting = 'range'; return false; }
    if (Math.abs(wrap(Math.atan2(dx, dz) - a.heading)) > 1.6) { hunt.waiting = 'bearing'; return false; }
    for (let k = 1; k <= 4; k++) {
      const t = (d + 1.5) * k / 4, x = a.x + dx / d * t, z = a.z + a.shift + dz / d * t;
      if (field.island(x, z, a.allowance).distance < a.m.islandClearance * .6 || frame(x, z, ocean.world).edge > 1.02) { hunt.waiting = 'line'; return false; }
    }
    hunt.waiting = '';
    return true;
  }
  /**
   * One step of a hunter's stalking. An encounter begins when it comes within `encounterRadius` of
   * the school after having been away (beyond `releaseRadius`, or deep on a dive), and not during
   * the cooldown after a charge. Whether the encounter becomes a charge is rolled once, then.
   */
  function stalk(a: Animal, hunt: Hunt) {
    const H = GREAT_WHITE_HUNT, s = school!.state, visible = presence(a);
    const distance = Math.hypot(s.centerX - a.x, s.centerZ - a.z);
    hunt.since += STEP;
    if (distance > H.releaseRadius + s.spread || visible < .2) hunt.away = true;
    if (hunt.phase === 'normal') {
      // It must be in sight and staying so for a while (not about to dive): an encounter, not a glimpse.
      if (hunt.away && distance < H.encounterRadius + s.spread && visible > .9 && time >= hunt.rested
        && diveOf(a, time + 10).opacity > .9) {
        hunt.phase = 'encounter'; hunt.since = 0; hunt.away = false; hunt.encounters++;
        hunt.attack = attackRoll(a.lane, seed, hunt.encounters);
      }
    } else if (hunt.phase === 'encounter') {
      if (hunt.away) { hunt.phase = 'normal'; hunt.since = 0; }
      else if (hunt.attack && hunt.since > .6 && chargeFits(a, hunt)) { hunt.phase = 'charge'; hunt.since = 0; hunt.charges++; hunt.committed = false; }
      // The moment passed without a clear line: this encounter stays a pass.
      else if (hunt.attack && hunt.since > 15) hunt.attack = false;
    } else if (hunt.phase === 'charge') {
      // Close to the school it commits to a straight line through it and stops following the fish: a
      // charge, not a chase.
      if (!hunt.committed) {
        aim(a, hunt);
        if (Math.hypot(hunt.aimX - a.x, hunt.aimZ - a.z) < 1.3) { hunt.committed = true; hunt.line = Math.atan2(hunt.aimX - a.x, hunt.aimZ - a.z); }
      }
      const past = hunt.committed && (hunt.aimX - a.x) * Math.sin(hunt.line) + (hunt.aimZ - a.z) * Math.cos(hunt.line) < -.6;
      if (past || hunt.since > H.chargeDuration) { hunt.phase = 'exit'; hunt.since = 0; hunt.rested = time + H.cooldown; }
    } else if (a.speed < a.m.cruise * 1.1 || hunt.since > 10) { hunt.phase = 'normal'; hunt.since = 0; }
  }

  /** Decide every animal's desired direction from one snapshot, so the result never depends on update order. */
  function steer() {
    for (const a of animals) if (a.hunt) stalk(a, a.hunt);
    const snapshot = animals.map((a) => {
      const m = a.m, hx = Math.sin(a.heading), hz = Math.cos(a.heading), x = a.x, z = a.z + a.shift, r2 = x * x + z * z || 1;
      const shore = field.island(x, z, a.allowance);
      // The farthest out it may go here: just inside the frame (a group's leader keeps its whole group inside).
      const edge = frame(x, z, ocean.world).edge, outward = frame(x + shore.nx * .5, z + shore.nz * .5, ocean.world).edge;
      const low = m.islandClearance + .2, spread = m.halfWidth - a.base.halfWidth;
      const high = Math.max(low, (outward > edge + 1e-4 ? shore.distance + (.97 - edge) * .5 / (outward - edge) : shore.distance + 3) - spread);
      return {
        x, z, hx, hz, vx: hx * a.speed, vz: hz * a.speed, a: m.halfLength, b: m.halfWidth, space: m.personalSpace, speed: a.speed,
        // How much of the room-making it leaves to others: bigger and less nimble animals move less.
        heft: m.halfLength * m.halfWidth / m.turnRate,
        shore, low, high, depth: m.depth, presence: presence(a),
        // Where it would like to be offshore right now (with more room to roam as the ocean grows), and its
        // position and angular speed around the island.
        band: clamp(m.islandClearance + m.roam[0] + (m.roam[1] + ocean.roam - m.roam[0]) * roamBand(m, time, a.lane), low, high),
        angle: Math.atan2(z, x), spin: a.speed * (x * hz - z * hx) / r2, radius: Math.sqrt(r2),
      };
    });
    /**
     * Which side of a pair animal i keeps when they pass: +1 the outside (farther offshore), -1 the inside.
     * The one that will be farther out by the time they meet (mostly where each is heading, partly where
     * each is now) takes the outside, and the pair keeps that until the encounter is over.
     */
    const side = (i: number, j: number) => {
      const key = Math.min(i, j) * 64 + Math.max(i, j), [first, second] = i < j ? [i, j] : [j, i];
      let kept = encounters.get(key);
      if (kept === undefined) {
        const ahead = .65 * (snapshot[first].band - snapshot[second].band) + .35 * (snapshot[first].shore.distance - snapshot[second].shore.distance);
        kept = ahead >= 0 ? 1 : -1;
      }
      return i === first ? kept : -kept;
    };
    const ongoing = new Set<number>();
    animals.forEach((a, i) => {
      const m = a.m, self = snapshot[i], { hx, hz, shore: here } = self, px = self.x, pz = self.z;

      // Lanes: when another animal will soon come alongside with too little room between them, the two
      // settle into lanes a body's width apart (measured offshore) well before they meet, the smaller one
      // moving more, and drift back afterward. Passing side by side replaces slowing down behind or
      // swerving at the last moment. Where the water is too narrow for both, they also part in depth.
      // An animal deep on a dive is passed over; if it pays no attention, the other makes all the room.
      let laneSum = 0, laneTotal = 0, laneWeight = 0, lift = 0, follow = 0, followSpeed = m.cruise;
      for (let j = 0; j < snapshot.length; j++) {
        const o = snapshot[j];
        if (j === i || o.presence < .01) continue;
        const space = (self.space + o.space) / 2, lateral = m.halfWidth + o.b + space;
        const now = here.distance - o.shore.distance;
        if (Math.abs(now) >= lateral && Math.abs(self.band - o.band) >= lateral) continue;
        const turn = wrap(o.angle - self.angle), gap = Math.abs(turn) * (self.radius + o.radius) / 2;
        const length = m.halfLength + o.a + space, closing = -Math.sign(turn) * (o.spin - self.spin) * (self.radius + o.radius) / 2;
        const soon = closing > 1e-3 ? smoothstep(LANE_LOOKAHEAD, LANE_LOOKAHEAD * .45, Math.max(0, gap - length) / closing) : 0;
        const weight = Math.max(soon, smoothstep(length + 1.5, length, gap)) * o.presence;
        if (weight <= 0) continue;
        // Keep to their sides (see side()), sharing the move by heft about the heft-weighted middle of where
        // each would like to be, then fit both lanes between the island and the frame if possible.
        const out = side(i, j), key = Math.min(i, j) * 64 + Math.max(i, j);
        if (!encounters.has(key)) encounters.set(key, i < j ? out : -out);
        ongoing.add(key);
        const mine = o.presence * o.heft / (o.presence * o.heft + self.presence * self.heft);
        const middle = self.band * (1 - mine) + o.band * mine;
        const [inner, outer] = out > 0 ? [o, self] : [self, o];
        const innerShare = out > 0 ? 1 - mine : mine, outerShare = 1 - innerShare;
        let innerLane = middle - lateral * innerShare, outerLane = middle + lateral * outerShare;
        // Pinned against the island (or the frame), one leaves the other some slack to take up, but never
        // more than as much again as its own share: a whale shark barely moves aside for a turtle.
        const pinned = Math.max(0, inner.low - innerLane);
        innerLane += pinned;
        outerLane += Math.min(pinned, lateral * outerShare);
        const crowded = Math.max(0, outerLane - outer.high);
        outerLane -= crowded;
        innerLane -= Math.min(crowded, lateral * innerShare, innerLane - inner.low);
        const lane = out > 0 ? outerLane : innerLane;
        laneSum += lane * weight;
        laneTotal += weight;
        laneWeight = Math.max(laneWeight, weight);
        // Too narrow to pass side by side: the one swimming higher rises a little, the other sinks a little.
        const shortfall = lateral - (outerLane - innerLane);
        const squeeze = weight * Math.max(smoothstep(0, .35, shortfall), smoothstep(lateral, lateral * .6, Math.abs(now)) * smoothstep(length + .5, length * .8, gap));
        const higher = self.depth > o.depth || (self.depth === o.depth && a.lane > members[j].lane);
        lift = higher ? Math.max(lift, .16 * squeeze) : Math.min(lift, -.1 * squeeze);
        // Catching up with one it cannot pass here: ease to its pace for a while and pass where the water widens.
        const behind = (o.x - px) * hx + (o.z - pz) * hz > 0 && hx * o.hx + hz * o.hz > .5 && closing > 0;
        const wait = behind ? smoothstep(.1, .45, shortfall) * smoothstep(length + 2.5, length + .6, gap) * o.presence : 0;
        if (wait > follow) { follow = wait; followSpeed = o.speed; }
      }
      a.lift = lift;
      a.follow = follow; a.followSpeed = followSpeed; a.busy = laneWeight;
      let target = self.band;
      if (laneTotal > 0) target += (laneSum / laneTotal - target) * laneWeight;
      const edgeHere = frame(px, pz, ocean.world);

      // Roaming: follow the coastline's shape at that distance offshore.
      const tx = -here.nz * a.direction, tz = here.nx * a.direction;
      // Out to sea briskly, in toward the island gently, so it settles into an inner lane without overshooting.
      const radial = clamp((target - here.distance) * 1.3, -.55, 1);
      let rx = tx + radial * here.nx, rz = tz + radial * here.nz;
      if (m.weave) {
        const w = m.weave * Math.sin(time * TAU / (m.weavePeriod ?? 10) + a.lane * 2.3), c = Math.cos(w), sw = Math.sin(w);
        [rx, rz] = [rx * c + rz * sw, -rx * sw + rz * c];
      }
      // Charging: straight for the aim point instead, still clear of the island, the frame and other animals.
      if (a.hunt?.phase === 'charge') {
        const h = a.hunt, dx = h.aimX - a.x, dz = h.aimZ - a.z, d = Math.hypot(dx, dz) || 1e-6;
        rx = h.committed ? Math.sin(h.line) * 1.6 : dx / d * 1.6; rz = h.committed ? Math.cos(h.line) * 1.6 : dz / d * 1.6;
      } else if (a.hunt?.phase === 'encounter' && a.hunt.attack && school) {
        // It has picked out the school: it swings toward it before the rush.
        const dx = school.state.centerX - a.x, dz = school.state.centerZ - a.z, d = Math.hypot(dx, dz) || 1e-6;
        rx += dx / d * 2; rz += dz / d * 2;
      }

      // Island and islets: if its course would bring it inside its clearance within a few seconds (coast
      // bends ahead included), turn to run along the coast, harder the sooner that would happen. Swimming
      // parallel to the shore, however close, triggers nothing.
      // Slow turners look further ahead and react sooner. Three points along the way, so a small islet is
      // not jumped over, each weighing in by its own urgency so the response never switches abruptly.
      const reach = m.halfLength * .5 + a.speed * (1.5 + .8 / m.turnRate);
      let threat = 0, nx = 0, nz = 0;
      for (const part of [.35, .7, 1]) {
        const sample = field.island(px + hx * reach * part, pz + hz * reach * part, a.allowance);
        const closing = (here.distance - sample.distance) * a.speed / (reach * part);
        if (closing <= 1e-3) continue;
        const urgency = smoothstep(4 + 1 / m.turnRate, 1 + .3 / m.turnRate, (here.distance - m.islandClearance) / closing);
        threat = Math.max(threat, urgency);
        nx += sample.nx * urgency; nz += sample.nz * urgency;
      }
      const normal = Math.hypot(nx, nz) || 1;
      nx /= normal; nz /= normal;
      // Slide along the coast the way it is already heading (straight at the shore, just push away).
      const slide = clamp((nx * hz - nz * hx) * 4, -1, 1);
      let ix = (nx * 1.2 - nz * slide) * threat * 2;
      let iz = (nz * 1.2 + nx * slide) * threat * 2;
      if (here.distance < m.islandClearance + .05) {
        const push = (m.islandClearance + .05 - here.distance) * 8;
        ix += here.nx * push; iz += here.nz * push;
      }
      // Frame: before reaching the edge of the view, turn to run along it (and back in if already past it).
      const edgeAhead = frame(px + hx * reach, pz + hz * reach, ocean.world);
      const along = smoothstep(.97, 1.04, edgeAhead.edge) * 1.6, back = smoothstep(.99, 1.03, edgeHere.edge) * 1.5 + Math.max(0, edgeHere.edge - 1) * 10;
      const skirt = Math.sign(edgeAhead.nx * hz - edgeAhead.nz * hx) || 1;
      const bx = edgeAhead.nx * (along * .8 + back) - edgeAhead.nz * skirt * along, bz = edgeAhead.nz * (along * .8 + back) + edgeAhead.nx * skirt * along;

      // Close calls the lanes do not settle (an animal cutting across, a reversal): find when footprints would
      // touch on the current courses and, if that is soon, step sideways. Each yields by the other's share of heft.
      let ax = 0, az = 0, brake = 0;
      for (let j = 0; j < snapshot.length; j++) {
        const o = snapshot[j];
        if (j === i || o.presence < .01) continue;
        const qx = o.x - px, qz = o.z - pz, distance = Math.hypot(qx, qz) || 1e-6;
        const vx = o.vx - self.vx, vz = o.vz - self.vz, vv = vx * vx + vz * vz;
        if (distance > m.halfLength + o.a + m.personalSpace + Math.sqrt(vv) * LOOKAHEAD) continue;
        const closestAt = vv > 1e-8 ? clamp(-(qx * vx + qz * vz) / vv, 0, LOOKAHEAD) : 0;
        const cx = qx + vx * closestAt, cz = qz + vz * closestAt, closest = Math.hypot(cx, cz);
        const ux = closest > 1e-3 ? cx / closest : qx / distance, uz = closest > 1e-3 ? cz / closest : qz / distance;
        const room = reachToward(m.halfLength, m.halfWidth, hx, hz, ux, uz) + reachToward(o.a, o.b, o.hx, o.hz, ux, uz) + m.personalSpace;
        // How close the pass will be and how soon, as one smooth measure.
        const urgency = smoothstep(room * 1.25, room * .75, closest) * (1 - closestAt / LOOKAHEAD) ** 2;
        if (urgency <= 0) continue;
        const share = o.presence * o.heft / (o.presence * o.heft + self.presence * self.heft);
        // It watches what is ahead of it; something catching up from behind matters less.
        const front = (qx * hx + qz * hz) / distance;
        const attention = .35 + .65 * smoothstep(-.6, .2, front);
        // Sideways relative to its own heading, toward the side of the pair it keeps (out to sea or in toward
        // the island, as the lanes above), leaning away from where the other will be.
        const out = side(i, j);
        let sx = here.nx * out - ux * .35, sz = here.nz * out - uz * .35;
        const forward = sx * hx + sz * hz;
        sx -= forward * hx; sz -= forward * hz;
        const norm = Math.hypot(sx, sz) || 1;
        const push = urgency * share * attention * 1.6;
        ax += sx / norm * push; az += sz / norm * push;
        if (distance < room) {
          // Already too close: ease apart directly (never backward).
          const closeness = 1 - distance / room;
          let ex = -qx / distance, ez = -qz / distance;
          const back = ex * hx + ez * hz;
          if (back < 0) { ex -= back * hx; ez -= back * hz; }
          ax += ex * closeness * share * 2; az += ez * closeness * share * 2;
        }
        if (front > .3) brake = Math.max(brake, urgency * share * attention);
      }
      ax *= m.avoidance; az *= m.avoidance;
      const avoidLength = Math.hypot(ax, az);
      if (avoidLength > 1.8) { ax *= 1.8 / avoidLength; az *= 1.8 / avoidLength; }
      a.brake = clamp(brake * m.avoidance, 0, 1);

      const wx = rx + ix + ax + bx, wz = rz + iz + az + bz;
      // How far to turn. A half turn (a reversal, or anything close to one) keeps to the side with more
      // room while the new course is still nearly behind, so an animal never hesitates between left and
      // right; once the course swings well round to the other side, it takes the short way after all.
      let change = wx * wx + wz * wz > 1e-8 ? wrap(Math.atan2(wx, wz) - a.heading) : 0;
      // Lining up for a leap: the heading it was judged along (the leap checks its room again before it commits).
      if (a.leap?.stage === 'build') change = wrap(a.leap.heading - a.heading);
      if (!a.halfTurn && Math.abs(change) > 2.6) a.halfTurn = halfTurnSide(a);
      // Midway, if its turning circle now runs into the island or the frame and the other side is clear, switch.
      if (a.halfTurn && turnRoom(a, a.halfTurn) < -.3 && turnRoom(a, -a.halfTurn) > turnRoom(a, a.halfTurn) + .5) a.halfTurn = -a.halfTurn;
      if (a.halfTurn && Math.sign(change) !== a.halfTurn) {
        if (Math.abs(change) > 2) change += a.halfTurn * TAU;
        else a.halfTurn = 0;
      }
      if (Math.abs(change) < 1.2) a.halfTurn = 0;
      // Blend toward the new desire rather than jumping to it, so competing influences never flicker.
      a.want += (change - a.want) * ease(2, STEP);
      a.steering.roam = [rx, rz]; a.steering.island = [ix, iz]; a.steering.animals = [ax, az]; a.steering.frame = [bx, bz];
      a.steering.band = self.band; a.steering.lane = target;
    });
    for (const key of encounters.keys()) if (!ongoing.has(key)) encounters.delete(key);
  }

  /** Move every species' animal one fixed step toward its desired direction. */
  function advance() {
    time += STEP;
    for (const a of animals) {
      const m = a.m, phase = a.lane * 1.71, hunt = a.hunt?.phase;
      considerLeap(a);
      if (a.leap) progressLeap(a);
      remember(a);
      // Turn toward the desired heading: rate-limited and damped, so turns build and settle without overshoot.
      // A charge turns a little more sharply, never like a missile. A leap holds its heading.
      const agility = hunt === 'charge' ? GREAT_WHITE_HUNT.chargeTurn : a.leap?.stage === 'build' ? LINE_UP : 1;
      const turnRate = m.turnRate * agility, turnEase = m.turnEase * agility;
      const lock = leapLock(a), wanted = clamp(a.want * turnEase, -turnRate, turnRate) * (1 - lock);
      a.turn += (wanted - a.turn) * ease(turnEase * 3.2 + 10 * lock, STEP);
      a.heading = wrap(a.heading + a.turn * STEP);
      a.want -= a.turn * STEP;
      // Cruise with slow changes of pace and, for some, rare surges; ease off in tight turns and when making room.
      const surge = m.surge * Math.max(0, Math.sin(time * TAU / 23 + phase)) ** 8;
      const cruise = m.cruise * (1 + m.swing * Math.sin(time * TAU / m.swingPeriod + phase) + .08 * Math.sin(time * .071 + phase)) * (1 + surge);
      // A big course change ahead slows it, which tightens the turn (as animals do).
      const paced = cruise + (Math.min(cruise, Math.max(cruise * .5, a.followSpeed)) - cruise) * a.follow;
      const turning = Math.max(.15 * Math.abs(a.turn) / m.turnRate, .3 * smoothstep(.4, 1.6, Math.abs(a.want)));
      let target = paced * (1 - .3 * a.brake) * (1 - turning), response = 1.2;
      // A charge lines up on the school first, then accelerates hard; afterwards it slows back to its cruise gradually.
      if (hunt === 'charge') { target = m.cruise * (1 + (GREAT_WHITE_HUNT.chargeSpeed - 1) * smoothstep(.7, .25, Math.abs(a.want))); response = 1.6; }
      else if (hunt === 'exit') response = .45;
      const leaping = leapSpeed(a);
      a.speed = leaping ?? a.speed + (target - a.speed) * ease(response, STEP);
      a.x += Math.sin(a.heading) * a.speed * STEP;
      a.z += Math.cos(a.heading) * a.speed * STEP;
      // Gentle vertical drift around the species' preferred depth; an air-breather rises from there to
      // just below the surface for a breath, or now and then leaps (heights here are above the swimming
      // level, see ocean-depth.ts).
      settleHeight(a, rise(a, -.02 + m.depth + m.bob * Math.sin(time * TAU / m.bobPeriod + a.lane * 1.7) + a.lift));
      roll(a);
      if (time >= a.nextReverse) reverse(a);
    }
  }

  /**
   * One step of a follower. It keeps a loose place beside and behind its leader (wandering a little,
   * now and then trading places with another member, the one dropping back passing beneath), and
   * steers for a point just ahead of that place, so on its place it swims alongside. It keeps its own
   * clearance from the island, islets and frame, and room from its group and other animals at its
   * depth; the leader steers for the group as a whole. A place against the island moves out to the
   * follower's clearance, and the group then swings its places to the open side.
   */
  function follow(a: Animal) {
    const head = a.group.members[0], style = a.group.style!, m = a.m, place = a.place!;
    considerLeap(a);
    if (a.leap) progressLeap(a);
    remember(a);
    place.since += STEP;
    const k = smoothstep(0, style.swapTime, place.since);
    const across = place.from[0] + (place.to[0] - place.from[0]) * k + style.wander * Math.sin(time * TAU / style.wanderPeriod + a.lane * 1.9);
    const behind = place.from[1] + (place.to[1] - place.from[1]) * k + style.wander * .7 * Math.sin(time * TAU / (style.wanderPeriod * 1.37) + a.lane * 2.7);
    const lx = Math.sin(head.heading), lz = Math.cos(head.heading);
    let px = head.x + lz * across - lx * behind, pz = head.z - lx * across - lz * behind;
    const spot = field.island(px, pz + a.shift, a.allowance);
    if (spot.distance < m.islandClearance + .1) {
      if (spot.distance < m.islandClearance - .15) a.group.blocked = true;
      px += spot.nx * (m.islandClearance + .1 - spot.distance); pz += spot.nz * (m.islandClearance + .1 - spot.distance);
    }
    const inView = frame(px, pz + a.shift, ocean.world);
    if (inView.edge > .94) { px += inView.nx * (inView.edge - .94) * ocean.world.z; pz += inView.nz * (inView.edge - .94) * ocean.world.z; }
    a.slotX = px; a.slotZ = pz;
    // Swim the leader's course, turning in toward the place's side the farther off it is (so the group
    // turns together), and catch up with it or drop back to it by pace. Lining up for a leap, its own heading.
    const side = (px - a.x) * lz - (pz - a.z) * lx, forward = (px - a.x) * lx + (pz - a.z) * lz;
    const course = a.leap?.stage === 'build' ? a.leap.heading : head.heading + (head.leap ? 0 : clamp(Math.atan2(side, 1.2), -.8, .8));
    // Fallen well away from its place (squeezed out by another animal, or after a leap), it heads straight back.
    const strayed = a.leap ? 0 : smoothstep(1.5, 3, Math.hypot(px - a.x, pz - a.z)), homing = Math.atan2(px - a.x, pz - a.z);
    let rx = Math.sin(course) * (1 - strayed) + Math.sin(homing) * strayed, rz = Math.cos(course) * (1 - strayed) + Math.cos(homing) * strayed;
    const toward = Math.hypot(rx, rz) || 1;
    rx /= toward; rz /= toward;
    // Room from the others at its depth (one passing beneath or above is left be), its own group
    // closest: it sidesteps (never turning back for it) and eases off behind one just ahead. Crowding
    // a member ahead of it in the group (its leader, or a follower before it), or a bigger animal, it
    // slips beneath.
    const hx = Math.sin(a.heading), hz = Math.cos(a.heading);
    let ax = 0, az = 0, wait = 0, under = 0;
    for (const o of everyone) {
      // Only animals whose footprints could come within the room it keeps (0.6 at most) are measured.
      const qx = o.x - a.x, qz = o.z - a.z, near = m.halfLength + o.base.halfLength + .6;
      if (o === a || qx * qx + qz * qz > near * near) continue;
      const gap = footprintGap(a.base, a.heading, o.base, o.heading, qx, qz);
      if (o.group === a.group ? o.index < a.index : o.base.halfLength >= a.base.halfLength) under = Math.max(under, smoothstep(.2, -.1, gap));
      if (Math.abs(o.worldY - a.worldY) > .22) continue;
      // Its own group swims close, flank to flank: only nearly touching counts.
      const push = o.group === a.group ? smoothstep(.12, -.06, gap) : smoothstep(m.personalSpace + .3, m.personalSpace - .05, gap);
      if (push <= 0) continue;
      const sideways = qx * hz - qz * hx > 0 ? -1 : 1;
      ax += hz * sideways * push; az -= hx * sideways * push;
      if (qx * hx + qz * hz > 0) wait = Math.max(wait, push);
    }
    // Room bends its path, never turns it away from its group: slipping beneath and easing off do the rest.
    const pushed = Math.hypot(ax, az);
    if (pushed > .75) { ax *= .75 / pushed; az *= .75 / pushed; }
    // Island and islets, looking a little ahead, and the frame.
    const here = field.island(a.x, a.z + a.shift, a.allowance), look = m.halfLength * .5 + a.speed * 1.5;
    const ahead = field.island(a.x + hx * look, a.z + a.shift + hz * look, a.allowance);
    let ix = 0, iz = 0;
    if (ahead.distance < m.islandClearance + .2) { const push = (m.islandClearance + .2 - ahead.distance) * 3; ix += ahead.nx * push; iz += ahead.nz * push; }
    if (here.distance < m.islandClearance + .05) { const push = (m.islandClearance + .05 - here.distance) * 8; ix += here.nx * push; iz += here.nz * push; }
    // The frame: before reaching it, turn back in toward the group (not along the edge, as a leader does), and back in if past it.
    const reach = m.halfLength * .5 + a.speed * (1.5 + .8 / m.turnRate);
    const edgeHere = frame(a.x, a.z + a.shift, ocean.world), edgeAhead = frame(a.x + hx * reach, a.z + a.shift + hz * reach, ocean.world);
    const inward = smoothstep(.93, 1.02, edgeAhead.edge) * 2 + smoothstep(.97, 1.02, edgeHere.edge) * 2 + Math.max(0, edgeHere.edge - 1) * 10;
    const bx = edgeAhead.nx * inward, bz = edgeAhead.nz * inward;
    const wx = rx + ax + ix + bx, wz = rz + az + iz + bz;
    a.want += ((wx * wx + wz * wz > 1e-8 ? wrap(Math.atan2(wx, wz) - a.heading) : 0) - a.want) * ease(3, STEP);
    // It turns as its leader turns, plus what it takes to hold its course, a little nimbler than the species
    // usually is; a leap holds its heading.
    const nimble = a.leap?.stage === 'build' ? LINE_UP : 1.3, lock = leapLock(a), turnRate = m.turnRate * nimble, turnEase = m.turnEase * nimble;
    const withLeader = a.leap ? 0 : head.turn;
    a.turn += (clamp(a.want * turnEase + withLeader, -turnRate, turnRate) * (1 - lock) - a.turn) * ease(turnEase * 3.2 + 10 * lock, STEP);
    a.heading = wrap(a.heading + a.turn * STEP);
    a.want -= a.turn * STEP;
    // The leader's pace, faster while its place is ahead of it and slower while it is behind. While the
    // leader leaps, the others keep their own cruising pace and let it go (and catch up after).
    const flying = !!head.leap && head.leap.stage !== 'settle';
    // A big course change ahead slows it, which tightens the turn (as for the leaders), and so does the frame ahead.
    const turning = Math.max(.3 * smoothstep(.4, 1.6, Math.abs(a.want)), .4 * smoothstep(.95, 1.05, edgeAhead.edge));
    const target = (flying ? m.cruise : Math.min(m.cruise * 2.2, head.speed * clamp(1 + forward, .5, 1.9))) * (1 - .4 * wait) * (1 - turning);
    const leaping = leapSpeed(a);
    a.speed = leaping ?? a.speed + (target - a.speed) * ease(1.6, STEP);
    a.x += Math.sin(a.heading) * a.speed * STEP;
    a.z += Math.cos(a.heading) * a.speed * STEP;
    // Its own depth, a little apart from the others', and deeper while passing beneath one.
    const dip = Math.max(place.dip * Math.sin(Math.PI * k), style.dip * under);
    const depth = -.02 + m.depth + style.depthSpread * (a.index % 2 ? -1 : 1) + m.bob * Math.sin(time * TAU / m.bobPeriod + a.lane * 1.7) - dip;
    settleHeight(a, rise(a, depth));
    roll(a);
    a.steering.roam = [rx, rz]; a.steering.island = [ix, iz]; a.steering.animals = [ax, az]; a.steering.frame = [bx, bz];
  }

  /**
   * Now and then two members of a group trade places (a pair's follower crosses to the leader's other
   * side), the one dropping back passing beneath; and when a follower's place runs up against the
   * island, the whole group swings its places to the open side. Never while one is leaping or mid-trade.
   */
  function trade(g: Group) {
    const style = g.style;
    if (!style) return;
    const n = g.members.length - 1;
    let idle = true;
    for (let i = 1; i <= n; i++) if (g.members[i].leap || g.members[i].place!.since < style.swapTime) idle = false;
    const begin = (f: Animal, to: readonly [number, number], dip: number) => {
      const p = f.place!;
      p.from = p.to; p.to = to; p.since = 0; p.dip = dip;
    };
    if (g.blocked && idle && time - g.traded > 6) mirror(g);
    g.blocked = false;
    if (time < g.nextSwap) return;
    g.swaps++;
    const lane = g.members[0].lane;
    g.nextSwap = time + style.swapEvery * (.6 + .8 * variation(lane * 2.9 + 1, g.swaps));
    if (!idle || time - g.traded < style.swapTime + 2) return;
    if (n === 1) {
      const f = g.members[1];
      begin(f, [-f.place!.to[0], f.place!.to[1]], style.dip);
    } else {
      const i = 1 + Math.floor(variation(lane * 4.3, g.swaps) * n) % n;
      const j = 1 + (i + Math.floor(variation(lane * 6.1, g.swaps) * (n - 1))) % n;
      const a = g.members[i], b = g.members[j], pa = a.place!.to, pb = b.place!.to;
      begin(a, pb, pb[1] > pa[1] ? style.dip : 0);
      begin(b, pa, pa[1] > pb[1] ? style.dip : 0);
    }
    g.traded = time;
  }

  /** Swing a group's places to the leader's other side, those crossing close behind it passing beneath. */
  function mirror(g: Group) {
    const style = g.style!, n = g.members.length - 1;
    for (let i = 1; i <= n; i++) {
      const p = g.members[i].place!;
      p.from = p.to; p.to = [-p.to[0], p.to[1]]; p.since = 0; p.dip = style.dip * (n > 1 ? (i === 1 ? .7 : 1.4) : 1);
    }
    g.traded = time;
  }

  /**
   * Reverse the circling direction with a U-turn, but only where one fits and never in the middle of
   * passing another animal (or leaping); otherwise try again a little later.
   */
  function reverse(a: Animal) {
    const m = a.m, left = turnRoom(a, 1), right = turnRoom(a, -1);
    const crowded = a.busy > .05 || (a.hunt && a.hunt.phase !== 'normal') || a.group.members.some((o) => o.leap)
      || animals.some((o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 3.5 && presence(o) > .01);
    if (crowded || Math.max(left, right) < .1) { a.nextReverse = time + 4; return; }
    a.direction *= -1;
    a.halfTurn = left >= right ? 1 : -1;
    a.reversals++;
    // Its group turns with it; their places swing to its other side, where the U-turn leaves them.
    if (a.group.style) mirror(a.group);
    a.nextReverse = time + m.reverseEvery * (.6 + .8 * variation(a.lane, a.reversals + 1));
  }

  /** Ease the ocean area and roaming room toward the level's (see setLevel). */
  function grow() {
    const k = ease(OCEAN_GROWTH.ease, STEP), w = ocean.world;
    w.x += (goal.world.x - w.x) * k; w.z += (goal.world.z - w.z) * k;
    ocean.roam += (goal.roam - ocean.roam) * k;
  }

  /** Poses between the last two simulation steps, so motion stays smooth at any frame rate. */
  function publish() {
    const t = accumulator / STEP;
    for (const a of everyone) {
      const p = a.previous, pose = a.pose;
      pose.x = p.x + (a.x - p.x) * t;
      pose.z = p.z + (a.z - p.z) * t;
      pose.y = p.y + (a.y - p.y) * t;
      pose.heading = p.heading + wrap(a.heading - p.heading) * t;
      pose.bank = p.bank + (a.bank - p.bank) * t;
      pose.pitch = p.pitch + (a.pitch - p.pitch) * t;
      pose.turn = a.turn;
      pose.speed = a.speed;
      pose.climb = a.climb;
      pose.air = a.air;
      pose.pace = a.speed / a.base.cruise;
      pose.effort = .65 + .35 * pose.pace;
    }
    // The school's last step is up to one simulation step older than the animals'.
    school?.publish((schoolTick * STEP + accumulator) / SCHOOL_STEP);
  }

  /** Show the school the animals as they are now: where, how fast, whether in sight, whether charging. */
  function refreshNeighbors() {
    for (let i = 0; i < everyone.length; i++) {
      const a = everyone[i], o = neighbors[i], dive = diveOf(a, time);
      o.x = a.x; o.z = a.z; o.y = a.y + dive.y; o.heading = a.heading; o.speed = a.speed; o.presence = dive.opacity;
      // The fish read a charge from the rush itself: lined up and accelerating, not while it turns in.
      o.charging = !!a.hunt && (a.hunt.phase === 'charge' || a.hunt.phase === 'exit') && a.speed > a.m.cruise * 1.3;
    }
  }

  return {
    /** Every animal to draw: each species' own, then its group's followers. */
    swimmers,
    get(lane: number): MarinePose | undefined { return byLane.get(lane)?.pose; },
    /** An animal's dive at the scene clock (or at `at`): followers dive with their group, a little behind their leader. */
    dive(lane: number, at = time + accumulator) {
      const a = byLane.get(lane);
      return a ? diveOf(a, at) : sampleDive(at, lane, population);
    },
    /**
     * Steering state for tuning overlays: the species' movement, its apparent position (and the shift
     * toward the viewer it was judged with), desired heading, target distance offshore and each
     * influence; its group (leader's lane, its place in it and where that place is now) and any leap.
     */
    inspect(lane: number) {
      const a = byLane.get(lane);
      if (!a) return undefined;
      const L = a.leap;
      return {
        m: a.m, x: a.x, z: a.z + a.shift, shift: a.shift, allowance: a.allowance, heading: a.heading, want: a.heading + a.want, halfTurn: a.halfTurn, brake: a.brake, ...a.steering,
        leader: a.group.members[0].lane, index: a.index, slot: [a.slotX, a.slotZ + a.shift] as [number, number],
        leap: L && { stage: L.stage, since: L.since, locked: L.locked, exit: [L.exitX, L.exitZ] as [number, number], land: [L.landX, L.landZ] as [number, number] },
      };
    },
    /** A hunter's stalking of the school (null for other species, or without a school). */
    hunt(lane: number): Readonly<Hunt> | null { return byLane.get(lane)?.hunt ?? null; },
    /** The tuna school, when there is one: stepped with the animals, its poses published with theirs. */
    school,
    /** The island's shape at the current level, which decides where animals may swim. */
    get field() { return field; },
    /** The level the ocean is growing (or shrinking) toward. */
    get level() { return current; },
    /** The ocean area animals keep to right now, easing to a new level's (half-sizes in units), and extra roaming room. */
    ocean,
    /** Recent splashes where a leap broke the surface (times on the scene clock). */
    splashes,
    /** Seconds simulated so far: the school's clock, which the dive cycle follows too. */
    clock() { return time + accumulator; },
    /**
     * Move to another level without starting over: the island's new shape applies at once (it grows a
     * little, so animals ease out of the way), while the ocean area and roaming room widen gradually.
     */
    setLevel(next: number) {
      if (next === current) return;
      current = next;
      field = createShoreField(next);
      school?.setField(field);
      goal = { world: worldFor(next), roam: roamFor(next) };
    },
    step(delta: number, active: boolean) {
      if (!active) return;
      // A long background frame never teleports the school: at most 0.05 s is simulated per frame.
      accumulator += Math.max(0, Math.min(delta, .05));
      while (accumulator >= STEP) {
        accumulator -= STEP;
        grow();
        steer();
        advance();
        for (const f of followers) follow(f);
        for (const g of groups) trade(g);
        if (school && (schoolTick ^= 1) === 0) { refreshNeighbors(); school.step(SCHOOL_STEP, neighbors); }
      }
      publish();
    },
  };
}
export type MarineMotion = ReturnType<typeof createMarineMotion>;
