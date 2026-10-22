import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Image, Modal } from 'react-native';
import { create } from 'react-test-renderer';
import HomeScreen from '@/app/(tabs)/index';
import { HERO_SNAPSHOT, registerSceneCapture } from '@/lib/scene-snapshot';

// The island's 3D scene (three.js), its editor and the first-launch intro are beside the point here.
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/home/sanctuary-scene', () => ({ SanctuaryScene: () => null }));
jest.mock('@/components/home/home-editor', () => ({ HomeEditor: () => null }));
jest.mock('@/components/home/three/sanctuary-environment', () => ({ WATER: { island: '#88ccc4', kelp: '#88ccc4', volcanic: '#88ccc4', mangrove: '#88ccc4', wreck: '#88ccc4' } }));
jest.mock('@/components/intro-cards', () => ({ IntroCards: () => null, useIntro: () => ({ show: false, done: () => {} }) }));
jest.mock('@/hooks/use-home-preferences', () => ({ useHomePreferences: () => ({ loading: false, preferences: { name: 'Kai’s Atoll' }, error: '', saving: false, save: async () => true }) }));
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => false }));
jest.mock('@/hooks/use-discovery-moments', () => ({
  useDiscoveryMoments: ({ level }) => ({ now: null, featured: [], waiting: [], level, loading: false, onArrived: () => {}, tag: null, banner: null, note: null, busy: false }),
}));
jest.mock('@/lib/macro-life', () => ({ macroResidents: () => [] }));
jest.mock('@/lib/swimming', () => ({ noneSwim: () => true }));
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: true, backendEnabled: false }),
  useMySightings: () => mockSightings,
  useMyDives: () => [],
  useMyUserId: () => 'local',
  useNextDiveNumber: () => 1,
}));

const sighting = (id, speciesId, over = {}) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over });

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockSightings = []; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<HomeScreen />); }); };
const shareButton = () => root.root.findAll((n) => n.props.accessibilityLabel === 'Share your archipelago' && typeof n.props.onPress === 'function');
const editButton = () => root.root.findAll((n) => n.props.accessibilityLabel === 'Customize your home' && typeof n.props.onPress === 'function');
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

describe('Home’s Share button', () => {
  test('sits beside "customize" once the diver has a species, and opens the archipelago card', async () => {
    mockSightings = [sighting('a', 'reef-manta'), sighting('b', 'whale-shark'), sighting('c', 'clownfish', { visibility: 'private' })];
    await render();
    expect(shareButton().length).toBeGreaterThan(0);
    expect(editButton().length).toBeGreaterThan(0);
    await act(async () => shareButton()[0].props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(1);
    const shown = texts();
    expect(shown).toEqual(expect.arrayContaining(['Share your archipelago', 'Kai’s Atoll', 'My rarest finds', '1 private sighting is left off this card.']));
    // The private clownfish is on Home's own screen (once, in "Life around you"), but not on the card.
    expect(shown.filter((t) => t === 'Ocellaris Clownfish')).toHaveLength(1);
    expect(shown.filter((t) => t === 'Reef Manta Ray')).toHaveLength(2);
  });

  test.each([
    ['nothing logged', []],
    ['only a private sighting', [sighting('a', 'reef-manta', { visibility: 'private' })]],
    ['only an example sighting', [sighting('a', 'reef-manta', { isDemo: true })]],
  ])('is not there with %s, though "customize" is', async (_name, sightings) => {
    mockSightings = sightings;
    await render();
    expect(shareButton()).toHaveLength(0);
    expect(editButton().length).toBeGreaterThan(0);
  });
});

describe('the picture of the 3D island on the archipelago card', () => {
  const cardImage = () => root.root.findAllByType(Image);
  const offs = [];
  const scene = (capture) => { const off = registerSceneCapture('home', capture); offs.push(off); return off; };
  afterEach(() => { while (offs.length) offs.pop()(); });
  beforeEach(() => { mockSightings = [sighting('a', 'reef-manta'), sighting('b', 'whale-shark')]; });

  test('is taken when Share is tapped, at twice the hero’s size, and put on the card', async () => {
    const capture = jest.fn(async () => 'blob:http://localhost/island');
    scene(capture);
    await render();
    await act(async () => shareButton()[0].props.onPress());
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(HERO_SNAPSHOT);
    expect(cardImage()).toHaveLength(1);
    expect(cardImage()[0].props.source).toEqual({ uri: 'blob:http://localhost/island' });
    expect(texts()).not.toContain('Framing your islands…');
  });

  test('is taken afresh every time the preview opens', async () => {
    const capture = jest.fn()
      .mockResolvedValueOnce('blob:http://localhost/one')
      .mockResolvedValueOnce('blob:http://localhost/two');
    scene(capture);
    await render();
    await act(async () => shareButton()[0].props.onPress());
    expect(cardImage()[0].props.source.uri).toBe('blob:http://localhost/one');
    await act(async () => root.root.findAll((n) => n.props.accessibilityLabel === 'Close the preview' && typeof n.props.onPress === 'function')[0].props.onPress());
    await act(async () => shareButton()[0].props.onPress());
    expect(capture).toHaveBeenCalledTimes(2);
    expect(cardImage()[0].props.source.uri).toBe('blob:http://localhost/two');
  });

  test('says it is framing the islands while the scene is read', async () => {
    let finish;
    scene(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    await act(async () => shareButton()[0].props.onPress());
    expect(texts()).toContain('Framing your islands…');
    expect(cardImage()).toHaveLength(0);
    await act(async () => finish('file:///cache/GLView/island.png'));
    expect(texts()).not.toContain('Framing your islands…');
    expect(cardImage()[0].props.source.uri).toBe('file:///cache/GLView/island.png');
  });

  test.each([
    ['Home has no scene (Lite mode, Reduce Motion, the scene’s error fallback, no WebGL)', null],
    ['the capture fails', () => { throw new Error('GL lost'); }],
    ['the capture returns nothing', async () => null],
  ])('the card draws its illustration when %s', async (_name, capture) => {
    if (capture) scene(capture);
    await render();
    await act(async () => shareButton()[0].props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(1);
    expect(cardImage()).toHaveLength(0);
    expect(texts()).toEqual(expect.arrayContaining(['Share your archipelago', 'My rarest finds']));
    expect(texts()).not.toContain('Framing your islands…');
  });

  test('a scene that is too slow gives up after about a second and a half', async () => {
    jest.useFakeTimers();
    try {
      scene(() => new Promise(() => {}));
      await render();
      await act(async () => shareButton()[0].props.onPress());
      expect(texts()).toContain('Framing your islands…');
      await act(async () => { await jest.advanceTimersByTimeAsync(1400); });
      expect(texts()).toContain('Framing your islands…');
      await act(async () => { await jest.advanceTimersByTimeAsync(200); });
      expect(texts()).not.toContain('Framing your islands…');
      expect(cardImage()).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
