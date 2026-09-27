import { createShoreField } from './island-outline';
import { sampleDive } from './ocean-depth';
import { apparentShift, clamp, ease, frame, smoothstep, TAU, variation, wrap } from './steering';
import type { MarineModel } from './swimming';
import { attackRoll, createTunaSchool, GREAT_WHITE_HUNT, SCHOOL_REACTIONS, TUNA_SCHOOL, type SchoolNeighbor } from './tuna-school';

export { WORLD } from './steering';

export type MarineMember = { model: MarineModel; lane: number };
/**
 * `effort` drives artist swim clips (never below .65); `pace` is speed relative to the
 * species' cruise and drives procedural rigs. `turn` is the heading change in rad/s
 * (positive toward the animal's left), `speed` in world units/s, `climb` -1..1.
 */
export type MarinePose = { x: number; y: number; z: number; heading: number; bank: number; effort: number; pace: number; turn: number; speed: number; climb: number };

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

/** How far a footprint (half-length a along heading h, half-width b across it) reaches toward the unit direction u. */
const reachToward = (a: number, b: number, hx: number, hz: number, ux: number, uz: number) =>
  Math.hypot(a * (ux * hx + uz * hz), b * (ux * hz - uz * hx));

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

type Animal = MarineMember & {
  m: Movement;
  x: number; z: number; y: number; heading: number; speed: number; turn: number; bank: number; climb: number;
  /** Apparent offset toward the viewer (see apparentShift), and how much closer than its island clearance it may pass islets. */
  shift: number; allowance: number;
  /** +1 or -1: which way it circles the island. A half turn keeps to one side (+1 or -1, as `turn`) until it is done. */
  direction: number; halfTurn: number; nextReverse: number; reversals: number;
  /** Smoothed desired change of heading (rad), relative to the current heading. */
  want: number;
  /** Slowing (0..1) and rise (units) while making room for another animal; the pace of one it waits behind; how involved it is with others (0..1). */
  brake: number; lift: number; follow: number; followSpeed: number; busy: number;
  previous: { x: number; z: number; y: number; heading: number; bank: number };
  pose: MarinePose;
  steering: { roam: [number, number]; island: [number, number]; animals: [number, number]; frame: [number, number]; band: number; lane: number };
  /** Only for species that hunt the tuna school, when there is one. */
  hunt: Hunt | null;
};

/**
 * A small shared simulation (see docs/marine-navigation.md). Each animal blends a few steering
 * influences into one desired direction: roaming along the coast at its own distance offshore,
 * passing other animals in lanes (smaller, nimbler ones making most of the room), keeping its
 * species' clearance from the island and islets, and staying in frame. The result is smoothed,
 * and turning is rate-limited and damped per species, so course changes read as intentional.
 */
