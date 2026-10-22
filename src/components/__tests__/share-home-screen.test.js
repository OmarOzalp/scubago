import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Modal } from 'react-native';
import { create } from 'react-test-renderer';
import HomeScreen from '@/app/(tabs)/index';

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
