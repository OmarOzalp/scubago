import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { AccessibilityInfo, AppState } from 'react-native';
import { useSceneActive } from '../use-scene-active';

jest.mock('expo-router', () => ({ useFocusEffect: (effect) => require('react').useEffect(effect, [effect]) }));
let active;
let root;
let onMotion;
let onApp;
const stateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
function Harness({ paused = false }) { active = useSceneActive(paused); return null; }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_, handler) => { onMotion = handler; return { remove: jest.fn() }; });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
    onApp = (state) => { AppState.currentState = state; handler(state); };
    return { remove: jest.fn() };
  });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.restoreAllMocks();
  Object.defineProperty(AppState, 'currentState', stateDescriptor);
});
async function mount() { await act(async () => { root = create(<Harness />); }); }

test('a failed accessibility query does not freeze all animation forever', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockRejectedValueOnce(new Error('Unavailable'));
  await mount();
  expect(active).toBe(true);
});
test('a newer reduced-motion event wins over an older pending query', async () => {
  let resolve;
  AccessibilityInfo.isReduceMotionEnabled.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await mount();
  await act(async () => onMotion(true));
  await act(async () => resolve(false));
  expect(active).toBe(false);
});
test('pause, background and reduced motion each stop animation; resuming restores it', async () => {
  await mount();
  expect(active).toBe(true);
  await act(async () => root.update(<Harness paused />));
  expect(active).toBe(false);
  await act(async () => root.update(<Harness />));
  expect(active).toBe(true);
  await act(async () => onApp('background'));
  expect(active).toBe(false);
  await act(async () => onApp('active'));
  expect(active).toBe(true);
  await act(async () => onMotion(true));
  expect(active).toBe(false);
  await act(async () => onMotion(false));
  expect(active).toBe(true);
});
test('web platforms may return no event subscription', async () => {
  AppState.addEventListener.mockReturnValueOnce(undefined);
  AccessibilityInfo.addEventListener.mockReturnValueOnce(undefined);
  await mount();
  await act(async () => root.unmount());
  root = null;
});
