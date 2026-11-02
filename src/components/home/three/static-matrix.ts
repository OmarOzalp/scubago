import type { Object3D } from 'three';

/**
 * three.js recomposes every object's matrix from its position, rotation and scale, and multiplies it into the world matrix, at every
 * frame, for every object in the scene whether it moves or not. A mesh that is made once, in place, and never moves (a coast, a forest,
 * the ocean's layers, a rock) has nothing to recompose: call this once its transform is set, and the frame skips that work for it (its
 * world matrix still follows whatever it is inside, so a group that grows or rises carries it along). Do not move it afterwards.
 */
export function holdStill<T extends Object3D>(object: T): T {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
  return object;
}

/**
 * Whether `root`'s matrices are being left alone. three.js always walks into an object's children, so a whole subtree (an animal's skeleton,
 * dozens of bones) is skipped by giving its root a method of its own that does nothing, for as long as the subtree is not drawn. The world
 * matrices below it are then those of the last frame it was kept up, which nothing reads while it is hidden: call `freezeMatrices(root, false)`
 * before the next frame is drawn (the frame it is shown again, before the renderer updates the scene) and the next update brings it up to date.
 */
export function freezeMatrices(root: Object3D, frozen: boolean): void {
  if (frozen === frozenRoots.has(root)) return;
  if (frozen) { frozenRoots.add(root); root.updateMatrixWorld = skip; }
  else { frozenRoots.delete(root); delete (root as { updateMatrixWorld?: unknown }).updateMatrixWorld; }
}
/** The roots whose update is switched off (they have no method of their own otherwise). */
const frozenRoots = new WeakSet<Object3D>();
const skip = () => {};
