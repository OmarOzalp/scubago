import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GROUP_BUDGET, groupSizes } from '@/lib/marine-groups';
import { createMarineMotion, type MarineMember, type MarineMotion } from '@/lib/marine-motion';
import { oceanScale } from '@/lib/steering';
import type { MarineModels } from './marine-loader';
import { AnimatedMarine } from './animated-marine';
import { MarineSplashes } from './marine-splashes';
import { projectPoint } from './project-point';
import { useSceneQuality } from './scene-quality';
import { TunaSchoolMesh } from './tuna-school-mesh';

/** Tuning overlay (EXPO_PUBLIC_MARINE_DEBUG=1, then restart Metro with --clear), loaded only when switched on. */
const MarineDebug: ComponentType<{ motion: MarineMotion }> | null =
  process.env.EXPO_PUBLIC_MARINE_DEBUG === '1' ? require('./marine-debug').MarineDebug : null;

/**
 * Drawn once per app launch: where the tuna school starts, the great white's chances, the dolphins'
 * leaps and how many swim in each group differ each visit.
 */
const SEED = Math.random();
/** For reviewing leaps: EXPO_PUBLIC_DOLPHIN_LEAPS=1 (restart Metro with --clear) makes every breath with room for one a leap. */
const LEAP = process.env.EXPO_PUBLIC_DOLPHIN_LEAPS === '1' ? 1 : undefined;

type Resident = MarineMember & { id: string; onPress: () => void };

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
export function MarineSwimmers({ residents, models, active, level = 1, onSchoolPress, schoolSpecies = [], arrivals }: {
  residents: Resident[]; models: MarineModels; active: boolean; level?: number; onSchoolPress?: () => void;
  /** The species the tuna school shows (logged tuna): a new one arrives with the whole school. */
  schoolSpecies?: readonly string[];
  arrivals?: Arrivals;
}) {
  const lite = useSceneQuality() === 'lite';
  const size = useThree((state) => state.size), invalidate = useThree((state) => state.invalidate);
  const aspect = size.width / Math.max(1, size.height);
  // Group members come from a budget of their own, smaller where the GPU is emulated.
  const sizes = groupSizes(residents, lite ? GROUP_BUDGET.lite : GROUP_BUDGET.full, SEED);
  const signature = JSON.stringify(residents.map(({ model, lane }, i) => ({ model, lane, group: sizes[i] })));
  const members = useMemo<MarineMember[]>(() => JSON.parse(signature), [signature]);
  // Who waits out of sight is read only when a simulation starts (a new set of animals), so a change to
  // it never restarts one.
  const waiting = arrivals?.waiting ?? [];
  const schoolPending = waiting.some((id) => schoolSpecies.includes(id));
  const holdable = schoolPending && !arrivals?.visible && !arrivals?.instant;
  const start = () => {
    const arriving = residents.filter((r) => waiting.includes(r.id)).map((r) => r.lane);
    const motion = createMarineMotion(members, level, { school: true, seed: SEED, leap: LEAP, arriving });
    // A new tuna brings the whole school in, from out of sight (only ever before the scene is shown).
    if (holdable) motion.holdSchool(aspect);
    return motion;
  };
  // One simulation per set of animals (a school of tuna swims with them, src/lib/tuna-school.ts). A new
  // level reshapes the island and widens the ocean around the same animals rather than starting over.
  const [simulation, setSimulation] = useState(() => ({ members, motion: start() }));
  let motion = simulation.motion;
  if (simulation.members !== members) {
    motion = start();
    setSimulation({ members, motion });
  }
  useEffect(() => { motion.setLevel(level); }, [motion, level]);

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

  // Advance the whole school before its individual meshes read their poses.
  useFrame((_, delta) => motion.step(delta, active), -1);
  // Report an arrival, and place the tag over the animal it follows.
  const camera = useThree((state) => state.camera);
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
  const tapScale = oceanScale(level);
  return <>
    {motion.swimmers.map((swimmer) => {
      const resident = byLane.get(swimmer.leader);
      return resident && <AnimatedMarine key={`${resident.id}:${swimmer.index}`}
        model={swimmer.model} lane={swimmer.lane} gltf={models[swimmer.model]!}
        active={active} population={residents.length} motion={motion} onPress={resident.onPress} tapScale={tapScale} />;
    })}
    <MarineSplashes motion={motion} lite={lite} />
    {motion.school && <TunaSchoolMesh school={motion.school} onPress={onSchoolPress} />}
    {MarineDebug && <MarineDebug motion={motion} />}
  </>;
}
