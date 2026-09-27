import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Group, Mesh, SkinnedMesh } from 'three';
import { OceanContext } from './ocean-context';
import { useSceneQuality } from './scene-quality';
import { prepareUnderwater } from './underwater-material';
import { attachSwimRig, swimDrive } from './swim-rig-driver';
import type { MarineMotion } from '@/lib/marine-motion';
import { SWIM_RIGS, type SwimRigModel } from '@/lib/marine-rigs';
import { sampleDive } from '@/lib/ocean-depth';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { advanceSwimTime, sampleSwimPath, type MarineModel } from '@/lib/swimming';

// World length of each model (the reef manta is measured across its wings).
const SIZE: Record<MarineModel, number> = { shark: 2.45, manta: 2.25, 'reef-fish': .85, 'whale-shark': 3, 'tiger-shark': 2.45, 'great-white-shark': 2.5, 'reef-manta': 2.2, 'mola-mola': 1.8, 'green-turtle': 1.2 };
// The source shark cycle is fast; slower playback gives it a relaxed cruising gait. Species clips
// (only played if a rig bone is missing) are already baked at their cruising stroke rate.
const GAIT: Record<MarineModel, number> = { shark: .58, manta: .85, 'reef-fish': .68, 'whale-shark': 1, 'tiger-shark': 1, 'great-white-shark': 1, 'reef-manta': 1, 'mola-mola': 1, 'green-turtle': 1 };
const rigModel = (model: MarineModel) => (Object.hasOwn(SWIM_RIGS, model) ? model as SwimRigModel : null);

export function AnimatedMarine({ model, gltf, lane, active, inspect = false, population = 1, motion, onPress }: {
  model: MarineModel; gltf: GLTF; lane: number; active: boolean; inspect?: boolean; population?: number; motion?: MarineMotion; onPress?: () => void;
}) {
  // The island's water (absent in the close-up), so the animal tints and refracts with the same waves.
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  // SkeletonUtils.clone gives each swimmer its own skeleton so several can share one parsed rig.
  const { instance, underwater } = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse((object) => {
      if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; }
      if (object instanceof SkinnedMesh) object.frustumCulled = false;
    });
    return { instance: scene, underwater: inspect ? null : prepareUnderwater(scene, ocean ?? undefined, lite) };
  }, [gltf.scene, inspect, ocean, lite]);
  useEffect(() => () => underwater?.dispose(), [underwater]);
  // Species models swim procedurally so tail beats and wing strokes follow speed and turns;
  // family representatives play their artist-authored clip.
  const swimRig = useMemo(() => {
    const species = rigModel(model);
    const rig = species ? attachSwimRig(instance, species, lane * 2.3) : null;
    return rig?.complete ? rig : null;
  }, [instance, model, lane]);
  const mixer = useMemo(() => new AnimationMixer(instance), [instance]);
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  // Pitch follows the actual rise and fall through the water, eased so it never snaps.
  const vertical = useRef({ y: NaN, pitch: 0 });

  useEffect(() => {
    if (swimRig) return;
    const clip = gltf.animations.find((animation) => animation.name.includes('Swim')) ?? gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.timeScale = GAIT[model];
    action.time = (lane * .317) % clip.duration;
    action.play();
    mixer.update(0);
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(instance); };
  }, [gltf.animations, instance, lane, mixer, model, swimRig]);

  useFrame((_, delta) => {
    const previous = elapsed.current;
    const next = advanceSwimTime(previous, delta, active);
    const dt = next - previous;
    elapsed.current = next;
    const swimming = motion?.get(lane);
    if (!group.current) return;
    if (inspect) {
      const yaw = -1.05 + Math.sin(next * .16) * .22;
      swimRig?.update(dt, { effort: 1, turn: .22 * .16 * Math.cos(next * .16), curvature: 0, climb: 0 });
      group.current.position.set(0, .2, 0);
      group.current.rotation.set(.04, yaw, -.04);
    } else {
      const pose = swimming ?? sampleSwimPath(next, lane);
      const dive = sampleDive(next, lane, population);
      if (swimRig && dt > 0) {
        const sink = (sampleDive(previous, lane, population).y - dive.y) / dt;
        swimRig.update(dt, swimDrive(swimming, SIZE[model], sink));
      }
      const y = pose.y + dive.y, v = vertical.current;
      if (dt > 0 && Number.isFinite(v.y)) {
        const nose = Math.max(-.22, Math.min(.22, (v.y - y) / dt * .35));
        v.pitch += (nose - v.pitch) * (1 - Math.exp(-dt * 1.6));
      }
      v.y = y;
      group.current.visible = dive.visible;
      group.current.position.set(pose.x, y, pose.z);
      underwater?.setDepth(dive.depth, dive.surfacing);
      // Yaw, then pitch about the animal's own lateral axis (positive = nose down), then roll into the turn.
      group.current.rotation.set(v.pitch, pose.heading, pose.bank, 'YXZ');
    }
    if (!swimRig) mixer.update(dt * (inspect ? 1 : (swimming?.effort ?? 1)));
  });

  const pose = motion?.get(lane) ?? sampleSwimPath(0, lane);
  const dive = sampleDive(0, lane, population);
  return <group ref={group} position={inspect ? [0, .2, 0] : [pose.x, pose.y + dive.y, pose.z]} rotation={[0, inspect ? -1.05 : pose.heading, 0]} scale={inspect ? 4.5 : SIZE[model]} onClick={(event) => { if (onPress && group.current?.visible && sampleDive(elapsed.current, lane, population).opacity > .2) { event.stopPropagation(); onPress(); } }}>
    <primitive object={instance} dispose={null} />
  </group>;
}
