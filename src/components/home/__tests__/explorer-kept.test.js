import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import ExploreScreen from '@/app/(tabs)/explore';
import { ISLAND_PLACES } from '@/lib/archipelago';
import { EXPLORER, zoomRange } from '@/lib/explorer-view';
import { forgetKeeping, relieveMemory } from '../explorer-keep';

/**
 * The island explorer is a tab with no button (src/app/(tabs)/explore.tsx): closing it does not unmount it. These are the screen's side of that: what it keeps while it is
 * closed, what it lets into the scene then, how it opens again, and how it lets the scene go (a build switch, a memory warning) as it always did. The navigators' side is
 * explorer-navigation.test.js.
 */
jest.mock('react-native-gesture-handler', () => {
  const chain = () => new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : () => chain()) });
  return {
    Gesture: { Pan: chain, Pinch: chain, Tap: chain, Simultaneous: () => ({}) },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children, style }) => <root style={style}>{children}</root>,
  };
});
jest.mock('../three/tap-target', () => ({ tapScaleAt: (zoom) => 14 / (.42 * zoom) }));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 30, left: 0, right: 0 }) }));
// The screen is a tab: focused (on show) or not (closed, still mounted). A test turns focus on and off, then draws the screen again.
let mockFocused = true, mockParams = {};
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), dismiss: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => mockFocused,
    useFocusEffect: (callback) => { const focused = mockFocused; useEffect(() => (focused ? callback() : undefined), [callback, focused]); },
  };
});
jest.mock('@/components/home/sanctuary-scene', () => ({ SanctuaryScene: (props) => <scene {...props} /> }));
jest.mock('@/components/home/three/explorer-camera', () => ({ ExplorerCamera: () => null }));
jest.mock('@/components/home/three/sanctuary-environment', () => ({ WATER: { island: '#88ccc4', lagoon: '#8fd3c9', cove: '#7fc0b9' } }));
jest.mock('@/hooks/use-home-preferences', () => ({ useHomePreferences: () => ({ loading: false, preferences: { habitat: 'island', name: 'Home' } }) }));
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: true }),
  useMySightings: () => mockSightings,
  useMyUserId: () => 'me',
}));

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers();
  mockSightings = []; mockFocused = true; mockParams = {}; forgetKeeping(); delete process.env.EXPO_PUBLIC_EXPLORER_KEEP;
  await AsyncStorage.clear();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });

const sighting = (speciesId, i) => ({ id: `s${i}`, speciesId, siteId: 'blue-corner', sightedOn: '2026-01-0' + (i + 1), isDemo: false });
/** Two islands' animals: Home's reef and the Kelp Forest. */
const twoIslands = () => { mockSightings = [sighting('reef-manta', 0), sighting('sea-otter', 1)]; };
const open = async () => { await act(async () => { root = create(<ExploreScreen />); }); };
const sceneProps = () => root.root.findByType('scene').props;
const scenes = () => root.root.findAllByType('scene').length;
const explorerOf = () => sceneProps().explorer.camera.props.explorer;
const measure = async () => {
  const surface = root.root.findAll((node) => typeof node.props.onLayout === 'function' && node.props.collapsable === false)[0];
  await act(async () => surface.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } }));
};
const redraw = async () => { await act(async () => root.update(<ExploreScreen />)); };
const blur = async () => { mockFocused = false; await redraw(); };
const focus = async () => { mockFocused = true; await redraw(); };
const wait = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const settle = (explorer) => { for (let i = 0; i < 120; i++) explorer.step(1 / 60); };
const hintShown = () => root.root.findAll((node) => typeof node.props.children === 'string' && node.props.children.startsWith('Tap an animal to meet it')).length > 0;

test('closed, the scene stays mounted; opened again it opens afresh on the island asked for, wherever the view was taken, on every open', async () => {
  twoIslands();
  await open();
  await measure();
  const explorer = explorerOf();
  const scene = root.root.findByType('scene');
  expect(explorer.island).toBe(0);
  // Taken somewhere else, then closed: the scene is still there (the very same element), the view where it was left.
  await act(async () => { explorer.visit(1); settle(explorer); explorer.zoomBy(EXPLORER.step); settle(explorer); });
  expect(explorer.opening).toBe(false);
  await blur();
  await wait(5000);
  expect(root.root.findAllByType('scene')).toEqual([scene]);
  // Opened for the Kelp Forest: there, the whole of its island in view, nothing yet moved.
  mockParams = { island: 'kelp-forest' };
  await focus();
  expect(root.root.findByType('scene')).toBe(scene);
  expect(explorer.island).toBe(1);
  expect(explorer.opening).toBe(true);
  expect(explorer.view.x).toBeCloseTo(ISLAND_PLACES['kelp-forest'][0], 3);
  expect(explorer.view.z).toBeCloseTo(ISLAND_PLACES['kelp-forest'][1], 3);
  expect(explorer.view.zoom).toBeCloseTo(zoomRange({ width: 390, height: 844, level: 1 }).min, 3);
  // And again, for Home's own island (none asked for), after being taken away from the Kelp Forest.
  await act(async () => { explorer.zoomBy(EXPLORER.step); settle(explorer); });
  await blur();
  mockParams = {};
  await focus();
  expect(explorer.island).toBe(0);
  expect(explorer.opening).toBe(true);
  // Opened for the same island twice running, after a visit elsewhere: the view is where it opens, not where it was.
  await act(async () => { explorer.visit(1); settle(explorer); });
  await blur();
  await focus();
  expect(explorer.island).toBe(0);
});

