import { expect, jest, test } from '@jest/globals';
import type { Object3D } from 'three';
import { freezeMatrices, holdStill } from '../three/static-matrix';

/** Stands in for an Object3D (three.js can't be loaded under Jest): what holdStill and freezeMatrices touch, with the class's own updateMatrixWorld on its prototype. */
class Fake {
  matrixAutoUpdate = true;
  updates = 0;
  updateMatrix = jest.fn();
  updateMatrixWorld() { this.updates++; }
}
const fake = () => new Fake() as unknown as Object3D & Fake;

test('a mesh held still has its matrix made once, from the transform it was given, and is no longer recomposed', () => {
  const mesh = fake();
  expect(holdStill(mesh)).toBe(mesh);
  expect(mesh.updateMatrix).toHaveBeenCalledTimes(1);
  expect(mesh.matrixAutoUpdate).toBe(false);
});

test('a frozen subtree is left alone by the scene\'s update, and is brought up again the moment it is unfrozen', () => {
  const root = fake();
  root.updateMatrixWorld();
  expect(root.updates).toBe(1);
  freezeMatrices(root, true);
  root.updateMatrixWorld(); root.updateMatrixWorld();
  expect(root.updates).toBe(1);
  freezeMatrices(root, false);
  root.updateMatrixWorld();
  expect(root.updates).toBe(2);
  // the class's own method is back, not a copy of it
  expect(Object.prototype.hasOwnProperty.call(root, 'updateMatrixWorld')).toBe(false);
});

test('freezing or unfreezing twice changes nothing more, and an object never frozen is left as it is', () => {
  const root = fake(), other = fake();
  freezeMatrices(root, true); freezeMatrices(root, true);
  freezeMatrices(root, false); freezeMatrices(root, false);
  freezeMatrices(other, false);
  root.updateMatrixWorld(); other.updateMatrixWorld();
  expect([root.updates, other.updates]).toEqual([1, 1]);
});

test('each root is frozen on its own', () => {
  const a = fake(), b = fake();
  freezeMatrices(a, true);
  a.updateMatrixWorld(); b.updateMatrixWorld();
  expect([a.updates, b.updates]).toEqual([0, 1]);
});
