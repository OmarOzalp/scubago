import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { createMarineMotion, type MarineMember } from '@/lib/marine-motion';
import type { MarineModels } from './marine-loader';
import { AnimatedMarine } from './animated-marine';

type Resident = MarineMember & { id: string; onPress: () => void };
export function MarineSwimmers({ residents, models, active }: {
  residents: Resident[]; models: MarineModels; active: boolean;
}) {
  const signature = JSON.stringify(residents.map(({ id, model, lane }) => ({ id, model, lane })));
  const motion = useMemo(() => createMarineMotion(JSON.parse(signature)), [signature]);
  // Advance the whole school before its individual meshes read their poses.
  useFrame((_, delta) => motion.step(delta, active), -1);
  return <>{residents.map((resident) => <AnimatedMarine key={resident.id}
    model={resident.model} lane={resident.lane} gltf={models[resident.model]!}
    active={active} population={residents.length} motion={motion} onPress={resident.onPress} />)}</>;
}
