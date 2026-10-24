import { ISLAND_PLACES, ISLANDS } from '@/lib/archipelago';
import { shapeFor, shorePolygons, shoreDistance, type IslandShape } from '@/lib/island-outline';
import { GROUP_STYLES } from '@/lib/marine-groups';
import { hullBottom, hullOf, hullTop, marginOf, POKE, stanceOf, type Hull } from '@/lib/marine-bodies';
import { createMarineMotion, MOVEMENT, type MarineMember } from '@/lib/marine-motion';
import { isReefModel } from '@/lib/reef-life';
import { createSeabed, SURFACE_Y, type OceanIsland, type Seabed } from '@/lib/seabed';
import type { WaterExtent } from '@/lib/seabed-lattice';
import { EXPLORER } from '@/lib/explorer-view';
import { oceanScale, viewBounds } from '@/lib/steering';
import { TUNA_HULL } from '@/lib/tuna-school';
import type { MarineModel } from '@/lib/swimming';

/**
 * Surveying the swimming: run a scene (animals around one island at one level) for a long time and
 * measure, at every sample, where each animal's body is against the seabed as it is drawn and the island.
 * Shared by the clearance test (src/lib/__tests__/swim-depth.test.ts) and the sweep (scripts/verify-swim.mjs).
 *
 * The seabed it judges against is not the one the animals steer by (a baked grid, seabed.ts) but the water's
 * own: the triangles it is drawn from, looked up point by point, so a grid that missed a slope would show up.
 */
export type SurveyScene = {
  shape: IslandShape; level: number; models: readonly MarineModel[]; seed?: number; school?: boolean;
  /** The species ids of the models (a family's model may be a nurse shark or a guitarfish: how it lives in the water follows them). */
  species?: readonly (string | undefined)[];
  /** Swim among the archipelago's other islands, as in the explorer (its bank and open sea's floor), not alone as on Home: how far its water reaches (true: as far as a phone sees). */
  explorer?: boolean | WaterExtent;
  /** A new level to move to, and when (s): the island grows under the animals. */
  grow?: { level: number; at: number };
};
export type Survey = {
  /** How it lives in the water (marine-bodies.ts): `tuna` for the school's fish. */
  kind: 'bottom' | 'reef' | 'open' | 'tuna';
  /** Samples taken of each model's animals (every swimmer counted, followers too). */
  samples: number;
  /** Samples with some part of the body below the seabed, how many of them were drawn (not faded out on a dive), and the deepest it went (units, 0 if never). */
  clipped: number; clippedSeen: number; worst: number;
  /** Samples with the body closer to the seabed than half its margin (a near miss). */
  grazed: number;
  /** The least room between its lowest point and the seabed, over all samples (units; negative when clipped). */
  leastRoom: number;
  /** Samples with a part of the body inside the island's dry land. */
  onLand: number;
  /** The samples after the first `SETTLE` seconds, when the animals have swum out from where they started: what `stranded` and `unseen` are counted among. */
  settled: number;
  /** Samples (of the settled ones) where the water was too shallow for its body (its lowest point over the bottom would be above where all but the top fifth of its back must be under the surface): it swims with more of its back out of the water than is natural. */
  stranded: number;
  /** Samples (of the settled ones) of a body drawn (not faded out on a dive) outside what the camera shows at its depth, on a phone's canvas (`ASPECT`). */
  unseen: number;
  /** The animals' middle above the bottom under it ("above": height over the drawn seabed), and below the calm surface ("below": depth under it) (units), at the 10th, 50th and 90th percentile. */
  above: [number, number, number]; below: [number, number, number];
  /** The most its height changed between two frames (units), and the most its pitch did (rad), leaps and the like aside. */
  jump: number; tilt: number;
  /** Where it went most clipped, and where it first stood on land: for a failure message. */
  where?: string; landWhere?: string; grazeWhere?: string;
};

const quantiles = (values: number[]): [number, number, number] => {
  if (!values.length) return [0, 0, 0];
  const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return [at(.1), at(.5), at(.9)];
};

