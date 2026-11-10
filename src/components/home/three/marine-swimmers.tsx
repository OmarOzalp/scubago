import { useContext, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import type { IslandShape } from '@/lib/island-outline';
import { GROUP_BUDGET, groupSizes } from '@/lib/marine-groups';
import { createMarineMotion, MOVEMENT, type MarineMember, type MarineMotion } from '@/lib/marine-motion';
import { runSliced } from '@/lib/slices';
import type { OceanIsland } from '@/lib/seabed';
import type { WaterExtent } from '@/lib/seabed-lattice';
import { oceanScale, worldFor } from '@/lib/steering';
import type { MarineModels } from './marine-loader';
import { AnimatedMarine, measureMarine } from './animated-marine';
import { KELP_MOVERS, KelpMoversContext, setKelpMover } from './kelp-movers';
import { MarineSplashes } from './marine-splashes';
import { projectPoint } from './project-point';
import { ReefAnemones } from './reef-anemone';
import { ReefRocks } from './reef-rocks';
import { useSceneQuality } from './scene-quality';
import { STAGE } from './stager';
import { SeenContext, useSteps } from './staging';
import { TunaSchoolMesh } from './tuna-school-mesh';
import { onScreen } from './view-cull';
import { EXPLORER_MARKS, SceneMarksContext } from './scene-marks';
import { perfReport } from '@/lib/perf-report';
import { useGovernor } from './governor';

/** Tuning overlay (EXPO_PUBLIC_MARINE_DEBUG=1, then restart Metro with --clear), loaded only when switched on. */
const MarineDebug: ComponentType<{ motion: MarineMotion }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: a static import would load the overlay even when it is off
  process.env.EXPO_PUBLIC_MARINE_DEBUG === '1' ? require('./marine-debug').MarineDebug : null;

/**
 * Drawn once per app launch: where the tuna school starts, the great white's chances, the dolphins'
 * leaps and how many swim in each group differ each visit.
 */
const SEED = Math.random();
/** Simulation steps a second, forced (EXPO_PUBLIC_MOTION_CADENCE=30, restart Metro with --clear): for measuring; otherwise the quality governor's. */
const FORCED_CADENCE = Number(process.env.EXPO_PUBLIC_MOTION_CADENCE) || 0;
/** For reviewing leaps: EXPO_PUBLIC_DOLPHIN_LEAPS=1 (restart Metro with --clear) makes every breath with room for one a leap. */
const LEAP = process.env.EXPO_PUBLIC_DOLPHIN_LEAPS === '1' ? 1 : undefined;

/** One of the island's species: on it, or `leaving` at the end of its turn (sanctuary-scene.tsx, Lineup in swimming.ts). */
type Resident = MarineMember & { id: string; onPress: () => void; leaving?: boolean };

/**
 * Where the "New" tag goes, called every frame for the overlay outside the canvas (sanctuary-scene.tsx):
 * the animal's point on screen (px from the canvas's top left) and whether it is in view.
 */
export type TagAnchor = (x: number, y: number, inView: boolean) => void;

/** New discoveries arriving (see useDiscoveryMoments): who waits out of sight, who comes in now, and the tag. */
export type Arrivals = {
  /** Species waiting to arrive (the tuna school's species included): out of sight until their turn. */
  waiting: readonly string[];
  /** The species to bring in now (the school, if it is one of the school's species), or null. */
  now: string | null;
  /** Put arrivals straight in their places (reduced motion, or the scene paused). */
  instant: boolean;
  /** The scene is on screen: the school is only ever moved out of sight while it isn't. */
  visible: boolean;
  /** Called once the species brought in has arrived. */
  onArrived: (speciesId: string) => void;
  /** The species (or school species) the "New" tag follows, and where to write its position. */
  tag: { speciesId: string; anchor: TagAnchor } | null;
};

const scratch = { x: 0, y: 0 };
const MOVING = { hideInPicture: true };
/**
 * How long (s) an animal takes to come into view on an island built before (the pill switched back, the explorer showing an island seen on Home), where
 * it used to appear at once: a short fade up out of the blue, where it is, rather than the slower rise of one arriving late on a first visit.
 */
export const QUICK_EMERGE_SECONDS = .6;
/** How long (ms) after the next species is known its water is begun ahead (the first turn is 18 s or more after a scene starts), and the slices. */
const PREPARE_AFTER_MS = 4000, PREPARE_SLICE_MS = 6;

/**
 * The animals and the tuna school. A species that swims in a group (marine-groups.ts) is drawn as
 * several animals, all opening its one page; `onSchoolPress` makes the school one tap target too.
 */
export function MarineSwimmers({ residents, models, active, level = 1, school = false, onSchoolPress, schoolSpecies = [], arrivals, tapScale, shape = 'reef', world, unseen = false, upcoming }: {
  residents: Resident[]; models: MarineModels; active: boolean; level?: number; onSchoolPress?: () => void;
  /** The species that comes on at this island's next turn, if any: its water is worked out ahead (`prepare`). */
  upcoming?: { model: MarineMember['model']; speciesId: string } | null;
  /** The scene isn't on show yet (Home's picture of it still covers it): an animal joining is simply there, rather than swimming in. */
  unseen?: boolean;
  /** The island they swim around (its own outline and size). */
  shape?: IslandShape;
  /** With several islands in the ocean (the explorer): all of them and which this is, for the bank between them that shapes the seabed under the animals. */
  world?: { islands: readonly OceanIsland[]; index: number; reach?: WaterExtent };
  /** How much larger tap targets are than the animals need at the first level's zoom: the level's pullback unless set (the explorer's zoom, tapScaleAt). */
  tapScale?: number;
  /** Whether the tuna school swims here (a tuna is logged). */
  school?: boolean;
  /** The species the tuna school shows (logged tuna): a new one arrives with the whole school. */
  schoolSpecies?: readonly string[];
  arrivals?: Arrivals;
}) {
  const lite = useSceneQuality() === 'lite';
  // On an island built before (built-islands.ts) the animals that join as their steps open are simply there, as under a picture, not rising out of the deep.
  const seen = useContext(SeenContext);
  // (the performance report counts how animals come on: at once while on show is a pop)
  const reportAs = useContext(SceneMarksContext) === EXPLORER_MARKS ? 'explorer' : 'home';
  const size = useThree((state) => state.size), invalidate = useThree((state) => state.invalidate);
  const aspect = size.width / Math.max(1, size.height);
  // Group members come from a budget of their own, smaller where the GPU is emulated.
  const budget = lite ? GROUP_BUDGET.lite : GROUP_BUDGET.full;
  // Who waits out of sight is read when an animal joins (and when a simulation starts), so a change to it never restarts one.
  const waiting = arrivals?.waiting ?? [];
  const schoolPending = waiting.some((id) => schoolSpecies.includes(id));
  const holdable = schoolPending && !arrivals?.visible && !arrivals?.instant;
  // The islands are read only when a simulation starts, like who is waiting: the same islands in the same places keep it.
  const places = world ? JSON.stringify({ islands: world.islands, index: world.index }) : '';
  /** What the simulation has of each species: its lane, model and group size, and whether it was sent off at the end of its turn. */
  type Joined = { lane: number; model: MarineMember['model']; group: number; leaving: boolean };
  // The animals the scene may have so far: one more with each step (staging.tsx), the swimming itself starting with none, so that no
  // one task builds them all; all of them at once where nothing stages the scene.
  const room = useSteps(STAGE.animal, residents.filter((r) => !r.leaving && models[r.model]).length);
  const start = () => {
    // Those on the island now whose models are loaded (the rest join as theirs arrive), each in a group sized within the budget: all of
    // them sized together, as if they all joined now, though only the first `room` do (the others keep the size planned for them).
    const ready = residents.filter((r) => !r.leaving && models[r.model]);
    const sizes = groupSizes(ready, budget, SEED);
    const plan = new Map(ready.map((r, i) => [r.id, sizes[i]] as const));
    const present = ready.slice(0, room);
    const joined = new Map<string, Joined>(present.map((r, i) => [r.id, { lane: r.lane, model: r.model, group: sizes[i], leaving: false }]));
    const members = present.map((r, i): MarineMember => ({ model: r.model, lane: r.lane, group: sizes[i], speciesId: r.id }));
    const arriving = present.filter((r) => waiting.includes(r.id)).map((r) => r.lane);
    const motion = createMarineMotion(members, level, { school, seed: SEED, leap: LEAP, arriving, shape, world });
    // A new tuna brings the whole school in, from out of sight (only ever before the scene is shown).
    if (holdable) motion.holdSchool(aspect);
    // Those on the island whose models are still loading (`late`), and those of them that came on show emerging (`emerging`, their lanes).
    return { motion, joined, late: new Set<string>(), emerging: new Set<number>(), quick: new Set<number>(), plan };
  };
  // One simulation for the scene's life (a school of tuna swims with them, src/lib/tuna-school.ts). Species come and go
  // in it one at a time, the others carrying on as they were: one whose turn ends swims off out of the view, the next
  // swims in from the open sea, a new discovery arrives, a deleted one is gone. A new level reshapes the island and widens
  // the ocean around the same animals rather than starting over. The school joining (a tuna logged) or leaving (its last
  // sighting deleted) starts one again, and so does another island (Home's card shows one island at a time).
  const [simulation, setSimulation] = useState(() => ({ school, shape, places, ...start() }));
  let { motion, joined, late, emerging, quick, plan } = simulation;
  if (simulation.school !== school || simulation.shape !== shape || simulation.places !== places) {
    ({ motion, joined, late, emerging, quick, plan } = start());
    setSimulation({ school, shape, places, motion, joined, late, emerging, quick, plan });
  }
  // Bring the simulation in step with who is on the island (applying the same changes twice changes nothing).
  const wanted = new Map(residents.filter((r) => models[r.model]).map((r) => [r.id, r]));
  for (const [id, had] of [...joined]) {
    const now = wanted.get(id);
    // Gone from the collection (or, rarely, back from leaving, or in another lane): off the island at once.
    if (!now || now.lane !== had.lane || now.model !== had.model || (had.leaving && !now.leaving)) { motion.remove(had.lane); joined.delete(id); }
    else if (now.leaving && !had.leaving) { motion.depart(had.lane, { aspect, instant: !!arrivals?.instant || !active }); had.leaving = true; }
  }
  for (const r of residents) if (!r.leaving && !models[r.model]) late.add(r.id);
  let admitted = [...joined.values()].filter((j) => !j.leaving).length;
  for (const [id, r] of wanted) {
    if (joined.has(id) || r.leaving) continue;
    // Its step has not come yet: it joins when it does, as one whose model arrived late does.
    if (admitted >= room) { late.add(id); continue; }
    admitted++;
    // Its group's size within what the budget has left. A newcomer (another's turn ended) swims in from the open sea, a new
    // discovery waits for its turn to arrive; one already on the island whose model has only now loaded comes into view
    // where it is, emerging from the deep. Before the scene is on show, or with the scene still, it is simply there.
    // (one sized with the others as they started keeps its size; any other gets what the others, and those still to join, leave of the budget)
    const used = [...joined.values()].reduce((sum, j) => sum + j.group - 1, 0) + [...plan].reduce((sum, [who, size]) => sum + (!joined.has(who) && wanted.has(who) ? size - 1 : 0), 0);
    const group = plan.get(id) ?? groupSizes([{ id, model: r.model }], Math.max(0, budget - used), SEED)[0];
    plan.delete(id);
    const held = waiting.includes(id), lateModel = late.delete(id) && !held, still = !!arrivals?.instant || !active || unseen;
    motion.add({ model: r.model, lane: r.lane, group, speciesId: id }, { aspect, waiting: held, instant: still || lateModel });
    // (on an island built before, quickly: the island is there at once, and its animals should be nearly so)
    if (lateModel && !still) { emerging.add(r.lane); if (seen) quick.add(r.lane); }
    perfReport.count(`${reportAs}: animals ${still ? 'joined unseen or still' : held ? 'waiting to arrive' : !lateModel ? 'swam in' : seen ? 'faded into view' : 'rose into view'}`);
    joined.set(id, { lane: r.lane, model: r.model, group, leaving: false });
  }
  // An animal that has swum off is taken out of the scene's list.
  const [, redraw] = useState(0);
  const roster = useRef(motion.version);
  useEffect(() => { motion.setLevel(level); }, [motion, level]);
  // How far the explorer's water reaches changes with its window, never the animals.
  const reach = JSON.stringify(world?.reach ?? null);
  useEffect(() => { motion.setReach(JSON.parse(reach) ?? undefined); }, [motion, reach]);
  // The species whose turn comes next on this island: its water (the fields of where its body fits, the costly part of joining) is worked
  // out ahead, and what its model measures as an animal of it mounts, a few milliseconds at a time and a little after the scene has settled,
  // so that its turn costs no long task. (Should the turn come first, it is all worked out as it joins, as it always was.)
  const nextModel = upcoming?.model, nextSpecies = upcoming?.speciesId, nextGltf = nextModel ? models[nextModel] : undefined;
  useEffect(() => {
    if (!nextModel || !nextSpecies) return;
    let stopped = false;
    const ahead = function* () {
      yield* motion.prepare({ model: nextModel, speciesId: nextSpecies });
      if (nextGltf) { yield; yield* measureMarine(nextModel, nextGltf); }
    };
    const wait = setTimeout(() => { runSliced(ahead(), { slice: PREPARE_SLICE_MS, stop: () => stopped }).catch(() => {}); }, PREPARE_AFTER_MS);
    return () => { stopped = true; clearTimeout(wait); };
  }, [motion, nextModel, nextSpecies, nextGltf]);

  // A new tuna logged while the scene was away: the school steps out of sight to arrive.
  useEffect(() => {
    if (holdable && motion.school?.arriving === null) motion.holdSchool(aspect);
  }, [holdable, motion, aspect]);

  // Bring in the species whose turn it is.
  const now = arrivals?.now ?? null, instant = !!arrivals?.instant, onArrived = arrivals?.onArrived;
  const lane = now === null ? undefined : residents.find((r) => r.id === now)?.lane;
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!now) return;
    reported.current = null;
    let done: boolean;
    if (schoolSpecies.includes(now)) {
      motion.releaseSchool();
      done = !motion.school?.arriving;
    } else {
      const arrival = lane === undefined ? null : motion.arrival(lane);
      if (lane !== undefined && arrival?.stage === 'offstage') motion.arrive(lane, { aspect, instant });
      // Nothing to swim in (not waiting, or already here), or placed at once: it has arrived.
      done = lane === undefined || !arrival || instant || arrival.stage === 'arrived';
    }
    if (done) {
      reported.current = now;
      onArrived?.(now);
      invalidate();
    }
  }, [now, lane, instant, motion, schoolSpecies, aspect, invalidate, onArrived]);

  // Advance the whole school before its individual meshes read their poses; while none of the island's water is
  // on screen (the explorer looking at another island), its animals rest where they are.
  const camera = useThree((state) => state.camera);
  const origin = useRef<Group>(null), middle = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  const inView = useRef(true);
  // The quality governor's JavaScript ladder may ask the swimming for half the steps a second (quality-governor.ts).
  const governor = useGovernor();
  useFrame((_, delta) => {
    motion.setCadence(FORCED_CADENCE || (governor?.jsCurrent().cadence ?? 60));
    if (origin.current) {
      const at = origin.current.matrixWorld.elements;
      middle.x = at[12]; middle.y = at[13]; middle.z = at[14];
      const area = worldFor(level);
      inView.current = onScreen(camera, middle, area.x + 2, area.z + 2);
    }
    if (inView.current) motion.step(delta, active);
    if (motion.version !== roster.current) { roster.current = motion.version; redraw(motion.version); }
  }, -1);
  // In a kelp forest, tell the kelp where the animals are so it makes way for them (the nearest in sight first slots).
  const movers = useContext(KelpMoversContext);
  useFrame(() => {
    if (!movers || !inView.current) return;
    let slot = 0;
    for (const { model, lane } of motion.swimmers) {
      if (slot >= KELP_MOVERS) break;
      const pose = motion.get(lane), dive = motion.dive(lane), m = MOVEMENT[model];
      if (!pose || !m || dive.opacity < .3) continue;
      // Its body: most of its length, and its girth (its footprint's half width less the fins, plus a little room).
      setKelpMover(movers, slot++, pose.x, pose.y + dive.y, pose.z, pose.heading, m.halfLength * .85, m.halfWidth * .7 + .05);
    }
    for (; slot < KELP_MOVERS; slot++) movers.value[slot * 2].w = 0;
  }, -1);
  // Report an arrival, and place the tag over the animal it follows.
  useFrame(() => {
    if (now && reported.current !== now) {
      const done = schoolSpecies.includes(now) ? !motion.school?.arriving : lane !== undefined && motion.arrival(lane)?.stage === 'arrived';
      if (done) { reported.current = now; onArrived?.(now); }
    }
    const tag = arrivals?.tag;
    if (!tag) return;
    if (schoolSpecies.includes(tag.speciesId) && motion.school) {
      const hit = motion.school.hitArea;
      projectPoint(camera, hit.x, hit.y, hit.z, scratch);
    } else {
      const tagged = residents.find((r) => r.id === tag.speciesId)?.lane;
      const pose = tagged === undefined ? undefined : motion.get(tagged);
      if (tagged === undefined || !pose) return;
      projectPoint(camera, pose.x, pose.y + motion.dive(tagged).y, pose.z, scratch);
    }
    tag.anchor((scratch.x + 1) / 2 * size.width, (1 - scratch.y) / 2 * size.height, Math.abs(scratch.x) < 1 && Math.abs(scratch.y) < 1);
  });
  const byLane = new Map(residents.map((resident) => [resident.lane, resident]));
  const taps = tapScale ?? oceanScale(level);
  // The reef's rocks: two dens for each moray, a rock for each octopus; an anemone for each pair of clownfish (for each place
  // taken: one left by an animal whose turn has ended stays while another of its kind lives on the reef).
  const { morays, octopuses, anemones } = motion.reef?.counts ?? { morays: 0, octopuses: 0, anemones: 0 };
  return <>
    <group ref={origin} />
    {/* What moves is left out of the picture kept for the next launch (scene-snapshot.ts, stillOnly): it would be elsewhere by the time the live scene takes over. */}
    <group userData={MOVING}>
    {motion.swimmers.map((swimmer) => {
      const resident = byLane.get(swimmer.leader);
      return resident && models[swimmer.model] && <AnimatedMarine key={`${resident.id}:${swimmer.index}`}
        model={swimmer.model} lane={swimmer.lane} gltf={models[swimmer.model]!}
        active={active} population={residents.length} motion={motion} onPress={resident.onPress} tapScale={taps}
        emerge={emerging.has(swimmer.leader) ? (quick.has(swimmer.leader) ? QUICK_EMERGE_SECONDS : true) : false} />;
    })}
    <MarineSplashes motion={motion} lite={lite} />
    {motion.school && <TunaSchoolMesh school={motion.school} onPress={onSchoolPress} />}
    </group>
    {morays + octopuses > 0 && <ReefRocks level={level} morays={morays} octopuses={octopuses} shape={shape} />}
    {anemones > 0 && <ReefAnemones level={level} count={anemones} shape={shape} />}
    {MarineDebug && <MarineDebug motion={motion} />}
  </>;
}
