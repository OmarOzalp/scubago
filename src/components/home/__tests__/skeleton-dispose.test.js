import { expect, jest, test } from '@jest/globals';
import { disposeSkeletons } from '../three/skeleton-dispose';

/** A scene graph reduced to what disposeSkeletons reads: objects it can walk, some of them skinned meshes. */
const skinned = () => ({ isSkinnedMesh: true, skeleton: { dispose: jest.fn() } });
const plain = () => ({ isMesh: true, skeleton: { dispose: jest.fn() } });
const graph = (...children) => ({ traverse: (visit) => { visit({}); children.forEach(visit); } });

test('every skinned mesh of a clone frees its own bone texture', () => {
  const a = skinned(), b = skinned();
  disposeSkeletons(graph(a, b));
  expect(a.skeleton.dispose).toHaveBeenCalledTimes(1);
  expect(b.skeleton.dispose).toHaveBeenCalledTimes(1);
});

test('only skinned meshes are touched, and a skinned mesh without a skeleton is skipped', () => {
  const mesh = plain(), bare = { isSkinnedMesh: true };
  expect(() => disposeSkeletons(graph(mesh, bare))).not.toThrow();
  expect(mesh.skeleton.dispose).not.toHaveBeenCalled();
});

test('freeing twice is harmless: the skeleton is told each time and makes its texture anew if drawn again', () => {
  const a = skinned(), root = graph(a);
  disposeSkeletons(root); disposeSkeletons(root);
  expect(a.skeleton.dispose).toHaveBeenCalledTimes(2);
});
