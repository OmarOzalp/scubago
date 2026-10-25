import { useContext, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import type { IslandShape } from '@/lib/island-outline';
import { GROUP_BUDGET, groupSizes } from '@/lib/marine-groups';
import { createMarineMotion, MOVEMENT, type MarineMember, type MarineMotion } from '@/lib/marine-motion';
import type { OceanIsland } from '@/lib/seabed';
import type { WaterExtent } from '@/lib/seabed-lattice';
import { oceanScale, worldFor } from '@/lib/steering';
import type { MarineModels } from './marine-loader';
import { AnimatedMarine } from './animated-marine';
import { KELP_MOVERS, KelpMoversContext, setKelpMover } from './kelp-movers';
import { MarineSplashes } from './marine-splashes';
import { projectPoint } from './project-point';
import { ReefAnemones } from './reef-anemone';
import { ReefRocks } from './reef-rocks';
import { useSceneQuality } from './scene-quality';
import { TunaSchoolMesh } from './tuna-school-mesh';
import { onScreen } from './view-cull';

/** Tuning overlay (EXPO_PUBLIC_MARINE_DEBUG=1, then restart Metro with --clear), loaded only when switched on. */
const MarineDebug: ComponentType<{ motion: MarineMotion }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: a static import would load the overlay even when it is off
  process.env.EXPO_PUBLIC_MARINE_DEBUG === '1' ? require('./marine-debug').MarineDebug : null;

/**
 * Drawn once per app launch: where the tuna school starts, the great white's chances, the dolphins'
 * leaps and how many swim in each group differ each visit.
 */
const SEED = Math.random();
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

/**
 * The animals and the tuna school. A species that swims in a group (marine-groups.ts) is drawn as
 * several animals, all opening its one page; `onSchoolPress` makes the school one tap target too.
 */
export function MarineSwimmers({ residents, models, active, level = 1, school = false, onSchoolPress, schoolSpecies = [], arrivals, tapScale, shape = 'reef', world, unseen = false }: {
  residents: Resident[]; models: MarineModels; active: boolean; level?: number; onSchoolPress?: () => void;
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
  const start = () => {
    // Those on the island now whose models are loaded (the rest join as theirs arrive), each in a group sized within the budget.
    const present = residents.filter((r) => !r.leaving && models[r.model]);
    const sizes = groupSizes(present, budget, SEED);
    const joined = new Map<string, Joined>(present.map((r, i) => [r.id, { lane: r.lane, model: r.model, group: sizes[i], leaving: false }]));
    const members = present.map((r, i): MarineMember => ({ model: r.model, lane: r.lane, group: sizes[i], speciesId: r.id }));
    const arriving = present.filter((r) => waiting.includes(r.id)).map((r) => r.lane);
    const motion = createMarineMotion(members, level, { school, seed: SEED, leap: LEAP, arriving, shape, world });
    // A new tuna brings the whole school in, from out of sight (only ever before the scene is shown).
    if (holdable) motion.holdSchool(aspect);
    return { motion, joined };
  };
  // One simulation for the scene's life (a school of tuna swims with them, src/lib/tuna-school.ts). Species come and go
  // in it one at a time, the others carrying on as they were: one whose turn ends swims off out of the view, the next
  // swims in from the open sea, a new discovery arrives, a deleted one is gone. A new level reshapes the island and widens
  // the ocean around the same animals rather than starting over. The school joining (a tuna logged) or leaving (its last
  // sighting deleted) starts one again, and so does another island (Home's card shows one island at a time).
  const [simulation, setSimulation] = useState(() => ({ school, shape, places, ...start() }));
  let { motion, joined } = simulation;
  if (simulation.school !== school || simulation.shape !== shape || simulation.places !== places) {
    ({ motion, joined } = start());
    setSimulation({ school, shape, places, motion, joined });
  }
  // Bring the simulation in step with who is on the island (applying the same changes twice changes nothing).
  const wanted = new Map(residents.filter((r) => models[r.model]).map((r) => [r.id, r]));
  for (const [id, had] of [...joined]) {
    const now = wanted.get(id);
    // Gone from the collection (or, rarely, back from leaving, or in another lane): off the island at once.
    if (!now || now.lane !== had.lane || now.model !== had.model || (had.leaving && !now.leaving)) { motion.remove(had.lane); joined.delete(id); }
    else if (now.leaving && !had.leaving) { motion.depart(had.lane, { aspect, instant: !!arrivals?.instant || !active }); had.leaving = true; }
  }
  for (const [id, r] of wanted) {
    if (joined.has(id) || r.leaving) continue;
    // Its group's size within what the budget has left; it swims in from the open sea (or waits for its turn to arrive as a new
    // discovery), each as soon as its model is loaded. Before the scene is on show, or with the scene still, it is simply there.
    const used = [...joined.values()].reduce((sum, j) => sum + j.group - 1, 0);
    const group = groupSizes([{ id, model: r.model }], Math.max(0, budget - used), SEED)[0];
    motion.add({ model: r.model, lane: r.lane, group, speciesId: id }, { aspect, waiting: waiting.includes(id), instant: !!arrivals?.instant || !active || unseen });
    joined.set(id, { lane: r.lane, model: r.model, group, leaving: false });
  }
  // An animal that has swum off is taken out of the scene's list.
  const [, redraw] = useState(0);
  const roster = useRef(motion.version);
  useEffect(() => { motion.setLevel(level); }, [motion, level]);
  // How far the explorer's water reaches changes with its window, never the animals.
  const reach = JSON.stringify(world?.reach ?? null);
  useEffect(() => { motion.setReach(JSON.parse(reach) ?? undefined); }, [motion, reach]);

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
  useFrame((_, delta) => {
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
    {motion.swimmers.map((swimmer) => {
      const resident = byLane.get(swimmer.leader);
      return resident && models[swimmer.model] && <AnimatedMarine key={`${resident.id}:${swimmer.index}`}
        model={swimmer.model} lane={swimmer.lane} gltf={models[swimmer.model]!}
        active={active} population={residents.length} motion={motion} onPress={resident.onPress} tapScale={taps} />;
    })}
    {morays + octopuses > 0 && <ReefRocks level={level} morays={morays} octopuses={octopuses} shape={shape} />}
    {anemones > 0 && <ReefAnemones level={level} count={anemones} shape={shape} />}
    <MarineSplashes motion={motion} lite={lite} />
    {motion.school && <TunaSchoolMesh school={motion.school} onPress={onSchoolPress} />}
    {MarineDebug && <MarineDebug motion={motion} />}
  </>;
}