/** Group sizes the survey gives species that swim in groups: their largest, which is the hardest to keep clear. */
export const groupOf = (model: MarineModel) => { const style = GROUP_STYLES[model]; return style ? 1 + style.places.length : 1; };

/**
 * Every model there is, in scenes of eight (what a page of the island animates), so each meets different neighbors, and
 * a last scene of the species that live differently from the family model they are drawn with (a nurse shark, a guitarfish).
 */
export type SwimScene = { models: MarineModel[]; species: (string | undefined)[] };
const FAMILY_SPECIES: readonly (readonly [MarineModel, string])[] = [
  ['shark', 'nurse-shark'], ['shark', 'tasselled-wobbegong'], ['shark', 'shortfin-mako'], ['manta', 'giant-guitarfish'], ['manta', 'munks-devil-ray'],
  ['reef-fish', 'stonefish'], ['reef-fish', 'common-seahorse'], ['reef-fish', 'porcupinefish'],
];
export function swimScenes(): SwimScene[] {
  const models = Object.keys(MOVEMENT) as MarineModel[], scenes: SwimScene[] = [];
  for (let i = 0; i < models.length; i += 8) scenes.push({ models: models.slice(i, i + 8), species: [] });
  scenes.push({ models: FAMILY_SPECIES.map(([model]) => model), species: FAMILY_SPECIES.map(([, species]) => species) });
  return scenes;
}

/** The islands of the explorer's ocean, and which of them has this shape. */
export function archipelago(shape: IslandShape, reach: WaterExtent = EXPLORER.reach) {
  const islands: OceanIsland[] = Object.entries(ISLAND_PLACES).map(([id, [x, z]]) => ({ x, z, habitat: ISLANDS[id as keyof typeof ISLANDS] }));
  return { islands, index: Math.max(0, islands.findIndex((island) => shapeFor(island.habitat) === shape)), reach };
}

/**
 * The seabed as it is drawn at a point of an island's frame: the water's own triangles (seabed-lattice.ts), the last
 * drawn over a point the one seen. Where nothing is drawn (under the island itself), the height of land.
 */
export function drawnSeabed(level: number, shape: IslandShape, among?: { islands: readonly OceanIsland[]; index: number; reach?: WaterExtent }) {
  return createSeabed(level, shape, among).exact;
}

