import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { PixelRatio, View } from 'react-native';
import { nextFrameDelay, SceneCanvas } from '../three/scene-canvas.native';
import { useSceneQuality } from '../three/scene-quality';

jest.mock('expo-device', () => ({ isDevice: false }));
const mockInvalidate = jest.fn();
let mockFrame;
jest.mock('@react-three/fiber/native', () => ({
  Canvas: (props) => <canvas {...props} />,
  useThree: (select) => select({ invalidate: (...args) => mockInvalidate(...args) }),
  useFrame: (callback) => { mockFrame = callback; },
}));
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockInvalidate.mockClear();
  mockFrame = undefined;
  jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
const layout = () => act(async () => root.root.findByType(View).props.onLayout({ nativeEvent: { layout: { width: 360, height: 330 } } }));
/** One simulator frame whose GL work takes `cost` ms before the worker catches up. */
const frame = (cost) => {
  const gl = { render: jest.fn(), getContext: () => ({ flushEXP: () => jest.advanceTimersByTime(cost) }) };
  mockFrame({ gl, scene: {}, camera: {} });
  return gl;
};

test('simulator draws at one physical pixel per displayed point while keeping the full visible size', async () => {
  await act(async () => { root = create(<SceneCanvas frameloop="always" />); });
  expect(root.root.findAllByType('canvas')).toHaveLength(0);
  await layout();
  const canvas = root.root.findByType('canvas');
  expect(canvas.props.style.width * PixelRatio.get()).toBe(360);
  expect(canvas.props.style.height * PixelRatio.get()).toBe(330);
  expect(canvas.props.style.width * canvas.props.style.transform[0].scale).toBe(360);
  // Fiber's native Canvas applies `{ flex: 1, ...style }`: flex must not stretch the reduced height back out.
  expect({ flex: 1, ...canvas.props.style }.flex).toBe(0);
  expect(canvas.props.frameloop).toBe('demand');
});

test('simulator requests the next frame only after the GL worker has drawn the last one', async () => {
  await act(async () => { root = create(<SceneCanvas frameloop="always" />); });
  await layout();
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  mockInvalidate.mockClear();
  // A quick frame keeps the 20fps ceiling; a slow one leaves the JS thread idle for most of its length.
  const gl = frame(30);
  expect(gl.render).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(nextFrameDelay(30) - 1));
  expect(mockInvalidate).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  frame(100);
  await act(async () => jest.advanceTimersByTime(79));
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1));
  expect(mockInvalidate).toHaveBeenCalledTimes(2);
  // Paused scenes still draw frames on demand but schedule no more.
  await act(async () => root.update(<SceneCanvas frameloop="demand" />));
  mockInvalidate.mockClear();
  frame(30);
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test('frame pacing never exceeds 20fps and stays idle for most of a slow frame', () => {
  expect(nextFrameDelay(10)).toBe(40);
  expect(nextFrameDelay(30)).toBe(24);
  expect(nextFrameDelay(100)).toBe(80);
});

test('the simulator renders the scene at lite quality', async () => {
  const Probe = () => <probe quality={useSceneQuality()} />;
  await act(async () => { root = create(<SceneCanvas frameloop="always"><Probe /></SceneCanvas>); });
  await layout();
  expect(root.root.findByType('probe').props.quality).toBe('lite');
});
