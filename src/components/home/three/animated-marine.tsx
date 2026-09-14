import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Group, Mesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { advanceSwimTime, sampleSwimPath, type MarineModel } from '@/lib/swimming';

const SIZE: Record<MarineModel, number> = { shark: 2.45, manta: 2.25, 'reef-fish': .85 };
// The source shark cycle is fast; slower playback gives it a relaxed cruising gait.
const GAIT: Record<MarineModel, number> = { shark: .58, manta: .85, 'reef-fish': .68 };

export function AnimatedMarine({ model, gltf, lane, active, inspect = false, onPress }: {
  model: MarineModel; gltf: GLTF; lane: number; active: boolean; inspect?: boolean; onPress?: () => void;
}) {
  // SkeletonUtils.clone gives each swimmer its own skeleton so several can share one parsed rig.
  const instance = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse((object) => {
      if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    return scene;
  }, [gltf.scene]);
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
    mixer.update(next - elapsed.current);
    elapsed.current = next;
    if (!group.current) return;
    if (inspect) {
      group.current.position.set(0, .2, 0);
      group.current.rotation.set(.04, -.55 + Math.sin(next * .16) * .16, -.04);
    } else {
      const pose = sampleSwimPath(next, lane);
      group.current.position.set(pose.x, pose.y, pose.z);
      group.current.rotation.set(0, pose.heading, pose.bank);
    }
  });

  const pose = sampleSwimPath(0, lane);
  return <group ref={group} position={inspect ? [0, .2, 0] : [pose.x, pose.y, pose.z]} rotation={[0, inspect ? -.55 : pose.heading, 0]} scale={inspect ? 4.5 : SIZE[model]} onClick={(event) => { if (onPress) { event.stopPropagation(); onPress(); } }}>
    <primitive object={instance} dispose={null} />
  </group>;
}
