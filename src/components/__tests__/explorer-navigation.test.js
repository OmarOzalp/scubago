import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { BackHandler, Pressable, Text } from 'react-native';
import { router, Stack } from 'expo-router';
import TabLayout from '@/app/(tabs)/_layout';
import ExploreScreen from '@/app/(tabs)/explore';
import { forgetKeeping } from '@/components/home/explorer-keep';
import { renderRouter } from '@/test-support/render-router';

/**
 * The island explorer is a tab with no button (src/app/(tabs)/explore.tsx), kept mounted when it is closed. This runs Expo Router's own navigators (the real tabs layout, the real
 * tab bar and the real explorer screen; Home, Rewards and the 3D scene are stand-ins) to see what opening and closing it does: where it opens, where closing goes, and what
 * stays mounted. The stand-ins make the same calls the real screens do (Home's: src/app/(tabs)/index.tsx; Rewards → Islands: src/app/rewards/islands.tsx).
 */
jest.mock('react-native-gesture-handler', () => {
  const chain = () => new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : () => chain()) });
  return {
    Gesture: { Pan: chain, Pinch: chain, Tap: chain, Simultaneous: () => ({}) },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children, style }) => <root style={style}>{children}</root>,
  };
});
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('@/components/home/three/tap-target', () => ({ tapScaleAt: (zoom) => 14 / (.42 * zoom) }));
jest.mock('@/components/home/sanctuary-scene', () => ({ SanctuaryScene: (props) => <scene {...props} /> }));
jest.mock('@/components/home/three/explorer-camera', () => ({ ExplorerCamera: () => null }));
jest.mock('@/components/home/three/sanctuary-environment', () => ({ WATER: { island: '#88ccc4', lagoon: '#8fd3c9', cove: '#7fc0b9' } }));
jest.mock('@/hooks/use-home-preferences', () => ({ useHomePreferences: () => ({ loading: false, preferences: { habitat: 'island', name: 'Home' } }) }));
const mockSightings = [
  { id: 's0', speciesId: 'reef-manta', siteId: 'blue-corner', sightedOn: '2026-01-01', isDemo: false },
  { id: 's1', speciesId: 'sea-otter', siteId: 'blue-corner', sightedOn: '2026-01-02', isDemo: false },
];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: true }),
  useMySightings: () => mockSightings,
  useMyUserId: () => 'me',
}));

const Home = () => <>
  <Text>home</Text>
  <Pressable accessibilityLabel="Explore your islands" onPress={() => router.push('/explore')} />
  <Pressable accessibilityLabel="Open the Kelp Forest full screen" onPress={() => router.push({ pathname: '/explore', params: { island: 'kelp-forest' } })} />
  <Pressable accessibilityLabel="Rewards" onPress={() => router.push('/rewards')} />
</>;
const Rewards = () => <Pressable accessibilityLabel="Islands" onPress={() => router.push('/rewards/islands')} />;
const Islands = () => <>
  <Text>islands</Text>
  <Pressable accessibilityLabel="Visit the Kelp Forest" onPress={() => router.dismissTo({ pathname: '/explore', params: { island: 'kelp-forest', from: 'islands' } })} />
  <Pressable accessibilityLabel="Visit Home's island" onPress={() => router.dismissTo({ pathname: '/explore', params: { from: 'islands' } })} />
</>;
const routes = {
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': TabLayout,
  '(tabs)/index': Home,
  '(tabs)/map': () => <Text>map</Text>,
  '(tabs)/logbook': () => <Pressable accessibilityLabel="Explore from the logbook" onPress={() => router.push({ pathname: '/explore', params: { from: '/logbook' } })} />,
  '(tabs)/field-guide': () => <Text>field guide</Text>,
  '(tabs)/explore': ExploreScreen,
  'rewards/index': Rewards,
  'rewards/islands': Islands,
};

let app, backHandlers;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; forgetKeeping();
  // (the hardware back button, as React Native tells it: the handlers asked to hear it, the last asked first, until one has taken it)
  backHandlers = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((name, handler) => {
    if (name === 'hardwareBackPress') backHandlers.push(handler);
    return { remove: () => { backHandlers = backHandlers.filter((one) => one !== handler); } };
  });
});
afterEach(async () => { if (app) await app.unmount(); app = null; jest.restoreAllMocks(); });
const pressBack = async () => { await act(async () => { for (const handler of [...backHandlers].reverse()) if (handler()) return; }); };

const start = async (initialUrl = '/') => { app = await renderRouter(routes, { initialUrl }); };
// (the button on top: screens under it, kept mounted, may have one of the same name)
const press = async (label) => { await act(async () => { app.renderer.root.findAllByProps({ accessibilityLabel: label }).filter((node) => typeof node.props.onPress === 'function').at(-1).props.onPress(); }); };
const close = () => press('Close the explorer');
const scenes = () => app.renderer.root.findAllByType('scene');
const island = () => scenes().at(-1).props.explorer.camera.props.explorer.island;
const bar = () => app.renderer.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'tablist');
const tabLabels = () => bar().flatMap((tablist) => tablist.findAll((node) => typeof node.type === 'string' && node.type === 'Text' && typeof node.props.children === 'string').map((node) => node.props.children));
/** Which tab (or screen) is on top, by name. */
const where = () => app.describe();

