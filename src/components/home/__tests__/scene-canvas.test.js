import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { AppState, PixelRatio, View } from 'react-native';
import { nextSimulatorDelay, SceneCanvas, SIMULATOR_FRAME_MS } from '../three/scene-canvas.native';

jest.mock('expo-device', () => ({ isDevice: false }));
const mockInvalidate = jest.fn();
const mockFlush = jest.fn();
const mockState = { invalidate: (...args) => mockInvalidate(...args), gl: { getContext: () => ({ flushEXP: () => mockFlush() }) } };
jest.mock('@react-three/fiber/native', () => ({ Canvas: (props) => <canvas {...props} />, useThree: (select) => select(mockState) }));
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockInvalidate.mockClear();
  mockFlush.mockClear();
  AppState.currentState = 'active';
  jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function layout() {
  await act(async () => { root = create(<SceneCanvas frameloop="always" />); });
  expect(root.root.findAllByType('canvas')).toHaveLength(0);
  await act(async () => root.root.findByType(View).props.onLayout({ nativeEvent: { layout: { width: 360, height: 330 } } }));
  return root.root.findByType('canvas');
}

test('simulator draws at one physical pixel per displayed point while keeping the full visible size', async () => {
  const canvas = await layout();
  expect(canvas.props.style.width * PixelRatio.get()).toBe(360);
  expect(canvas.props.style.height * PixelRatio.get()).toBe(330);
  expect(canvas.props.style.width * canvas.props.style.transform[0].scale).toBe(360);
  // Fiber's native Canvas applies `{ flex: 1, ...style }`; flex must not stretch the reduced height back out.
  expect({ flex: 1, ...canvas.props.style }.flex).toBe(0);
  expect(canvas.props.frameloop).toBe('demand');
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).toHaveBeenCalledTimes(20);
  // Each frame first waits for the previous one to leave the GL queue.
  expect(mockFlush).toHaveBeenCalledTimes(20);
  await act(async () => root.update(<SceneCanvas frameloop="demand" />));
  expect(root.root.findByType('canvas').props.frameloop).toBe('demand');
  mockInvalidate.mockClear();
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test('simulator frames never block on the GL queue while the app is not active', async () => {
  AppState.currentState = 'inactive';
  await layout();
  await act(async () => jest.advanceTimersByTime(200));
  expect(mockInvalidate).toHaveBeenCalledTimes(4);
  expect(mockFlush).not.toHaveBeenCalled();
});

test('simulator pacing slows to the GL queue and recovers once it keeps up', () => {
  const { min, max } = SIMULATOR_FRAME_MS;
  expect(nextSimulatorDelay(min, 0)).toBe(min);
  // The previous frame was still drawing 150ms after the next was due: allow for it.
  const slowed = nextSimulatorDelay(min, 150);
  expect(slowed).toBeGreaterThanOrEqual(min + 150);
  expect(nextSimulatorDelay(max, 5000)).toBe(max);
  let delay = max;
  for (let i = 0; i < 14; i++) delay = nextSimulatorDelay(delay, 0);
  expect(delay).toBe(min);
});