test('closed, the collection is not let into the scene: a new island is built when the explorer is next opened, not while it is out of sight', async () => {
  mockSightings = [sighting('reef-manta', 0)];
  await open();
  expect(sceneProps().islands.map((island) => island.key)).toEqual(['coral-reef']);
  const { level, residents } = sceneProps();
  await blur();
  // A sea otter is logged meanwhile (the Kelp Forest's first animal): the screen is drawn again, the scene is not changed.
  mockSightings = [sighting('reef-manta', 0), sighting('sea-otter', 1)];
  await redraw();
  expect(sceneProps().islands.map((island) => island.key)).toEqual(['coral-reef']);
  expect(sceneProps().residents).toBe(residents);
  expect(sceneProps().level).toBe(level);
  await focus();
  expect(sceneProps().islands.map((island) => island.key)).toEqual(['coral-reef', 'kelp-forest']);
  expect(sceneProps().residents).not.toBe(residents);
});

test('a level-up while it is closed shows when it is next opened too, not before', async () => {
  // Enough animals logged for the next level: Home's level is what the collection comes to (src/lib/home.ts).
  const species = ['reef-manta', 'whale-shark', 'green-turtle', 'clownfish', 'mola-mola', 'scalloped-hammerhead', 'bottlenose-dolphin', 'great-barracuda', 'sailfish', 'spotted-eagle-ray',
    'tiger-shark', 'oceanic-whitetip', 'giant-moray', 'day-octopus', 'great-white-shark', 'leatherback-turtle'];
  mockSightings = species.slice(0, 2).map(sighting);
  await open();
  const was = sceneProps().level;
  await blur();
  mockSightings = species.map(sighting);
  await redraw();
  expect(sceneProps().level).toBe(was);
  await focus();
  expect(sceneProps().level).toBeGreaterThanOrEqual(was);
  expect(sceneProps().residents.length).toBeGreaterThan(2);
});

test('with EXPO_PUBLIC_EXPLORER_KEEP=0 the scene goes once the explorer has faded out, as it always did, and is mounted afresh when it is opened', async () => {
  process.env.EXPO_PUBLIC_EXPLORER_KEEP = '0';
  await open();
  const first = root.root.findByType('scene');
  await blur();
  // (still there while the tab fades out)
  await wait(300);
  expect(scenes()).toBe(1);
  await wait(600);
  expect(scenes()).toBe(0);
  // The screen itself is kept (its size known, so the scene's picture can be looked for at once); opened again, a new scene.
  await focus();
  expect(scenes()).toBe(1);
  expect(root.root.findByType('scene')).not.toBe(first);
  // Closed and opened again before the fade is over: it never went.
  await blur();
  await wait(300);
  await focus();
  await wait(2000);
  expect(scenes()).toBe(1);
});

test('after a memory warning a closed scene goes at once, and no closed explorer keeps its scene from then on', async () => {
  await open();
  await blur();
  await wait(5000);
  expect(scenes()).toBe(1);
  await act(async () => { relieveMemory(); });
  expect(scenes()).toBe(0);
  // Opened again it is shown, and closed again it is let go after fading out.
  await focus();
  expect(scenes()).toBe(1);
  await blur();
  await wait(300);
  expect(scenes()).toBe(1);
  await wait(600);
  expect(scenes()).toBe(0);
});

test('a warning that arrives while the explorer is on show lets its scene go once it is closed', async () => {
  await open();
  await act(async () => { relieveMemory(); });
  expect(scenes()).toBe(1);
  await blur();
  await wait(1000);
  expect(scenes()).toBe(0);
});

test('the hint is there on each of the first three times the explorer is opened, though the screen stays mounted, and never after', async () => {
  await open();
  for (let visit = 1; visit <= 3; visit++) {
    if (visit > 1) await focus();
    expect(hintShown()).toBe(true);
    await blur();
    expect(hintShown()).toBe(false);
  }
  expect(await AsyncStorage.getItem('scubago.explorerHintShown.v1')).toBe('3');
  await focus();
  expect(hintShown()).toBe(false);
});

test('it is as big as the window whatever the tab bar does around it, so the scene is not resized each time the bar comes and goes', async () => {
  await open();
  const { width, height } = Dimensions.get('window');
  expect(StyleSheet.flatten(root.root.findByType('root').props.style)).toMatchObject({ position: 'absolute', width, height });
});

test('closing it goes back to where it was opened from (the tabs go back to the one shown before; with nothing to go back to, Home)', async () => {
  await open();
  const press = () => root.root.findByProps({ accessibilityLabel: 'Close the explorer' }).props.onPress();
  router.back.mockClear();
  press();
  expect(router.back).toHaveBeenCalledTimes(1);
});
