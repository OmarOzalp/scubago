import type { Object3D } from 'three';
import type { MarinePose } from '@/lib/marine-motion';
import { createSwimRig, RIG_EULER_ORDER, type SwimDrive, type SwimRigModel } from '@/lib/marine-rigs';

/**
 * Translate a swimmer's movement into rig inputs: speed sets stroke rate, the
 * heading change bends the body along its path (in body lengths, hence `size`),
 * and rising or sinking through the water column changes stroke strength.
 */
export function swimDrive(pose: Pick<MarinePose, 'pace' | 'turn' | 'speed' | 'climb'> & Partial<Pick<MarinePose, 'air' | 'rest' | 'jet' | 'ground'>> | undefined, size: number, sink = 0): SwimDrive {
  const turn = pose?.turn ?? 0;
  return {
    effort: pose?.pace ?? 1,
    turn,
    curvature: turn / Math.max(pose?.speed ?? .3, .05) * size,
    climb: Math.max(-1, Math.min(1, (pose?.climb ?? 0) * .5 - sink * 2)),
    // Out of the water (a leap), the stroke stills and the body stretches out.
    air: pose?.air ?? 0,
    // Reef animals: resting in place, jetting, walking on the bottom (reef-life.ts).
    rest: pose?.rest, jet: pose?.jet, ground: pose?.ground,
  };
}

/**
 * Drive one cloned species skeleton from its procedural swim rig. Bones are
 * looked up once by name; each update eases the rig toward the swimmer's
 * current speed, turn and climb and writes the pose back to the bones.
 */
export function attachSwimRig(instance: Object3D, model: SwimRigModel, phase = 0) {
  const rig = createSwimRig(model, phase);
  const bones = rig.bones.map((name) => instance.getObjectByName(name));
  const root = bones[rig.bones.indexOf('Root')];
  const rest = root?.position.clone();
  const apply = () => {
    for (let i = 0; i < bones.length; i++) {
      bones[i]?.rotation.set(rig.rotation[i * 3], rig.rotation[i * 3 + 1], rig.rotation[i * 3 + 2], RIG_EULER_ORDER);
    }
    // Mantles breathe and squeeze (only the few bones a rig scales).
    for (const i of rig.scaled) bones[i]?.scale.set(rig.scale[i * 3], rig.scale[i * 3 + 1], rig.scale[i * 3 + 2]);
    if (root && rest) root.position.set(rest.x + rig.offset.x, rest.y + rig.offset.y, rest.z + rig.offset.z);
  };
  apply();
  return {
    rig,
    /** True when every bone the rig drives exists in this asset. */
    complete: bones.every(Boolean),
    update(dt: number, drive: SwimDrive) { rig.step(dt, drive); apply(); },
    sample(at: number, drive?: SwimDrive) { rig.sample(at, drive); apply(); },
  };
}
export type AttachedSwimRig = ReturnType<typeof attachSwimRig>;
