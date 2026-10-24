import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import HomeScreen from '@/app/(tabs)/index';

// The island's 3D scene (three.js) and the first-launch intro are beside the point here; the editor is a marker.
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/home/sanctuary-scene', () => ({ SanctuaryScene: () => null }));
jest.mock('@/components/home/home-editor', () => ({ HomeEditor: () => <editor /> }));
jest.mock('@/components/home/three/sanctuary-environment', () => ({ WATER: { island: '#88ccc4', kelp: '#88ccc4', volcanic: '#88ccc4', mangrove: '#88ccc4', wreck: '#88ccc4' } }));
jest.mock('@/components/intro-cards', () => ({ IntroCards: () => null, useIntro: () => ({ show: false, done: () => {} }) }));
jest.mock('@/hooks/use-home-preferences', () => ({ useHomePreferences: () => ({ loading: false, preferences: { name: 'Kai’s Atoll' }, error: '', saving: false, save: async () => true }) }));
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => false }));
jest.mock('@/hooks/use-discovery-moments', () => ({
  useDiscoveryMoments: ({ level }) => ({ now: null, featured: [], waiting: [], level, loading: false, onArrived: () => {}, tag: null, banner: null, note: null, busy: false }),
}));
jest.mock('@/lib/macro-life', () => ({ macroResidents: () => [] }));
let mockNoneSwim = true;
jest.mock('@/lib/swimming', () => ({ noneSwim: () => mockNoneSwim }));
let mockSightings = [];
let mockDives = [];
let mockNext = 1;
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: true, backendEnabled: false }),
  useMySightings: () => mockSightings,
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
  useNextDiveNumber: () => mockNext,
}));

const sighting = (id, speciesId, over = {}) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over });
const page = (number) => ({ id: `d${number}`, userId: 'local', number, siteId: 'shark-yolanda', divedOn: '2026-03-12' });
// Home's reef (a manta), the Open Ocean (a whale shark, which has no island and swims at Home), and the Kelp Forest (a sea otter).
const REEF = ['reef-manta', 'clownfish'], OPEN_OCEAN = ['whale-shark'], KELP = ['sea-otter', 'harbor-seal'];
const logged = (ids) => ids.map((speciesId, i) => sighting(`s-${speciesId}`, speciesId, { sightedOn: `2026-03-${10 + i}` }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockSightings = []; mockDives = []; mockNext = 1; mockNoneSwim = true; router.push.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<HomeScreen />); }); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
// The buttons by what a screen reader says, or (byTitle) by the words on them; and the style each is drawn with.
// (A Pressable shows up as several nodes sharing one onPress, so each press handler counts once.)
const onceEach = (nodes) => [...new Map(nodes.map((n) => [n.props.onPress, n])).values()];
const pressable = (n) => typeof n.props.onPress === 'function';
const buttons = (label) => onceEach(root.root.findAll((n) => pressable(n) && typeof n.props.accessibilityLabel === 'string' && (typeof label === 'string' ? n.props.accessibilityLabel.startsWith(label) : label.test(n.props.accessibilityLabel))));
const byTitle = (title) => onceEach(root.root.findAll((n) => pressable(n) && n.findAll((c) => c.type === 'Text' && c.children.join('') === title).length > 0));
const drawn = (button) => StyleSheet.flatten(button.findAll((n) => n.type === 'View')[0].props.style);
const press = async (node) => { await act(async () => node.props.onPress()); };

