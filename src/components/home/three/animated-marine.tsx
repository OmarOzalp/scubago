import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Group, Mesh, SkinnedMesh } from 'three';
import { OceanContext } from './ocean-context';
import { useSceneQuality } from './scene-quality';
import { FLOOR_BIAS, prepareUnderwater, type ReefLook } from './underwater-material';
import { attachSwimRig, swimDrive } from './swim-rig-driver';
import { MARINE_SIZE, TAP_SHAPES, tapTarget } from './tap-target';
import { MOVEMENT, type MarineMotion } from '@/lib/marine-motion';
import { SWIM_RIGS, type SwimDrive, type SwimRigModel } from '@/lib/marine-rigs';
import { sampleDive } from '@/lib/ocean-depth';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { advanceSwimTime, sampleSwimPath, type MarineModel } from '@/lib/swimming';

const SIZE: Record<MarineModel, number> = MARINE_SIZE;
// The source shark cycle is fast; slower playback gives it a relaxed cruising gait. Species clips
// (only played if a rig bone is missing) are already baked at their cruising stroke rate.
const GAIT: Record<MarineModel, number> = {
  shark: .58, manta: .85, 'reef-fish': .68, 'whale-shark': 1, 'tiger-shark': 1, 'great-white-shark': 1, 'scalloped-hammerhead': 1, 'reef-manta': 1, 'mola-mola': 1,
  'green-turtle': 1, 'bottlenose-dolphin': 1, 'day-octopus': 1, 'giant-cuttlefish': 1, 'giant-moray': 1,
};
const rigModel = (model: MarineModel) => (Object.hasOwn(SWIM_RIGS, model) ? model as SwimRigModel : null);
/** The reef's animals draw with their own look: those on the bottom set back, all with color states (and the moray's den). */
function reefLook(model: MarineModel): ReefLook | undefined {
  const habitat = MOVEMENT[model].habitat ?? 'open-water';
  return habitat === 'open-water' ? undefined : { bias: habitat === 'reef-edge' ? 0 : FLOOR_BIAS };
}
/** In the close-up the reef's animals show their own way of moving: the octopus walking, the cuttlefish hovering, the moray breathing in its den. */
const CLOSE_UP: Partial<Record<MarineModel, Partial<SwimDrive>>> = {
  'day-octopus': { effort: .8 }, 'giant-cuttlefish': { effort: .25 }, 'giant-moray': { effort: .25, rest: 1 },
};

export function AnimatedMarine({ model, gltf, lane, active, inspect = false, population = 1, motion, onPress, tapScale = 1 }: {
  model: MarineModel; gltf: GLTF; lane: number; active: boolean; inspect?: boolean; population?: number; motion?: MarineMotion; onPress?: () => void;
  /** How much farther the camera has pulled back (the ocean's scale), so tap targets keep their size on screen. */
  tapScale?: number;
}) {
  // The island's water (absent in the close-up), so the animal tints and refracts with the same waves.
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  // SkeletonUtils.clone gives each swimmer its own skeleton so several can share one parsed rig.
  const { instance, underwater } = useMemo(() => {
    const scene = clone(gltf.scene), reef = reefLook(model);
    scene.traverse((object) => {
      if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; }
      if (object instanceof SkinnedMesh) object.frustumCulled = false;
      // Reef animals are tapped by a simple shape (TAP_SHAPES), never by testing every arm.
      if (object instanceof Mesh && reef) object.raycast = () => {};
    });
    return { instance: scene, underwater: inspect ? null : prepareUnderwater(scene, ocean ?? undefined, lite, reef) };
  }, [gltf.scene, inspect, ocean, lite, model]);
  useEffect(() => () => underwater?.dispose(), [underwater]);
  // Species models swim procedurally so tail beats and wing strokes follow speed and turns;
  // family representatives play their artist-authored clip.
  const swimRig = useMemo(() => {
    const species = rigModel(model);
    const rig = species ? attachSwimRig(instance, species, lane * 2.3) : null;
    return rig?.complete ? rig : null;
  }, [instance, model, lane]);
  const mixer = useMemo(() => new AnimationMixer(instance), [instance]);
  // Slender animals get an invisible tap target over their body that moves (and leaps) with them.
  const target = useMemo(() => (inspect || !onPress ? null : tapTarget(instance, SIZE[model], tapScale, TAP_SHAPES[model])), [instance, inspect, onPress, model, tapScale]);
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  // Without a shared motion, pitch follows the rise and fall through the water, eased so it never snaps.
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
      swimRig?.update(dt, { effort: 1, turn: .22 * .16 * Math.cos(next * .16), curvature: 0, climb: 0, ...CLOSE_UP[model] });
      group.current.position.set(0, .2, 0);
      group.current.rotation.set(.04, yaw, -.04);
    } else {
      const pose = swimming ?? sampleSwimPath(next, lane);
      // Dive on the school's clock, which is what the others follow when making room for this animal (a
      // group member dives with its group).
      const clock = motion ? motion.clock() : next;
      const dive = motion ? motion.dive(lane, clock) : sampleDive(clock, lane, population);
      if (swimRig && dt > 0) {
        const sink = ((motion ? motion.dive(lane, clock - dt) : sampleDive(clock - dt, lane, population)).y - dive.y) / dt;
        swimRig.update(dt, swimDrive(swimming, SIZE[model], sink));
      }
      const y = pose.y + dive.y, v = vertical.current;
      // The shared motion pitches the body along its path (a leap included); on its own, from its rise and fall.
      if (swimming) v.pitch = swimming.pitch;
      else if (dt > 0 && Number.isFinite(v.y)) {
        const nose = Math.max(-.22, Math.min(.22, (v.y - y) / dt * (MOVEMENT[model].pitch ?? .35)));
        v.pitch += (nose - v.pitch) * (1 - Math.exp(-dt * 1.6));
      }
      v.y = y;
      group.current.visible = dive.visible;
      group.current.position.set(pose.x, y, pose.z);
      underwater?.setDepth(dive.depth, dive.surfacing);
      // Reef animals: a color state, and how much of it is out of sight in its den.
      if (swimming?.tone && swimming.hide) {
        underwater?.setTone(swimming.tone[0], swimming.tone[1], swimming.tone[2]);
        underwater?.setHide(swimming.hide[0], swimming.hide[1]);
      }
      // Yaw, then pitch about the animal's own lateral axis (positive = nose down), then roll into the turn.
      group.current.rotation.set(v.pitch, pose.heading, pose.bank, 'YXZ');
    }
    if (!swimRig) mixer.update(dt * (inspect ? 1 : (swimming?.effort ?? 1)));
  });

  const pose = motion?.get(lane) ?? sampleSwimPath(0, lane);
  const dive = motion ? motion.dive(lane, 0) : sampleDive(0, lane, population);
  return <group ref={group} position={inspect ? [0, .2, 0] : [pose.x, pose.y + dive.y, pose.z]} rotation={[0, inspect ? -1.05 : pose.heading, 0]} scale={inspect ? 4.5 : SIZE[model]} onClick={(event) => { if (onPress && group.current?.visible && (motion ? motion.dive(lane) : sampleDive(elapsed.current, lane, population)).opacity > .2) { event.stopPropagation(); onPress(); } }}>
    <primitive object={instance} dispose={null} />
    {target && <mesh visible={false} position={[target.x, target.y, target.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[target.halfWidth, target.halfLength, 1]}>
      <circleGeometry args={[1, 16]} />
    </mesh>}
  </group>;
}
