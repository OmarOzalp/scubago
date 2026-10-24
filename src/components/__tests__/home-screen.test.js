import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import HomeScreen from '@/app/(tabs)/index';

// The island's 3D scene (three.js) and the first-launch intro are beside the point here; the editor is a marker.
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// The scene, as the props Home gives it (a test taps an animal through them).
let mockScene = {};
jest.mock('@/components/home/sanctuary-scene', () => ({ SanctuaryScene: (props) => { mockScene = props; return null; } }));
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
beforeEach(async () => { global.IS_REACT_ACT_ENVIRONMENT = true; mockSightings = []; mockDives = []; mockNext = 1; mockNoneSwim = true; router.push.mockClear(); await AsyncStorage.clear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<HomeScreen />); }); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
// The buttons by what a screen reader says, or (byTitle) by the words on them; and the style each is drawn with.
// (A Pressable shows up as several nodes sharing one onPress, so each press handler counts once.)
const onceEach = (nodes) => [...new Map(nodes.map((n) => [n.props.onPress, n])).values()];
const pressable = (n) => typeof n.props.onPress === 'function';
const buttons = (label) => onceEach(root.root.findAll((n) => pressable(n) && typeof n.props.accessibilityLabel === 'string' && (typeof label === 'string' ? n.props.accessibilityLabel.startsWith(label) : label.test(n.props.accessibilityLabel))));
const byTitle = (title) => onceEach(root.root.findAll((n) => pressable(n) && n.findAll((c) => c.type === 'Text' && (typeof title === 'string' ? c.children.join('') === title : title.test(c.children.join('')))).length > 0));
const drawn = (button) => StyleSheet.flatten(button.findAll((n) => n.type === 'View')[0].props.style);
const press = async (node) => { await act(async () => node.props.onPress()); };

describe('the islands under the island’s art', () => {
  beforeEach(() => { mockSightings = logged([...REEF, ...OPEN_OCEAN, ...KELP]); });

  test('are one pill for each island, and an area with no island of its own is not a pill', async () => {
    await render();
    const islands = buttons(/Show this island|Showing this island/);
    expect(islands.map((n) => n.props.accessibilityLabel)).toEqual([
      // Home's island counts the Open Ocean's whale shark, as Rewards → Islands does: 3 residents found (a screen reader hears where from).
      'Coral Reef, 3 species, including 1 from Open Ocean. Showing this island',
      'Kelp Forest, 2 species. Show this island',
    ]);
    expect(buttons('Open Ocean')).toHaveLength(0);
    expect(buttons('Black Sand Bay')).toHaveLength(0);
    // The card does not say so in words: the number is in the pill, and Rewards → Islands has the rest.
    expect(texts().join('|')).not.toMatch(/Includes/);
  });

  test('sit in one row that scrolls sideways, each tall enough to tap', async () => {
    await render();
    const row = root.root.findAll((n) => n.props.horizontal === true && n.props.contentContainerStyle && StyleSheet.flatten(n.props.contentContainerStyle).gap === 8)[0];
    expect(row).toBeDefined();
    // (None of them wraps.)
    expect(StyleSheet.flatten(row.props.contentContainerStyle).flexWrap).toBeUndefined();
    for (const pill of buttons(/Show this island|Showing this island/)) expect(drawn(pill).minHeight).toBeGreaterThanOrEqual(44);
  });

  test('are how many islands are raised: no line under the progress bar says it again', async () => {
    await render();
    expect(texts().join('|')).not.toMatch(/to discover|islands raised/);
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
    expect(buttons('Coral Reef')[0].props.accessibilityLabel).toBe('Coral Reef, 3 species, including 1 from Open Ocean. Show this island');
    expect(buttons('Kelp Forest')[0].props.accessibilityLabel).not.toMatch(/including/);
  });
});

test('with every island raised, there is a pill for each and no line saying so', async () => {
  mockSightings = logged(['reef-manta', 'sea-otter', 'scalloped-hammerhead', 'tiger-shark', 'sand-tiger-shark']);
  await render();
  expect(buttons(/Show this island|Showing this island/)).toHaveLength(5);
  expect(texts().join('|')).not.toMatch(/islands raised/);
});

test('with only Home’s island, there is nothing to choose: its name and count are plain text', async () => {
  mockSightings = logged([...REEF, ...OPEN_OCEAN]);
  await render();
  expect(buttons(/Show this island|Showing this island/)).toHaveLength(0);
  expect(texts()).toEqual(expect.arrayContaining(['Coral Reef', '3']));
  expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Coral Reef, 3 species, including 1 from Open Ocean')).not.toHaveLength(0);
});

