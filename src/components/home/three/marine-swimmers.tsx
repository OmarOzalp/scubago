import { useMemo, type ComponentType } from 'react';
import { useFrame } from '@react-three/fiber';
import { createMarineMotion, type MarineMember, type MarineMotion } from '@/lib/marine-motion';
import type { MarineModels } from './marine-loader';
import { AnimatedMarine } from './animated-marine';

/** Tuning overlay (EXPO_PUBLIC_MARINE_DEBUG=1, then restart Metro with --clear), loaded only when switched on. */
const MarineDebug: ComponentType<{ motion: MarineMotion; members: readonly MarineMember[] }> | null =
  process.env.EXPO_PUBLIC_MARINE_DEBUG === '1' ? require('./marine-debug').MarineDebug : null;

type Resident = MarineMember & { id: string; onPress: () => void };
export function MarineSwimmers({ residents, models, active, level = 1 }: {
  residents: Resident[]; models: MarineModels; active: boolean; level?: number;
}) {
  const signature = JSON.stringify(residents.map(({ id, model, lane }) => ({ id, model, lane })));
  // The island's shape at this level (it grows, and islets appear) decides where animals may swim.
  const members = useMemo<MarineMember[]>(() => JSON.parse(signature), [signature]);
  const motion = useMemo(() => createMarineMotion(members, level), [members, level]);
  // Advance the whole school before its individual meshes read their poses.
  useFrame((_, delta) => motion.step(delta, active), -1);
  return <>
    {residents.map((resident) => <AnimatedMarine key={resident.id}
      model={resident.model} lane={resident.lane} gltf={models[resident.model]!}
      active={active} population={residents.length} motion={motion} onPress={resident.onPress} />)}
    {MarineDebug && <MarineDebug motion={motion} members={members} />}
  </>;
}
