import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, Group, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { advanceSwimTime, sampleSwimPath, type MarineModel } from '@/lib/swimming';
import { marineAssetUri } from './marine-assets';

export function AnimatedMarine({ model, lane, active, inspect = false, onPress }: {
  model: MarineModel; lane: number; active: boolean; inspect?: boolean; onPress?: () => void;
}) {
  const gltf = useLoader(GLTFLoader, marineAssetUri(model));
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
  const size = model === 'shark' ? 2.45 : model === 'manta' ? 2.25 : .85;

  useEffect(() => {
    const clip = gltf.animations.find((animation) => animation.name.includes('Swim')) ?? gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    // The source shark cycle is fast; slower playback gives it a relaxed cruising gait.
    action.timeScale = model === 'shark' ? .58 : model === 'manta' ? .85 : .68;
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
  return <group ref={group} position={inspect ? [0, .2, 0] : [pose.x, pose.y, pose.z]} rotation={[0, inspect ? -.55 : pose.heading, 0]} scale={inspect ? 4.5 : size} onClick={(event) => { if (onPress) { event.stopPropagation(); onPress(); } }}>
    <primitive object={instance} dispose={null} />
  </group>;
}
