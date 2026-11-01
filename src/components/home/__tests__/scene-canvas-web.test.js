import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { LEAD_MS } from '../three/frame-pacer';
// (the web canvas, by its full name: jest-expo would pick scene-canvas.native.tsx)
import { SceneCanvas } from '../three/scene-canvas.tsx';

const mockInvalidate = jest.fn();
let mockFrame;
jest.mock('@react-three/fiber', () => ({
  Canvas: (props) => <canvas {...props} />,
  useThree: (select) => select({ invalidate: (...args) => mockInvalidate(...args) }),
  useFrame: (callback) => { mockFrame = callback; },
}));
let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); mockInvalidate.mockClear(); mockFrame = undefined; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });
const canvas = () => root.root.findByType('canvas');

test('an ambient scene in a browser draws 30 times a second: on demand, a frame asked for every 1/30 s while it animates', async () => {
  await act(async () => { root = create(<SceneCanvas frameloop="always" />); });
  expect(canvas().props.frameloop).toBe('demand');
  expect(canvas().props.fps).toBeUndefined();
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  mockInvalidate.mockClear();
  mockFrame();
  await act(async () => jest.advanceTimersByTime(1000 / 30 - LEAD_MS - 1));
  expect(mockInvalidate).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
});

test('a scene that is paused or hidden (frameloop demand) schedules nothing, and one asked for 60 stays on always', async () => {
  await act(async () => { root = create(<SceneCanvas frameloop="demand" />); });
  expect(canvas().props.frameloop).toBe('demand');
  mockInvalidate.mockClear();
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).not.toHaveBeenCalled();
  await act(async () => root.update(<SceneCanvas frameloop="always" fps={60} />));
  expect(canvas().props.frameloop).toBe('always');
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test('with no frameloop given the canvas is an always-on loop paced like any other', async () => {
  await act(async () => { root = create(<SceneCanvas />); });
  expect(canvas().props.frameloop).toBe('demand');
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
});