describe('a first run', () => {
  test('holds the way in inside the hero, and says the ocean is empty once', async () => {
    await render();
    const first = byTitle('Log your first dive');
    expect(first).toHaveLength(1);
    await press(first[0]);
    expect(router.push).toHaveBeenCalledWith('/log/new');
    const shown = texts();
    // One short line says what the island is for; no slogan over it, no zeros under it, no ladder to climb yet.
    expect(shown.filter((t) => /come to live here/i.test(t))).toEqual(['Animals you log come to live here.']);
    expect(shown).not.toContain('Growing with every dive');
    expect(shown.filter((t) => ['SPECIES', 'SIGHTINGS', 'SITES', 'SITE', 'LEVEL'].includes(t))).toEqual([]);
    expect(shown).not.toContain('Species to grow your island');
    // The island's button is the one way in: no second coral button for the same first page, no empty “Life around you”.
    expect(shown).not.toContain('Life around you');
    expect(byTitle(/^Log dive/)).toHaveLength(0);
    // The goal is the hook, said once.
    expect(shown).toEqual(expect.arrayContaining(['New Explorer · level 1', '0 / 3', '3 more species for a coral garden.']));
  });

  test('is over once there is a page, even before an animal', async () => {
    mockDives = [page(1)];
    mockNext = 2;
    await render();
    expect(byTitle('Log your first dive')).toHaveLength(0);
    expect(texts().filter((t) => /come to live here/i.test(t))).toHaveLength(1);
    expect(texts()).toContain('Log dive No. 2');
    expect(texts()).not.toContain('Next in your logbook');
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

describe('the line under the island', () => {
  test('is nothing at all when animals swim there: the island and its name are the page', async () => {
    mockSightings = logged(REEF);
    mockNoneSwim = false;
    await render();
    const shown = texts();
    expect(shown).not.toContain('Animals you log come to live here.');
    expect(shown.join('|')).not.toMatch(/Room to roam|Tap a swimming resident|drawn for the island/);
    expect(shown).not.toContain('Growing with every dive');
    expect(shown).not.toContain('YOUR SANCTUARY');
  });

  test('says what is missing, in a short line, when nothing here can be seen swimming; what does swim is one tap away', async () => {
    mockSightings = logged(REEF);
    await render();
    expect(texts()).toContain('Your 2 species aren’t drawn for the island yet.');
    expect(texts().join('|')).not.toMatch(/Sharks, rays/);
    const more = buttons(/^$/).concat(root.root.findAll((n) => pressable(n) && n.props['aria-expanded'] === false));
    expect(more).toHaveLength(1);
    await press(more[0]);
    expect(texts().filter((t) => /Sharks, rays, reef fish/.test(t))).toHaveLength(1);
  });
});

describe('the tip over the island', () => {
  const TIP = 'Tap an animal to meet it.';

  test('is said once: the first time an animal swims there, and never again', async () => {
    mockSightings = logged(REEF);
    mockNoneSwim = false;
    await render();
    expect(texts()).toContain(TIP);
    expect(await AsyncStorage.getItem('scubago.homeTipSeen.v1')).toBe('1');
    // The next time Home opens, it is not there.
    await act(async () => root.unmount());
    await render();
    expect(texts()).not.toContain(TIP);
  });

  test('waits for something to tap: not on a first run, nor while nothing swims, and it is not used up by waiting', async () => {
    await render();
    expect(texts()).not.toContain(TIP);
    mockSightings = logged(REEF);
    await act(async () => root.update(<HomeScreen />));
    expect(texts()).not.toContain(TIP);
    expect(await AsyncStorage.getItem('scubago.homeTipSeen.v1')).toBeNull();
    mockNoneSwim = false;
    await act(async () => root.update(<HomeScreen />));
    expect(texts()).toContain(TIP);
  });

  test('goes at the diver’s first move: tapping an animal opens it', async () => {
    mockSightings = logged(REEF);
    mockNoneSwim = false;
    await render();
    expect(texts()).toContain(TIP);
    await act(async () => mockScene.onInspect('reef-manta'));
    expect(texts()).not.toContain(TIP);
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/inspect' }));
  });

  test('goes by itself after a while', async () => {
    jest.useFakeTimers();
    try {
      mockSightings = logged(REEF);
      mockNoneSwim = false;
      await render();
      expect(texts()).toContain(TIP);
      await act(async () => { jest.advanceTimersByTime(10_500); });
      expect(texts()).not.toContain(TIP);
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not take room of its own, so nothing moves when it goes', async () => {
    mockSightings = logged(REEF);
    mockNoneSwim = false;
    await render();
    const tip = root.root.findAll((n) => n.type === 'Text' && n.children.join('') === TIP)[0];
    const holder = tip.parent.parent;
    expect(StyleSheet.flatten(holder.props.style).position).toBe('absolute');
    expect(holder.props.pointerEvents).toBe('none');
  });
});

describe('a diver with animals', () => {
  beforeEach(() => { mockSightings = logged([...REEF, ...OPEN_OCEAN]); mockDives = [page(27)]; mockNext = 28; });

  test('sees the level once and the species count where it is new: three figures, no LEVEL tile, no ladder', async () => {
    await render();
    const shown = texts();
    expect(shown.filter((t) => /level \d/i.test(t))).toEqual(['Reef Scout · level 2']);
    expect(shown.filter((t) => t === 'LEVEL' || /^0\d$/.test(t))).toEqual([]);
    expect(shown.filter((t) => ['SPECIES', 'SIGHTINGS', 'SITES', 'SITE', 'LEVEL'].includes(t))).toEqual(['SPECIES', 'SIGHTINGS', 'SITE']);
    expect(shown).not.toContain('Species to grow your island');
    expect(shown).not.toContain('A collection journey, one encounter at a time.');
    expect(shown).toContain('5 more species for wider turquoise shallows.');
    expect(shown).toContain('3 / 8');
  });

  test('has one coral Log button, under the animals, naming the page; no “Next in your logbook” block around it', async () => {
    await render();
    const log = byTitle('Log dive No. 28');
    expect(log).toHaveLength(1);
    expect(drawn(log[0]).minHeight).toBeLessThan(56);
    const order = texts();
    expect(order.indexOf('Life around you')).toBeGreaterThan(-1);
    expect(order.indexOf('Log dive No. 28')).toBeGreaterThan(order.indexOf('Life around you'));
    expect(order.join('|')).not.toMatch(/Next in your logbook|dives in your log|first page is waiting/);
  });

  test('is told how close a milestone is only when it is close', async () => {
    await render();
    expect(texts().join('|')).not.toMatch(/dives to your|dive is next/);
    mockNext = 48;
    await act(async () => root.update(<HomeScreen />));
    expect(texts()).toContain('3 dives to your fiftieth');
    mockNext = 50;
    await act(async () => root.update(<HomeScreen />));
    expect(texts()).toContain('Your fiftieth dive is next');
  });
});

// The copy budget: what a diver has to read on Home. The report's targets are 35 words above the fold and 120 in all for a tab
// screen (25 on a first run); the island's own scene and the species plates are pictures with names, counted apart.
const words = (list) => list.join(' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu)?.length ?? 0;
const chrome = () => {
  const plates = root.root.findAll((n) => n.props.horizontal === true && n.props.contentContainerStyle && StyleSheet.flatten(n.props.contentContainerStyle).paddingVertical === 2 && StyleSheet.flatten(n.props.contentContainerStyle).gap === 10);
  const inPlates = new Set(plates.flatMap((p) => p.findAll((n) => typeof n.children?.[0] === 'string')));
  return root.root.findAll((n) => typeof n.children?.[0] === 'string' && !inPlates.has(n)).map((n) => n.children.join(''));
};

describe('the copy budget', () => {
  test('a seeded Home reads in at most 45 words around its plates, and says its title once', async () => {
    mockSightings = logged([...REEF, ...OPEN_OCEAN, ...KELP]);
    mockDives = [page(27)];
    mockNext = 28;
    mockNoneSwim = false;
    await render();
    const shown = chrome();
    expect(words(shown)).toBeLessThanOrEqual(45);
    expect(shown.filter((t) => t === 'Your ocean')).toHaveLength(1);
    // (The tip is a one-time extra: seven words.)
    expect(words(texts())).toBeLessThanOrEqual(45 + 40);
  });

  test('a first-run Home reads in at most 30 words, with one way in', async () => {
    await render();
    const shown = texts();
    expect(words(shown)).toBeLessThanOrEqual(30);
    expect(shown.filter((t) => t === 'Your ocean')).toHaveLength(1);
    // The coral button is the only way to log on the page (the tab bar's is not part of it).
    expect(byTitle(/^Log /)).toHaveLength(1);
  });
});