test('opened from Home, the explorer is the tab on show, with no tab bar; closing it goes back to Home, and its scene stays mounted', async () => {
  await start();
  expect(where()).toBe('__root*[(tabs)*[index*]]');
  expect(scenes()).toHaveLength(0);
  expect(bar()).toHaveLength(1);

  await press('Explore your islands');
  expect(where()).toBe('__root*[(tabs)*[index,explore*]]');
  expect(scenes()).toHaveLength(1);
  expect(bar()).toHaveLength(0);

  await close();
  expect(where()).toBe('__root*[(tabs)*[index*,explore]]');
  // (asleep, not gone)
  expect(scenes()).toHaveLength(1);
  expect(bar()).toHaveLength(1);
});

test('the tab bar never shows a button for the explorer', async () => {
  await start();
  expect(tabLabels()).toEqual(['Home', 'Sites', 'Log', 'Logbook', 'Field guide']);
  await press('Explore your islands');
  await close();
  // It is mounted now, as a tab, and still has no button.
  expect(where()).toContain('explore');
  expect(tabLabels()).toEqual(['Home', 'Sites', 'Log', 'Logbook', 'Field guide']);
});

test('it opens on the island asked for on every open, not just the first, and Home’s own island when none is asked for', async () => {
  await start();
  await press('Open the Kelp Forest full screen');
  expect(island()).toBe(1);
  await close();
  await press('Explore your islands');
  expect(island()).toBe(0);
  await close();
  await press('Open the Kelp Forest full screen');
  expect(island()).toBe(1);
  await close();
  // The same island twice running, with the view taken away in between.
  const explorer = scenes()[0].props.explorer.camera.props.explorer;
  await press('Open the Kelp Forest full screen');
  await act(async () => { explorer.visit(0); for (let i = 0; i < 120; i++) explorer.step(1 / 60); });
  expect(island()).toBe(0);
  await close();
  await press('Open the Kelp Forest full screen');
  expect(island()).toBe(1);
  expect(explorer.opening).toBe(true);
  // Only ever one of it.
  expect(scenes()).toHaveLength(1);
  expect(where()).toBe('__root*[(tabs)*[index,explore*{island=kelp-forest}]]');
});

test('the Android hardware back button closes it as the close button does', async () => {
  await start();
  await press('Explore your islands');
  await pressBack();
  expect(where()).toBe('__root*[(tabs)*[index*,explore]]');
  expect(scenes()).toHaveLength(1);
});

test('a link to /explore opens it (on the island it names); closing it, with nothing to go back to, goes to Home', async () => {
  await start('/explore?island=kelp-forest');
  expect(where()).toBe('__root*[(tabs)*[explore*{island=kelp-forest}]]');
  expect(scenes()).toHaveLength(1);
  expect(island()).toBe(1);
  expect(bar()).toHaveLength(0);
  await close();
  expect(where()).toContain('index*');
  expect(bar()).toHaveLength(1);
});

test('opened from Rewards → Islands, it goes to the one explorer there is; closing it puts the Rewards and Islands screens back; one scene all along', async () => {
  await start();
  await press('Explore your islands');
  await close();
  const kept = scenes()[0];
  await press('Rewards');
  await press('Islands');
  expect(where()).toBe('__root*[(tabs)[index*,explore],rewards/index,rewards/islands*]');
  await press('Visit the Kelp Forest');
  expect(where()).toBe('__root*[(tabs)*[index,explore*{island=kelp-forest,from=islands}]]');
  expect(island()).toBe(1);
  expect(bar()).toHaveLength(0);
  expect(scenes()).toHaveLength(1);
  expect(scenes()[0]).toBe(kept);
  await close();
  expect(where()).toBe('__root*[(tabs)[index*,explore{island=kelp-forest,from=islands}],rewards/index,rewards/islands*]');
  expect(scenes()).toHaveLength(1);
  // Back from the Islands screen is Rewards, then Home, as before it was opened.
  await act(async () => { router.back(); });
  expect(where()).toContain('rewards/index*');
  // And for Home's own island, and by the Android back button too.
  await press('Islands');
  await press("Visit Home's island");
  expect(island()).toBe(0);
  expect(scenes()).toHaveLength(1);
  await pressBack();
  expect(where()).toContain('rewards/islands*');
  // An open from Home afterwards is not still "from Islands".
  await act(async () => { router.back(); router.back(); });
  await press('Explore your islands');
  await close();
  expect(where()).toBe('__root*[(tabs)*[index*,explore]]');
});

test('opened from another tab (its own path as `from`), closing it goes to that tab, not to Home', async () => {
  await start('/logbook');
  expect(where()).toBe('__root*[(tabs)*[logbook*]]');
  await press('Explore from the logbook');
  expect(where()).toContain('explore*{from=/logbook}');
  expect(bar()).toHaveLength(0);
  await close();
  expect(where()).toMatch(/logbook\*/);
  expect(bar()).toHaveLength(1);
  expect(scenes()).toHaveLength(1);
  // The Android back button too.
  await press('Explore from the logbook');
  await pressBack();
  expect(where()).toMatch(/logbook\*/);
});