describe('the islands under the island’s art', () => {
  beforeEach(() => { mockSightings = logged([...REEF, ...OPEN_OCEAN, ...KELP]); });

  test('are one pill for each island, and an area with no island of its own is not a pill', async () => {
    await render();
    const islands = buttons(/Show this island|Showing this island/);
    expect(islands.map((n) => n.props.accessibilityLabel)).toEqual([
      // Home's island counts the Open Ocean's whale shark, as Rewards → Islands does: 3 residents found.
      'Coral Reef, 3 species. Showing this island',
      'Kelp Forest, 2 species. Show this island',
    ]);
    expect(buttons('Open Ocean')).toHaveLength(0);
    expect(buttons('Black Sand Bay')).toHaveLength(0);
    // It says so in a plain line, with no border to tap.
    expect(texts()).toContain('Includes 1 from Open Ocean');
  });

  test('sit in one row that scrolls sideways, each tall enough to tap', async () => {
    await render();
    const row = root.root.findAll((n) => n.props.horizontal === true && n.props.contentContainerStyle && StyleSheet.flatten(n.props.contentContainerStyle).gap === 8)[0];
    expect(row).toBeDefined();
    // (None of them wraps.)
    expect(StyleSheet.flatten(row.props.contentContainerStyle).flexWrap).toBeUndefined();
    for (const pill of buttons(/Show this island|Showing this island/)) expect(drawn(pill).minHeight).toBeGreaterThanOrEqual(44);
  });

  test('do not hold “to discover”: how many islands are raised is one line under the progress bar, as Rewards says it', async () => {
    await render();
    const shown = texts();
    expect(shown).not.toContain('+2 to discover');
    expect(shown.filter((t) => t.includes('to discover'))).toEqual(['2 of 5 islands raised · 3 more to discover']);
  });

  test('choosing an island shows it in place of Home’s, and Home’s name is not left under its art', async () => {
    await render();
    expect(texts()).toContain('Kai’s Atoll');
    expect(buttons('Kai’s Atoll')).toHaveLength(1);
    await press(buttons('Kelp Forest')[0]);
    expect(buttons('Kelp Forest')[0].props.accessibilityLabel).toBe('Kelp Forest, 2 species. Showing this island');
    expect(texts()).not.toContain('Kai’s Atoll');
    expect(buttons('Kai’s Atoll')).toHaveLength(0);
    // The island is named under its art instead, and the Open Ocean's species are Home's, not here.
    expect(texts().filter((t) => t === 'Kelp Forest')).toHaveLength(2);
    expect(texts()).not.toContain('Includes 1 from Open Ocean');
  });
});

test('with every island raised, the line says so', async () => {
  mockSightings = logged(['reef-manta', 'sea-otter', 'scalloped-hammerhead', 'tiger-shark', 'sand-tiger-shark']);
  await render();
  expect(texts()).toContain('All 5 islands raised');
});

test('with only Home’s island, there is nothing to choose: its name and count are plain text', async () => {
  mockSightings = logged([...REEF, ...OPEN_OCEAN]);
  await render();
  expect(buttons(/Show this island|Showing this island/)).toHaveLength(0);
  expect(texts()).toEqual(expect.arrayContaining(['Coral Reef', 'Includes 1 from Open Ocean', '1 of 5 islands raised · 4 more to discover']));
});

describe('a first run', () => {
  test('holds the way in inside the hero, and says the ocean is empty once', async () => {
    await render();
    const first = byTitle('Log your first dive');
    expect(first).toHaveLength(1);
    await press(first[0]);
    expect(router.push).toHaveBeenCalledWith('/log/new');
    const shown = texts();
    expect(shown.filter((t) => /empty|quiet/i.test(t))).toHaveLength(1);
    expect(shown).not.toContain('A quiet ocean. A world to discover.');
    // The island's button is the one way in: no second coral button for the same first page, no empty “Life around you”.
    expect(shown).not.toContain('Next in your logbook');
    expect(shown).not.toContain('Life around you');
  });

  test('is over once there is a page, even before an animal', async () => {
    mockDives = [page(1)];
    mockNext = 2;
    await render();
    expect(byTitle('Log your first dive')).toHaveLength(0);
    expect(texts().filter((t) => /empty/i.test(t))).toHaveLength(1);
    expect(texts()).toContain('Next in your logbook');
  });
});

test('the start button names the page it begins', async () => {
  mockSightings = logged(REEF);
  mockDives = [page(27)];
  mockNext = 28;
  await render();
  expect(texts()).toContain('Log dive No. 28');
  expect(texts().join('|')).not.toMatch(/Begin entry/);
  expect(byTitle('Log dive No. 28')).toHaveLength(1);
  await press(byTitle('Log dive No. 28')[0]);
  expect(router.push).toHaveBeenCalledWith('/log/new');
});

test('the full-screen button is “Open full screen”, once something swims to explore', async () => {
  mockSightings = logged(REEF);
  await render();
  expect(buttons('Open full screen')).toHaveLength(0);
  mockNoneSwim = false;
  await act(async () => root.update(<HomeScreen />));
  expect(buttons('Open full screen')).toHaveLength(1);
  expect(buttons('Explore your ocean full screen')).toHaveLength(0);
  await press(buttons('Open full screen')[0]);
  expect(router.push).toHaveBeenCalledWith('/explore');
});

describe('the home name', () => {
  test('is a button that opens the editor, so renaming needs no hunt for the pencil', async () => {
    mockSightings = logged(REEF);
    await render();
    expect(root.root.findAllByType('editor')).toHaveLength(0);
    const name = buttons('Kai’s Atoll, your home');
    expect(name).toHaveLength(1);
    expect(name[0].props.accessibilityHint).toBe('Rename your home');
    await press(name[0]);
    expect(root.root.findAllByType('editor')).toHaveLength(1);
  });
});