/** Seconds a scene runs before `stranded` and `unseen` are counted: the animals start in the first water that is clear of the shallows, and swim out from there. */
export const SETTLE = 8;
/** What the camera's canvas is judged at: a phone's Home card, a little wider than tall (the arrival tests' too). */
const ASPECT = 420 / 390;
/** How much more of its back (units) than the water allows (marine-bodies.ts, `POKE`) may be out of the water before a body counts as stranded: a body held to the edge of its water is a hair either side of it. */
const STRANDED_SLACK = .08;
const points = new Float64Array(7 * 3);
/** Run `scene` for `seconds` (simulated at 60 Hz), sampling every `every` seconds; one survey per model, and the school's fish as 'tuna'. */
export function surveyScene(scene: SurveyScene, seconds: number, every = .5): Record<string, Survey> {
  const members: MarineMember[] = scene.models.map((model, lane) => ({ model, lane, group: groupOf(model), speciesId: scene.species?.[lane] }));
  const world = scene.explorer ? archipelago(scene.shape, scene.explorer === true ? undefined : scene.explorer) : undefined;
  const motion = createMarineMotion(members, scene.level, { shape: scene.shape, seed: scene.seed ?? 0, school: scene.school ?? false, world });
  // What the animals steer by, and the drawing it is judged against (the same island, level and neighbors).
  let land = shorePolygons(scene.level, 24, scene.shape), seabed: Seabed = createSeabed(scene.level, scene.shape, world), drawn = drawnSeabed(scene.level, scene.shape, world);
  const raw: Record<string, { s: Survey; above: number[]; below: number[] }> = {};
  const entry = (name: string, kind: Survey['kind']) => raw[name] ??= {
    s: { kind, samples: 0, clipped: 0, clippedSeen: 0, worst: 0, grazed: 0, leastRoom: Infinity, onLand: 0, settled: 0, stranded: 0, unseen: 0, above: [0, 0, 0], below: [0, 0, 0], jump: 0, tilt: 0 }, above: [], below: [],
  };
  // The bottom under a point as drawn, with what stands on it: the coral heads and rocks, and the steamer. The reef's own animals
  // (octopus, cuttlefish, moray, clownfish) live in and against its rocks and dens: judged without them.
  const bottomAt = (reefAnimal: boolean, x: number, z: number) => drawn(x, z) + (reefAnimal ? Math.max(0, seabed.solid(x, z) - seabed.ground(x, z)) : Math.max(0, seabed.floor(x, z) - seabed.ground(x, z)));
  const judge = (name: string, kind: Survey['kind'], hull: Hull, x: number, y: number, z: number, heading: number, pitch: number, roll: number, shallow: boolean, at: number, seen: boolean, hidden = 0) => {
    const e = entry(name, kind), s = e.s;
    hullBottom(hull, x, z, heading, pitch, roll, points);
    const reefAnimal = kind !== 'tuna' && isReefModel(name as MarineModel);
    let room = Infinity;
    for (let i = 0; i < 7; i++) room = Math.min(room, y + points[i * 3 + 1] - bottomAt(reefAnimal, points[i * 3], points[i * 3 + 2]));
    s.samples++;
    if (room < s.leastRoom) { s.leastRoom = room; if (room < 0) s.where = `${name} at (${x.toFixed(2)}, ${z.toFixed(2)}) t=${at.toFixed(1)}s: ${(-room).toFixed(3)} below the bottom, y ${y.toFixed(2)}, bottom ${bottomAt(reefAnimal, x, z).toFixed(2)}`; }
    if (room < 0) { s.clipped++; if (seen) s.clippedSeen++; s.worst = Math.max(s.worst, -room); }
    // (a near miss counts where it is seen: a body sunk on a dive is faded out where it is, and only must not clip)
    if (!reefAnimal && seen && room < marginOf(hull) / 2) { s.grazed++; s.grazeWhere ??= `${name} at (${x.toFixed(2)}, ${z.toFixed(2)}) t=${at.toFixed(1)}s: ${room.toFixed(3)} above the bottom (half its margin is ${(marginOf(hull) / 2).toFixed(3)}), y ${y.toFixed(2)}, pitch ${pitch.toFixed(2)}, roll ${roll.toFixed(2)}`; }
    // Any of the points of its hull inside the island's dry land (what is out of sight in a den aside).
    let inside = false;
    for (let i = 0; i < 7; i++) if (!(hidden & (1 << i)) && shoreDistance(land, points[i * 3], points[i * 3 + 2]) < 0) inside = true;
    if (inside) { s.onLand++; s.landWhere ??= `${name} at (${x.toFixed(2)}, ${z.toFixed(2)}) t=${at.toFixed(1)}s`; }
    if (at >= SETTLE) s.settled++;
    if (shallow && at >= SETTLE) s.stranded++;
    const view = viewBounds(y, oceanScale(level), ASPECT);
    if (seen && at >= SETTLE && (Math.abs(x) > view.x || z < view.top || z > view.bottom)) s.unseen++;
    e.above.push(y - drawn(x, z));
    e.below.push(SURFACE_Y - y);
  };
  // A species that lives differently from its family's model is reported by its own name.
  // (a follower in a group is its leader's species)
  const nameOf = (swimmer: { model: MarineModel; leader: number }) => scene.species?.[swimmer.leader] ?? swimmer.model;
  const kindOf = (swimmer: { model: MarineModel; leader: number }) => stanceOf(swimmer.model, scene.species?.[swimmer.leader]).kind;
  let level = scene.level;
  const previous = new Map<number, { y: number; pitch: number }>();
  const steps = Math.round(seconds * 60), every60 = Math.max(1, Math.round(every * 60));
  for (let step = 1; step <= steps; step++) {
    motion.step(1 / 60, true);
    if (scene.grow && step === Math.round(scene.grow.at * 60)) {
      motion.setLevel(scene.grow.level);
      level = scene.grow.level;
      land = shorePolygons(scene.grow.level, 24, scene.shape);
      seabed = createSeabed(scene.grow.level, scene.shape, world);
      drawn = drawnSeabed(scene.grow.level, scene.shape, world);
    }
    // Between frames, how far each drawn animal moves up or down and tips: no popping (a leap, a breath and the like aside; and an animal
    // sunk on a dive, which follows the bottom down to as far as the water lets it sink, fading as it goes).
    for (const swimmer of motion.swimmers) {
      const pose = motion.get(swimmer.lane);
      if (!pose) continue;
      const dive = motion.dive(swimmer.lane), y = pose.y + dive.y, was = previous.get(swimmer.lane);
      if (was && pose.air < .05 && dive.y > -.05) {
        const s = entry(nameOf(swimmer), kindOf(swimmer)).s;
        s.jump = Math.max(s.jump, Math.abs(y - was.y));
        s.tilt = Math.max(s.tilt, Math.abs(pose.pitch - was.pitch));
      }
      previous.set(swimmer.lane, { y, pitch: pose.pitch });
    }
    if (step % every60) continue;
    const at = step / 60;
    for (const swimmer of motion.swimmers) {
      const pose = motion.get(swimmer.lane);
      if (!pose) continue;
      const dive = motion.dive(swimmer.lane);
      // Counted whether or not it is drawn (out of sight on a dive it must still be above the bottom); `seen` says which.
      // (the reef's own animals, in the shallows by habit, have no such limits to ask)
      const limits = motion.inspect(swimmer.lane)?.bottom;
      judge(nameOf(swimmer), kindOf(swimmer), hullOf(swimmer.model), pose.x, pose.y + dive.y, pose.z, pose.heading, pose.pitch, pose.bank, !!limits && pose.air < .05 && limits.lo - limits.hi > POKE * hullTop(hullOf(swimmer.model), pose.pitch, pose.bank) + STRANDED_SLACK, at, dive.opacity > .05, pose.hide && pose.hide[0] > .3 ? 4 : 0);
    }
    const school = motion.school;
    if (school) {
      for (let i = 0; i < school.size; i++) judge('tuna', 'tuna', TUNA_HULL, school.pose.x[i], school.pose.y[i], school.pose.z[i], school.pose.heading[i], school.pose.pitch[i], school.pose.roll[i], SURFACE_Y - school.pose.y[i] < TUNA_HULL.crest, at, true);
    }
  }
  const out: Record<string, Survey> = {};
  for (const [name, { s, above, below }] of Object.entries(raw)) out[name] = { ...s, above: quantiles(above), below: quantiles(below), leastRoom: Number.isFinite(s.leastRoom) ? s.leastRoom : 0 };
  return out;
}

/**
 * What a survey of a scene says is wrong, as plain sentences (none when it is all right): every body clear of the
 * bottom (the reef's own animals aside, which lie on it, a hair clear) and of the island's dry land, none grazing
 * the bottom closer than half its margin, no pitch or height that jumps between frames.
 */
export function clearFailures(surveys: Record<string, Survey>, where: string) {
  const failures: string[] = [];
  for (const [name, s] of Object.entries(surveys)) {
    if (s.clipped) failures.push(`${where}: ${s.where} (${s.clipped} of ${s.samples} samples)`);
    if (s.onLand) failures.push(`${where}: ${name} in the island's dry land, first ${s.landWhere} (${s.onLand} samples)`);
    if (s.grazed) failures.push(`${where}: ${name} grazed the bottom ${s.grazed} times, within ${s.leastRoom.toFixed(3)} of it, first ${s.grazeWhere}`);
    if (s.jump > .08) failures.push(`${where}: ${name} jumped ${s.jump.toFixed(3)} up or down between two frames`);
    if (s.tilt > .05) failures.push(`${where}: ${name} tipped ${s.tilt.toFixed(3)} rad between two frames`);
  }
  return failures;
}