export function createMarineMotion(members: readonly MarineMember[], level = 1, options: {
  /** Add the tuna school: true for TUNA_SCHOOL.size fish (0 leaves it out), or a number of fish. */
  school?: boolean | number;
  /** Varies the school's start and the hunter's rolls (0..1); the same seed replays the same scene. */
  seed?: number;
} = {}) {
  const field = createShoreField(level);
  const seed = options.seed ?? 0;
  const size = typeof options.school === 'number' ? options.school : options.school ? TUNA_SCHOOL.size : 0;
  const school = size > 0 ? createTunaSchool(field, { seed, size }) : null;
  let time = 0, accumulator = 0, schoolTick = 0;
  const animals: Animal[] = members.map((member, index) => {
    const m = MOVEMENT[member.model];
    const shift = apparentShift(m.depth);
    const direction = variation(member.lane, 0) < .68 ? 1 : -1;
    // Start spread around the island in the middle of the species' roaming band, heading along the coast.
    const angle = index * TAU / Math.max(1, members.length) + .3;
    const target = m.islandClearance + (m.roam[0] + m.roam[1]) / 2;
    let radius = 1.5;
    const allowance = Math.max(0, m.islandClearance - m.halfWidth - ISLET_MARGIN);
    while (frame(radius * Math.cos(angle), radius * Math.sin(angle)).edge < .9
      && field.island(radius * Math.cos(angle), radius * Math.sin(angle), allowance).distance < target) radius += .05;
    const x = radius * Math.cos(angle), apparentZ = radius * Math.sin(angle), z = apparentZ - shift;
    const shore = field.island(x, apparentZ, allowance);
    const heading = Math.atan2(-shore.nz * direction, shore.nx * direction);
    const y = -.02 + m.depth + Math.sin(member.lane * 1.7) * m.bob;
    return {
      ...member, m, x, z, y, heading, speed: m.cruise, turn: 0, bank: m.tilt, climb: 0, shift, allowance,
      direction, halfTurn: 0, nextReverse: m.reverseEvery ? m.reverseEvery * (.5 + variation(member.lane, 1)) : Infinity, reversals: 0,
      want: 0, brake: 0, lift: 0, follow: 0, followSpeed: m.cruise, busy: 0,
      previous: { x, z, y, heading, bank: m.tilt },
      pose: { x, y, z, heading, bank: m.tilt, effort: 1, pace: 1, turn: 0, speed: m.cruise, climb: 0 },
      steering: { roam: [0, 0], island: [0, 0], animals: [0, 0], frame: [0, 0], band: target, lane: target },
      hunt: school && SCHOOL_REACTIONS[member.model].hunts
        ? { phase: 'normal' as HuntPhase, since: 0, encounters: 0, attack: false, charges: 0, away: true, rested: 0, aimX: 0, aimZ: 0, committed: false, line: 0, waiting: '' }
        : null,
    };
  });
  /** What the school sees of the animals, refreshed in place every step. */
  const neighbors: SchoolNeighbor[] = animals.map((a) => ({
    model: a.model, x: a.x, y: a.y, z: a.z, heading: a.heading, speed: a.speed, halfLength: a.m.halfLength, halfWidth: a.m.halfWidth, presence: 1, charging: false,
  }));
  const byLane = new Map(animals.map((animal) => [animal.lane, animal]));
  /** For each pair in an encounter, which side the first of the two keeps (+1 outside), decided once for the whole encounter. */
  const encounters = new Map<number, number>();
  /**
   * How much an animal counts for the others: 1 near the surface, fading to 0 while it is deep
   * below them on a dive, and back to 1 a few seconds before it returns.
   */
  const presence = (lane: number) => Math.max(sampleDive(time, lane, members.length).opacity, sampleDive(time + SURFACING_LEAD, lane, members.length).opacity);

  /**
   * How much room a half turn toward `side` (+1 or -1, as `turn`) has: the least clearance, from the
   * island and from the frame, at the far side of its turning circle and halfway round.
   */
  function turnRoom(a: Animal, side: number) {
    const hx = Math.sin(a.heading), hz = Math.cos(a.heading), r = .9 * a.speed / a.m.turnRate;
    let room = Infinity;
    for (const [along, across] of [[r, r], [0, 2 * r]]) {
      const x = a.x + hx * along + side * hz * across, z = a.z + a.shift + hz * along - side * hx * across;
      room = Math.min(room, field.island(x, z, a.allowance).distance - a.m.islandClearance, (1 - frame(x, z).edge) * 4);
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
    if (presence(a.lane) < .95 || sampleDive(time + H.chargeDuration, a.lane, members.length).opacity < .9) { hunt.waiting = 'dive'; return false; }
    aim(a, hunt);
    const dx = hunt.aimX - a.x, dz = hunt.aimZ - a.z, d = Math.hypot(dx, dz);
    if (d < .7 || d > H.encounterRadius + 2.5) { hunt.waiting = 'range'; return false; }
    if (Math.abs(wrap(Math.atan2(dx, dz) - a.heading)) > 1.6) { hunt.waiting = 'bearing'; return false; }
    for (let k = 1; k <= 4; k++) {
      const t = (d + 1.5) * k / 4, x = a.x + dx / d * t, z = a.z + a.shift + dz / d * t;
      if (field.island(x, z, a.allowance).distance < a.m.islandClearance * .6 || frame(x, z).edge > 1.02) { hunt.waiting = 'line'; return false; }
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
    const H = GREAT_WHITE_HUNT, s = school!.state, visible = presence(a.lane);
    const distance = Math.hypot(s.centerX - a.x, s.centerZ - a.z);
    hunt.since += STEP;
    if (distance > H.releaseRadius + s.spread || visible < .2) hunt.away = true;
    if (hunt.phase === 'normal') {
      // It must be in sight and staying so for a while (not about to dive): an encounter, not a glimpse.
      if (hunt.away && distance < H.encounterRadius + s.spread && visible > .9 && time >= hunt.rested
        && sampleDive(time + 10, a.lane, members.length).opacity > .9) {
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
      // The farthest out it may go here: just inside the frame.
      const edge = frame(x, z).edge, outward = frame(x + shore.nx * .5, z + shore.nz * .5).edge;
      const low = m.islandClearance + .2;
      const high = Math.max(low, outward > edge + 1e-4 ? shore.distance + (.97 - edge) * .5 / (outward - edge) : shore.distance + 3);
      return {
        x, z, hx, hz, vx: hx * a.speed, vz: hz * a.speed, a: m.halfLength, b: m.halfWidth, space: m.personalSpace, speed: a.speed,
        // How much of the room-making it leaves to others: bigger and less nimble animals move less.
        heft: m.halfLength * m.halfWidth / m.turnRate,
        shore, low, high, depth: m.depth, presence: presence(a.lane),
        // Where it would like to be offshore right now, and its position and angular speed around the island.
        band: clamp(m.islandClearance + m.roam[0] + (m.roam[1] - m.roam[0]) * roamBand(m, time, a.lane), low, high),
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
      const edgeHere = frame(px, pz);

      // Roaming: follow the coastline's shape at that distance offshore.
      const tx = -here.nz * a.direction, tz = here.nx * a.direction;
      // Out to sea briskly, in toward the island gently, so it settles into an inner lane without overshooting.
      const radial = clamp((target - here.distance) * 1.3, -.55, 1);
      let rx = tx + radial * here.nx, rz = tz + radial * here.nz;
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
      const edgeAhead = frame(px + hx * reach, pz + hz * reach);
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

  /** Move every animal one fixed step toward its desired direction. */
  function advance() {
    time += STEP;
    for (const a of animals) {
      const m = a.m, phase = a.lane * 1.71, hunt = a.hunt?.phase;
      a.previous = { x: a.x, z: a.z, y: a.y, heading: a.heading, bank: a.bank };
      // Turn toward the desired heading: rate-limited and damped, so turns build and settle without overshoot.
      // A charge turns a little more sharply, never like a missile.
      const agility = hunt === 'charge' ? GREAT_WHITE_HUNT.chargeTurn : 1, turnRate = m.turnRate * agility, turnEase = m.turnEase * agility;
      const wanted = clamp(a.want * turnEase, -turnRate, turnRate);
      a.turn += (wanted - a.turn) * ease(turnEase * 3.2, STEP);
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
      a.speed += (target - a.speed) * ease(response, STEP);
      a.x += Math.sin(a.heading) * a.speed * STEP;
      a.z += Math.cos(a.heading) * a.speed * STEP;
      // Gentle vertical drift around the species' preferred depth.
      const targetY = -.02 + m.depth + m.bob * Math.sin(time * TAU / m.bobPeriod + a.lane * 1.7) + a.lift;
      const y = a.y + (targetY - a.y) * ease(.9, STEP);
      a.climb = clamp((y - a.y) / STEP / (m.bob * TAU / m.bobPeriod + .02), -1, 1);
      a.y = y;
      // Roll into turns (a slow lazy roll for some species), settling around any resting tilt.
      const lazy = m.lazyRoll * Math.sin(time * TAU / 27 + a.lane * 2.1) ** 5;
      const bank = clamp(-a.turn * m.bank + lazy, -m.bankMax, m.bankMax) + m.tilt * (1 + .12 * Math.sin(time * TAU / 31 + a.lane));
      a.bank += (bank - a.bank) * ease(m.bankEase, STEP);
      if (time >= a.nextReverse) reverse(a);
    }
  }

  /**
   * Reverse the circling direction with a U-turn, but only where one fits and never in the middle of
   * passing another animal; otherwise try again a little later.
   */
  function reverse(a: Animal) {
    const m = a.m, left = turnRoom(a, 1), right = turnRoom(a, -1);
    const crowded = a.busy > .05 || (a.hunt && a.hunt.phase !== 'normal')
      || animals.some((o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 3.5 && presence(o.lane) > .01);
    if (crowded || Math.max(left, right) < .1) { a.nextReverse = time + 4; return; }
    a.direction *= -1;
    a.halfTurn = left >= right ? 1 : -1;
    a.reversals++;
    a.nextReverse = time + m.reverseEvery * (.6 + .8 * variation(a.lane, a.reversals + 1));
  }

  /** Poses between the last two simulation steps, so motion stays smooth at any frame rate. */
  function publish() {
    const t = accumulator / STEP;
    for (const a of animals) {
      const p = a.previous, pose = a.pose;
      pose.x = p.x + (a.x - p.x) * t;
      pose.z = p.z + (a.z - p.z) * t;
      pose.y = p.y + (a.y - p.y) * t;
      pose.heading = p.heading + wrap(a.heading - p.heading) * t;
      pose.bank = p.bank + (a.bank - p.bank) * t;
      pose.turn = a.turn;
      pose.speed = a.speed;
      pose.climb = a.climb;
      pose.pace = a.speed / a.m.cruise;
      pose.effort = .65 + .35 * pose.pace;
    }
    // The school's last step is up to one simulation step older than the animals'.
    school?.publish((schoolTick * STEP + accumulator) / SCHOOL_STEP);
  }

  /** Show the school the animals as they are now: where, how fast, whether in sight, whether charging. */
  function refreshNeighbors() {
    for (let i = 0; i < animals.length; i++) {
      const a = animals[i], o = neighbors[i], dive = sampleDive(time, a.lane, members.length);
      o.x = a.x; o.z = a.z; o.y = a.y + dive.y; o.heading = a.heading; o.speed = a.speed; o.presence = dive.opacity;
      // The fish read a charge from the rush itself: lined up and accelerating, not while it turns in.
      o.charging = !!a.hunt && (a.hunt.phase === 'charge' || a.hunt.phase === 'exit') && a.speed > a.m.cruise * 1.3;
    }
  }

  return {
    get(lane: number): MarinePose | undefined { return byLane.get(lane)?.pose; },
    /**
     * Steering state for tuning overlays: the species' movement, its apparent position (and the shift
     * toward the viewer it was judged with), desired heading, target distance offshore and each influence.
     */
    inspect(lane: number) {
      const a = byLane.get(lane);
      return a && { m: a.m, x: a.x, z: a.z + a.shift, shift: a.shift, allowance: a.allowance, heading: a.heading, want: a.heading + a.want, halfTurn: a.halfTurn, brake: a.brake, ...a.steering };
    },
    /** A hunter's stalking of the school (null for other species, or without a school). */
    hunt(lane: number): Readonly<Hunt> | null { return byLane.get(lane)?.hunt ?? null; },
    /** The tuna school, when there is one: stepped with the animals, its poses published with theirs. */
    school,
    field,
    /** Seconds simulated so far: the school's clock, which the dive cycle follows too. */
    clock() { return time + accumulator; },
    step(delta: number, active: boolean) {
      if (!active) return;
      // A long background frame never teleports the school: at most 0.05 s is simulated per frame.
      accumulator += Math.max(0, Math.min(delta, .05));
      while (accumulator >= STEP) {
        accumulator -= STEP;
        steer();
        advance();
        if (school && (schoolTick ^= 1) === 0) { refreshNeighbors(); school.step(SCHOOL_STEP, neighbors); }
      }
      publish();
    },
  };
}
export type MarineMotion = ReturnType<typeof createMarineMotion>;
