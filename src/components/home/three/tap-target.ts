import { Box3, Vector3, type Object3D } from 'three';

/** World length of each model (the reef manta is measured across its wings). */
export const MARINE_SIZE = {
  shark: 2.45, manta: 2.25, 'reef-fish': .85, 'whale-shark': 3, 'tiger-shark': 2.45, 'great-white-shark': 2.5,
  'scalloped-hammerhead': 2.25, 'reef-manta': 2.2, 'mola-mola': 1.8, 'green-turtle': 1.2, 'bottlenose-dolphin': 1.55,
} as const;

/**
 * The smallest tap target an animal gets, as a half-size in world units at the first level's zoom:
 * about 14 pt on a phone, so the whole target is at least a comfortable 28 pt across.
 */
export const MIN_TAP = .42;

/**
 * An invisible tap target for a slender animal (a dolphin seen from above, a reef fish): an oval
 * over its body, in the model's own units, at least MIN_TAP across on screen when the camera has
 * pulled back by `scale` and the model is drawn `size` long. Null when the body is big enough to
 * tap as it is.
 */
export function tapTarget(instance: Object3D, size: number, scale = 1) {
  const box = new Box3().setFromObject(instance), center = box.getCenter(new Vector3()), extent = box.getSize(new Vector3());
  const least = MIN_TAP * scale / size, halfWidth = extent.x / 2, halfLength = extent.z / 2;
  if (halfWidth >= least && halfLength >= least) return null;
  return { x: center.x, y: center.y, z: center.z, halfWidth: Math.max(halfWidth, least), halfLength: Math.max(halfLength, least) };
}
