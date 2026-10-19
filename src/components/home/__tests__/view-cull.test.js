import { expect, test } from '@jest/globals';
import { onScreen } from '../three/view-cull';

// A camera looking straight down its own axis at a 10 × 10 unit view (an orthographic camera's matrices, column-major).
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const camera = (x = 0) => ({
  matrixWorldInverse: { elements: identity.map((v, i) => (i === 12 ? -x : v)) },
  projectionMatrix: { elements: identity.map((v, i) => (i === 0 || i === 5 ? .2 : v)) },
});

test('something is on screen while any of it, within its reach, can be in view', () => {
  expect(onScreen(camera(), { x: 0, y: 0, z: 0 }, 0, 0, 0)).toBe(true);
  // Past the edge (5 units across), seen only as far as its reach takes it back in.
  expect(onScreen(camera(), { x: 6, y: 0, z: 0 }, 0, 0, 0)).toBe(false);
  expect(onScreen(camera(), { x: 6, y: 0, z: 0 }, 1.5, 0, 0)).toBe(true);
  expect(onScreen(camera(), { x: 0, y: 6.5, z: 0 }, 0, 1, 0)).toBe(false);
  expect(onScreen(camera(), { x: 0, y: 6.5, z: 0 }, 0, 1, 1)).toBe(true);
  // The camera moved over: what was off to the side is in the middle.
  expect(onScreen(camera(12), { x: 12, y: 0, z: 0 }, 0, 0, 0)).toBe(true);
  expect(onScreen(camera(12), { x: 0, y: 0, z: 0 }, 3, 3, 0)).toBe(false);
});
