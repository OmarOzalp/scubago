import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import ExploreScreen from '@/app/explore';
import { zoomRange } from '@/lib/explorer-view';

jest.mock('react-native-gesture-handler', () => {
  const chain = () => new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : () => chain()) });
  return {
    Gesture: { Pan: chain, Pinch: chain, Tap: chain, Simultaneous: () => ({}) },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children, style }) => <root style={style}>{children}</root>,
  };
});
// tap-target loads three.js, which jest can't; the explorer only needs its zoom to tap-scale rule.
const tapScaleAt = (zoom) => 14 / (.42 * zoom);
jest.mock('../three/tap-target', () => ({ tapScaleAt: (zoom) => 14 / (.42 * zoom) }));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 30, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true } }));
jest.mock('@/components/home/sanctuary-scene', () => ({ SanctuaryScene: (props) => <scene {...props} /> }));
jest.mock('@/components/home/three/explorer-camera', () => ({ ExplorerCamera: () => null }));
jest.mock('@/components/home/three/sanctuary-environment', () => ({ WATER: { island: '#88ccc4', lagoon: '#8fd3c9', cove: '#7fc0b9' } }));
jest.mock('@/hooks/use-home-preferences', () => ({ useHomePreferences: () => ({ loading: false, preferences: { habitat: 'island', name: 'Home' } }) }));
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: true }),
  useMySightings: () => [],
  useMyUserId: () => 'me',
}));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });

test('the explorer draws the island full screen with its own camera, and its buttons zoom, show the whole ocean and close it', async () => {
  await act(async () => { root = create(<ExploreScreen />); });
  const scene = () => root.root.findByType('scene');
  const explorer = scene().props.explorer.camera.props.explorer;
  expect(scene().props.habitat).toBe('island');
  // It learns the screen's size from layout, then starts all the way out, the whole ocean in view.
  const surface = root.root.findAll((node) => typeof node.props.onLayout === 'function' && node.props.collapsable === false)[0];
  await act(async () => surface.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } }));
  const range = zoomRange({ width: 390, height: 844, level: 1 });
  expect(explorer.view.zoom).toBeCloseTo(range.min, 6);
  expect(scene().props.explorer.tapScale).toBeCloseTo(tapScaleAt(range.min), 6);

  // Zoom in with the button: once the move settles, tap targets shrink in the world to keep their size on screen.
  const press = (label) => root.root.findByProps({ accessibilityLabel: label }).props.onPress();
  await act(async () => { press('Zoom in'); for (let i = 0; i < 120; i++) explorer.step(1 / 60); });
  expect(explorer.view.zoom).toBeGreaterThan(range.min * 1.5);
  expect(scene().props.explorer.tapScale).toBeCloseTo(tapScaleAt(explorer.view.zoom), 6);
  await act(async () => { press('Show the whole ocean'); for (let i = 0; i < 120; i++) explorer.step(1 / 60); });
  expect(explorer.view.zoom).toBeCloseTo(range.min, 6);
  // All the way out already: zooming out leaves it there.
  await act(async () => { press('Zoom out'); for (let i = 0; i < 120; i++) explorer.step(1 / 60); });
  expect(explorer.view.zoom).toBeCloseTo(range.min, 6);

  press('Close the explorer');
  expect(router.back).toHaveBeenCalled();
  // The hint is there to start with, and fades.
  expect(root.root.findAll((node) => node.props.children === 'Pinch or double-tap to look closer · drag to look around').length).toBeGreaterThan(0);
});
