import type { Object3D, Skeleton } from 'three';

/**
 * Frees the bone textures of a cloned animal. SkeletonUtils.clone gives every clone skeletons of its
 * own, and each one's bone texture is uploaded to the GPU on the clone's first frame; nothing else
 * ever frees it (the clone itself is never disposed: its geometry and materials are the parsed
 * model's, or are freed by prepareUnderwater), so every animal that left, on a switch of island,
 * a turn of the lineup or the explorer closing, left one behind. A skeleton that is drawn again
 * makes its texture anew, so this is safe at any time. Checked by flag, like prepareUnderwater, so
 * meshes built by another copy of three.js qualify too.
 */
export function disposeSkeletons(root: Object3D) {
  root.traverse((object) => {
    const skeleton = (object as { isSkinnedMesh?: boolean; skeleton?: Skeleton }).isSkinnedMesh ? (object as { skeleton?: Skeleton }).skeleton : undefined;
    skeleton?.dispose();
  });
}
