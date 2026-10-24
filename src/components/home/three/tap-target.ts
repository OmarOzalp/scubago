import { Box3, Vector3, type Object3D } from 'three';
import { REEF_SIZE } from '@/lib/reef-life';
import { VIEW_ZOOM } from '@/lib/steering';

/**
 * World length of each model (the mantas and eagle ray are measured across their wings, the
 * octopus across its arms, the jellyfish across its bell).
 */
export const MARINE_SIZE = {
  shark: 2.45, manta: 2.25, 'reef-fish': .85, 'whale-shark': 3, 'tiger-shark': 2.45, 'great-white-shark': 2.5,
  'scalloped-hammerhead': 2.25, 'reef-manta': 2.2, 'mola-mola': 1.8, 'green-turtle': 1.2, 'bottlenose-dolphin': 1.55,
  'great-barracuda': 1.6, sailfish: 2.2, 'california-sea-lion': 1.35, 'spotted-eagle-ray': 1.4, 'golden-jellyfish': .48,
  'humpback-whale': 3.3, 'sperm-whale': 3.1, 'oceanic-whitetip': 2.3, 'leatherback-turtle': 1.5, 'oceanic-manta': 2.6,
  'harbor-seal': 1.3, 'sea-otter': 1, garibaldi: .5, 'leafy-seadragon': .56, orca: 2.4,
  'marine-iguana': .95, 'galapagos-shark': 2.3, 'thresher-shark': 2.9, 'giant-trevally': .95, 'king-angelfish': .5,
  dugong: 1.6, sawfish: 2.7, 'lemon-shark': 2.3, 'southern-stingray': 1, tarpon: 1.5,
  'grey-reef-shark': 1.95, 'blacktip-reef-shark': 1.65, 'whitetip-reef-shark': 1.8, 'hawksbill-turtle': 1.15, 'napoleon-wrasse': 1.45, 'bumphead-parrotfish': 1.15,
  'sand-tiger-shark': 2.5, 'loggerhead-turtle': 1.35, 'goliath-grouper': 1.75, lionfish: .5, batfish: .62,
  ...REEF_SIZE,
} as const;

/**
 * The smallest tap target an animal gets, as a half-size in world units at the first level's zoom:
 * about 14 pt on a phone, so the whole target is at least a comfortable 28 pt across (the farther out
 * the view, VIEW_ZOOM, the more units that is).
 */
export const MIN_TAP = .42 * VIEW_ZOOM;
/**
 * A press that moved farther than this between finger down and up (pixels) was a drag across the
 * water (the explorer pans), not a tap on an animal.
 */
export const TAP_SLOP = 8;
/** MIN_TAP on screen (points): the half-size a tap target keeps, at any zoom. */
export const MIN_TAP_POINTS = 14;
/** The `scale` tapTarget takes in the island explorer, zoomed to `zoom` points per unit: targets stay MIN_TAP_POINTS however close it looks. */
export const tapScaleAt = (zoom: number) => MIN_TAP_POINTS / (MIN_TAP * zoom);

/**
 * Fixed tap targets for the reef's animals, in model units (the middle along the body, half-width and
 * half-length): over the octopus's mantle and inner arms, a compact oval over the cuttlefish, along
 * the moray's front, the part out of its den, and over each clownfish (grown to the minimum size). Their bodies themselves are never ray-tested (eight
 * arms, a long body): animated-marine.tsx turns that off.
 */
export const TAP_SHAPES: Partial<Record<keyof typeof MARINE_SIZE, { z: number; halfWidth: number; halfLength: number }>> = {
  'day-octopus': { z: -.04, halfWidth: .3, halfLength: .32 },
  'giant-cuttlefish': { z: 0, halfWidth: .22, halfLength: .45 },
  'giant-moray': { z: .22, halfWidth: .09, halfLength: .3 },
  clownfish: { z: 0, halfWidth: .2, halfLength: .45 },
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
