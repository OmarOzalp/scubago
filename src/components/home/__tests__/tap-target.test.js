import { beforeEach, expect, jest, test } from '@jest/globals';

// Three 0.186's ESM entry is outside this Expo Jest transform: a box that counts how often a body is measured stands in for it.
const mockMeasured = jest.fn();
jest.mock('three', () => {
  class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
  class Box3 {
    setFromObject(object) { mockMeasured(object); this.size = object.size; this.middle = object.middle; return this; }
    getCenter(target) { Object.assign(target, this.middle); return target; }
    getSize(target) { Object.assign(target, this.size); return target; }
  }
  return { Box3, Vector3 };
});
jest.mock('@/lib/reef-life', () => ({ REEF_SIZE: {} }));

const { MIN_TAP, tapTarget } = require('../three/tap-target');

/** A clone as measured: its box is `size` across, centred on `middle`. */
const clone = (size, middle = { x: 0, y: .1, z: -.05 }) => ({ size, middle });
beforeEach(() => mockMeasured.mockClear());

test('a slender body gets an oval at least MIN_TAP across on screen; a broad one needs none', () => {
  const slender = tapTarget(clone({ x: .2, y: .3, z: .5 }), 1.5, 1);
  expect(slender).toEqual({ x: 0, y: .1, z: -.05, halfWidth: MIN_TAP / 1.5, halfLength: MIN_TAP / 1.5 });
  expect(tapTarget(clone({ x: 4, y: .3, z: 6 }), 1.5, 1)).toBeNull();
});

test('without a source it measures the clone every time, as it always did', () => {
  const body = clone({ x: .2, y: .3, z: .5 });
  tapTarget(body, 1.5, 1); tapTarget(body, 1.5, 1);
  expect(mockMeasured).toHaveBeenCalledTimes(2);
});

test('with the model the clone came from as its source, the body is measured once for all its clones and every pullback', () => {
  const model = {};
  const first = tapTarget(clone({ x: .2, y: .3, z: .5 }), 1.5, 1, undefined, model);
  // another animal of the same model, its box (as measured later, placed in the world) not the same: the model's body stands
  const second = tapTarget(clone({ x: 9, y: 9, z: 9 }, { x: 3, y: -.4, z: -2 }), 1.5, 1, undefined, model);
  const pulledBack = tapTarget(clone({ x: 9, y: 9, z: 9 }, { x: 3, y: -.4, z: -2 }), 1.5, 3, undefined, model);
  expect(mockMeasured).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);
  // the oval grows with the camera's pullback (the explorer's zoom), from the same body
  expect(pulledBack).toEqual({ x: 0, y: .1, z: -.05, halfWidth: MIN_TAP * 3 / 1.5, halfLength: MIN_TAP * 3 / 1.5 });
  // another model is measured on its own
  tapTarget(clone({ x: .2, y: .3, z: .5 }), 1.5, 1, undefined, {});
  expect(mockMeasured).toHaveBeenCalledTimes(2);
});

test('a fixed shape keeps its place and grows to the same minimum', () => {
  const shape = { z: .22, halfWidth: .09, halfLength: .3 };
  expect(tapTarget(clone({ x: 1, y: 1, z: 1 }), 1.65, 1, shape, {})).toEqual({ x: 0, y: .1, z: .22, halfWidth: Math.max(.09, MIN_TAP / 1.65), halfLength: .3 });
});
