import { Box3, Vector3, type Object3D } from 'three';
import { REEF_SIZE } from '@/lib/reef-life';

/** World length of each model (the reef manta is measured across its wings, the octopus across its arms). */
export const MARINE_SIZE = {
  shark: 2.45, manta: 2.25, 'reef-fish': .85, 'whale-shark': 3, 'tiger-shark': 2.45, 'great-white-shark': 2.5,
  'scalloped-hammerhead': 2.25, 'reef-manta': 2.2, 'mola-mola': 1.8, 'green-turtle': 1.2, 'bottlenose-dolphin': 1.55,
  ...REEF_SIZE,
} as const;

/**
 * The smallest tap target an animal gets, as a half-size in world units at the first level's zoom:
 * about 14 pt on a phone, so the whole target is at least a comfortable 28 pt across.
 */
export const MIN_TAP = .42;

/**
 * Fixed tap targets for the reef's animals, in model units (the middle along the body, half-width and
 * half-length): over the octopus's mantle and inner arms, a compact oval over the cuttlefish, and along
 * the moray's front, the part out of its den. Their bodies themselves are never ray-tested (eight
 * arms, a long body): animated-marine.tsx turns that off.
 */
export const TAP_SHAPES: Partial<Record<keyof typeof MARINE_SIZE, { z: number; halfWidth: number; halfLength: number }>> = {
  'day-octopus': { z: -.04, halfWidth: .3, halfLength: .32 },
  'giant-cuttlefish': { z: 0, halfWidth: .22, halfLength: .45 },
  'giant-moray': { z: .22, halfWidth: .09, halfLength: .3 },
};

/**
 * An invisible tap target for a slender animal (a dolphin seen from above, a reef fish): an oval
 * over its body, in the model's own units, at least MIN_TAP across on screen when the camera has
 * pulled back by `scale` and the model is drawn `size` long. Null when the body is big enough to
 * tap as it is. A fixed `shape` (TAP_SHAPES) is always used, kept to the same minimum.
 */
export function tapTarget(instance: Object3D, size: number, scale = 1, shape?: { z: number; halfWidth: number; halfLength: number }) {
  const box = new Box3().setFromObject(instance), center = box.getCenter(new Vector3()), extent = box.getSize(new Vector3());
  const least = MIN_TAP * scale / size;
  if (shape) return { x: 0, y: center.y, z: shape.z, halfWidth: Math.max(shape.halfWidth, least), halfLength: Math.max(shape.halfLength, least) };
  const halfWidth = extent.x / 2, halfLength = extent.z / 2;
  if (halfWidth >= least && halfLength >= least) return null;
  return { x: center.x, y: center.y, z: center.z, halfWidth: Math.max(halfWidth, least), halfLength: Math.max(halfLength, least) };
}
