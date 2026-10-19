import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import ExploreScreen from '@/app/explore';
import { zoomRange } from '@/lib/explorer-view';

// How many tap gestures the screen makes (none: the explorer tells a double tap from a quick pinch itself).
let mockTapGestures = 0;
jest.mock('react-native-gesture-handler', () => {
  const chain = () => new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : () => chain()) });
  return {
    Gesture: { Pan: chain, Pinch: chain, Tap: () => { mockTapGestures++; return chain(); }, Simultaneous: () => ({}) },
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
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({}) }));
jest.mock('@/components/home/sanctuary-scene', () => ({ SanctuaryScene: (props) => <scene {...props} /> }));
jest.mock('@/components/home/three/explorer-camera', () => ({ ExplorerCamera: () => null }));
jest.mock('@/components/home/three/sanctuary-environment', () => ({ WATER: { island: '#88ccc4', lagoon: '#8fd3c9', cove: '#7fc0b9' } }));
jest.mock('@/hooks/use-home-preferences', () => ({ useHomePreferences: () => ({ loading: false, preferences: { habitat: 'island', name: 'Home' } }) }));
// The diver's sightings (a test may log some).
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: true }),
  useMySightings: () => mockSightings,
  useMyUserId: () => 'me',
}));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); mockSightings = []; });
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
  // The scene reads the zoom as it is now, for the reef's small life.
  expect(scene().props.explorer.zoom()).toBe(explorer.view.zoom);

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

test('no tap gesture on the screen: one would count two quick pinches as a double tap and zoom in', async () => {
  await act(async () => { root = create(<ExploreScreen />); });
  expect(mockTapGestures).toBe(0);
});

test('with small life on the reef, the hint says it is there to find up close', async () => {
  const sighting = (speciesId, i) => ({ id: `s${i}`, speciesId, siteId: 'blue-corner', sightedOn: '2026-01-0' + (i + 1), isDemo: false });
  mockSightings = [sighting('reef-manta', 0), sighting('pygmy-seahorse', 1), sighting('giant-clam', 2)];
  await act(async () => { root = create(<ExploreScreen />); });
  const hint = root.root.findAll((node) => typeof node.props.children === 'string' && node.props.children.includes('small creatures'));
  expect(hint.length).toBeGreaterThan(0);
  expect(hint[0].props.children).toContain('2 small creatures live on the reef: zoom in close to find them');
});
