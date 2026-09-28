import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useFrame } from '@react-three/fiber';
import { GROUP_BUDGET, groupSizes } from '@/lib/marine-groups';
import { createMarineMotion, type MarineMember, type MarineMotion } from '@/lib/marine-motion';
import { oceanScale } from '@/lib/steering';
import type { MarineModels } from './marine-loader';
import { AnimatedMarine } from './animated-marine';
import { MarineSplashes } from './marine-splashes';
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
 * The animals and the tuna school. A species that swims in a group (marine-groups.ts) is drawn as
 * several animals, all opening its one page; `onSchoolPress` makes the school one tap target too.
 */
export function MarineSwimmers({ residents, models, active, level = 1, onSchoolPress }: {
  residents: Resident[]; models: MarineModels; active: boolean; level?: number; onSchoolPress?: () => void;
}) {
  const lite = useSceneQuality() === 'lite';
  // Group members come from a budget of their own, smaller where the GPU is emulated.
  const sizes = groupSizes(residents, lite ? GROUP_BUDGET.lite : GROUP_BUDGET.full, SEED);
  const signature = JSON.stringify(residents.map(({ model, lane }, i) => ({ model, lane, group: sizes[i] })));
  const members = useMemo<MarineMember[]>(() => JSON.parse(signature), [signature]);
  // One simulation per set of animals (a school of tuna swims with them, src/lib/tuna-school.ts). A new
  // level reshapes the island and widens the ocean around the same animals rather than starting over.
  const [simulation, setSimulation] = useState(() => ({ members, motion: createMarineMotion(members, level, { school: true, seed: SEED, leap: LEAP }) }));
  let motion = simulation.motion;
  if (simulation.members !== members) {
    motion = createMarineMotion(members, level, { school: true, seed: SEED, leap: LEAP });
    setSimulation({ members, motion });
  }
  useEffect(() => { motion.setLevel(level); }, [motion, level]);
  // Advance the whole school before its individual meshes read their poses.
  useFrame((_, delta) => motion.step(delta, active), -1);
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
