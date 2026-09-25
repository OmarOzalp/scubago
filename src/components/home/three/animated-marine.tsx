import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Group, Mesh, SkinnedMesh } from 'three';
import { prepareUnderwater } from './underwater-material';
import type { MarineMotion } from '@/lib/marine-motion';
import { sampleDive } from '@/lib/ocean-depth';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { advanceSwimTime, sampleSwimPath, type MarineModel } from '@/lib/swimming';

const SIZE: Record<MarineModel, number> = { shark: 2.45, manta: 2.25, 'reef-fish': .85, 'whale-shark': 2.8, 'tiger-shark': 2.45, 'reef-manta': 2.45 };
// The source shark cycle is fast; slower playback gives it a relaxed cruising gait.
const GAIT: Record<MarineModel, number> = { shark: .58, manta: .85, 'reef-fish': .68, 'whale-shark': .42, 'tiger-shark': .58, 'reef-manta': .85 };

export function AnimatedMarine({ model, gltf, lane, active, inspect = false, population = 1, waterTint = '#75BDBA', motion, onPress }: {
  model: MarineModel; gltf: GLTF; lane: number; active: boolean; inspect?: boolean; population?: number; waterTint?: string; motion?: MarineMotion; onPress?: () => void;
}) {
  // SkeletonUtils.clone gives each swimmer its own skeleton so several can share one parsed rig.
  const { instance, underwater } = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse((object) => {
      if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; }
      if (object instanceof SkinnedMesh) object.frustumCulled = false;
    });
    return { instance: scene, underwater: inspect ? null : prepareUnderwater(scene) };
  }, [gltf.scene, inspect]);
  useEffect(() => () => underwater?.dispose(), [underwater]);
  useEffect(() => { underwater?.tint.value.set(waterTint); }, [underwater, waterTint]);
  const mixer = useMemo(() => new AnimationMixer(instance), [instance]);
  const group = useRef<Group>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    const clip = gltf.animations.find((animation) => animation.name.includes('Swim')) ?? gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.timeScale = GAIT[model];
    action.time = (lane * .317) % clip.duration;
    action.play();
    mixer.update(0);
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(instance); };
  }, [gltf.animations, instance, lane, mixer, model]);

  useFrame((_, delta) => {
    const next = advanceSwimTime(elapsed.current, delta, active);
    const swimming = motion?.get(lane);
    mixer.update((next - elapsed.current) * (inspect ? 1 : (swimming?.effort ?? 1)));
    elapsed.current = next;
    if (!group.current) return;
    if (inspect) {
      group.current.position.set(0, .2, 0);
      group.current.rotation.set(.04, -1.05 + Math.sin(next * .16) * .22, -.04);
    } else {
      const pose = swimming ?? sampleSwimPath(next, lane);
      const dive = sampleDive(next, lane, population);
      group.current.visible = dive.visible;
      group.current.position.set(pose.x, pose.y + dive.y, pose.z);
      underwater?.setDepth(dive.depth, dive.surfacing);
      group.current.rotation.set(dive.depth * (dive.surfacing ? -.16 : .16), pose.heading, pose.bank);
    }
  });

  const pose = motion?.get(lane) ?? sampleSwimPath(0, lane);
  const dive = sampleDive(0, lane, population);
  return <group ref={group} position={inspect ? [0, .2, 0] : [pose.x, pose.y + dive.y, pose.z]} rotation={[0, inspect ? -1.05 : pose.heading, 0]} scale={inspect ? 4.5 : SIZE[model]} onClick={(event) => { if (onPress && group.current?.visible && sampleDive(elapsed.current, lane, population).opacity > .2) { event.stopPropagation(); onPress(); } }}>
    <primitive object={instance} dispose={null} />
  </group>;
}
