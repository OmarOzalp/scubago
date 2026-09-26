import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { PixelRatio, View } from 'react-native';
import { SceneCanvas } from '../three/scene-canvas.native';

jest.mock('expo-device', () => ({ isDevice: false }));
const mockInvalidate = jest.fn();
jest.mock('@react-three/fiber/native', () => ({ Canvas: (props) => <canvas {...props} />, useThree: (select) => select({ invalidate: (...args) => mockInvalidate(...args) }) }));
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockInvalidate.mockClear();
  jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test('simulator draws at one physical pixel per displayed point while keeping the full visible size', async () => {
  await act(async () => { root = create(<SceneCanvas frameloop="always" />); });
  expect(root.root.findAllByType('canvas')).toHaveLength(0);
  await act(async () => root.root.findByType(View).props.onLayout({ nativeEvent: { layout: { width: 360, height: 330 } } }));
  const canvas = root.root.findByType('canvas');
  expect(canvas.props.style.width * PixelRatio.get()).toBe(360);
  expect(canvas.props.style.height * PixelRatio.get()).toBe(330);
  expect(canvas.props.style.width * canvas.props.style.transform[0].scale).toBe(360);
  expect(canvas.props.frameloop).toBe('demand');
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).toHaveBeenCalledTimes(20);
  await act(async () => root.update(<SceneCanvas frameloop="demand" />));
  expect(root.root.findByType('canvas').props.frameloop).toBe('demand');
  mockInvalidate.mockClear();
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).not.toHaveBeenCalled();
});
