import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { AMBIENT_FPS, FramePacer, LEAD_MS } from '../three/frame-pacer';

const mockInvalidate = jest.fn();
let mockFrame, mockPriority;
jest.mock('@react-three/fiber', () => ({
  useThree: (select) => select({ invalidate: (...args) => mockInvalidate(...args) }),
  useFrame: (callback, priority) => { mockFrame = callback; mockPriority = priority; },
}));
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockInvalidate.mockClear();
  mockFrame = undefined;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});
const mount = async (fps = AMBIENT_FPS) => { await act(async () => { root = create(<FramePacer fps={fps} />); }); };
const due = 1000 / AMBIENT_FPS - LEAD_MS;

test('an ambient scene draws 30 times a second', () => {
  expect(AMBIENT_FPS).toBe(30);
});

test('it asks for the first frame at once, and for each next one a little before it is due, counted from the start of the frame', async () => {
  await mount();
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  mockInvalidate.mockClear();
  mockFrame();
  await act(async () => jest.advanceTimersByTime(due - 1));
  expect(mockInvalidate).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  // One frame, one request: nothing more is asked for until that frame has drawn.
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  mockFrame();
  await act(async () => jest.advanceTimersByTime(due));
  expect(mockInvalidate).toHaveBeenCalledTimes(2);
});

test('a frame drawn for another reason puts the next paced one back: drawing at every refresh (fingers down) is never doubled', async () => {
  await mount();
  mockInvalidate.mockClear();
  // sixty frames, one every 16.7 ms, as while a finger drags the explorer
  for (let i = 0; i < 60; i++) { mockFrame(); await act(async () => jest.advanceTimersByTime(16.7)); }
  expect(mockInvalidate).not.toHaveBeenCalled();
  // the finger lifts: back to 30 a second
  await act(async () => jest.advanceTimersByTime(due));
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
});

test('it goes first in the frame without taking over the drawing, and stops with the scene', async () => {
  await mount();
  expect(mockPriority).toBeLessThan(0);
  mockInvalidate.mockClear();
  mockFrame();
  await act(async () => root.unmount());
  root = null;
  await act(async () => jest.advanceTimersByTime(1000));
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test('the delay follows the rate it is given', async () => {
  await mount(20);
  mockInvalidate.mockClear();
  mockFrame();
  await act(async () => jest.advanceTimersByTime(1000 / 20 - LEAD_MS - 1));
  expect(mockInvalidate).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
});
