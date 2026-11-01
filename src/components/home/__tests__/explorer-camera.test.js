import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { createExplorer } from '@/lib/explorer-view';
import { ExplorerCamera } from '../three/explorer-camera';

// Three 0.186's ESM entry is outside this Expo Jest transform: a camera the explorer can move stands in for it.
jest.mock('three', () => ({
  OrthographicCamera: class { constructor() { this.position = { set() {} }; } lookAt() {} updateProjectionMatrix() {} },
}));
const mockInvalidate = jest.fn();
let mockFrame;
jest.mock('@react-three/fiber', () => ({
  useThree: (select) => select({ width: 390, size: { width: 390 }, invalidate: (...args) => mockInvalidate(...args) }),
  useFrame: (callback) => { mockFrame = callback; },
}));
const { OrthographicCamera } = require('three');

const PHONE = { width: 390, height: 844, level: 1 };
let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockInvalidate.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const frame = (explorer) => mockFrame({ camera: new OrthographicCamera() }, 1 / 60);
const opened = () => { const explorer = createExplorer(PHONE); explorer.resize(PHONE); return explorer; };

test('while nothing touches it the camera asks for no more frames: the scene paces itself (30 a second)', async () => {
  const explorer = opened();
  await act(async () => { root = create(<ExplorerCamera explorer={explorer} />); });
  frame();
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test('a finger down draws at every refresh, resting or not, until it lifts', async () => {
  const explorer = opened();
  await act(async () => { root = create(<ExplorerCamera explorer={explorer} />); });
  explorer.touch([{ id: 1, x: 0, y: 0 }], 0);
  mockInvalidate.mockClear();
  frame(); frame();
  expect(mockInvalidate).toHaveBeenCalledTimes(2);
  explorer.touch([], 40);
  mockInvalidate.mockClear();
  frame();
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test('an eased move (a zoom button) draws at every refresh until it settles', async () => {
  const explorer = opened();
  await act(async () => { root = create(<ExplorerCamera explorer={explorer} />); });
  explorer.zoomBy(1.5);
  mockInvalidate.mockClear();
  frame();
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 400 && explorer.moving; i++) explorer.step(1 / 60);
  mockInvalidate.mockClear();
  frame();
  expect(mockInvalidate).not.toHaveBeenCalled();
});
