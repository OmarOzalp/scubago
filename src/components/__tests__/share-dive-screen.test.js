import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Modal } from 'react-native';
import { create } from 'react-test-renderer';
import DivePageScreen from '@/app/dive/[id]';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'd1' }),
  Stack: { Screen: () => null },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSightings, user: null, backendEnabled: false, deleteDive: jest.fn() }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
}));

const dive = (over = {}) => ({ id: 'd1', userId: 'local', number: 87, siteId: 'shark-yolanda', divedOn: '2026-03-12', maxDepthM: 28, centreName: 'Red Sea Divers', notes: 'Notes only for me', synced: true, createdAt: '2026-03-12T12:00:00Z', ...over });
const sighting = (id, speciesId, over = {}) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', diveId: 'd1', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over });

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockDives = [dive()]; mockSightings = []; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<DivePageScreen />); }); };
const shareButton = () => root.root.findAll((n) => n.props.accessibilityHint === 'Shows a picture of this logbook page to share' && typeof n.props.onPress === 'function');
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

describe('the dive page’s Share button', () => {
  test('is on a dive’s page, and opens that dive’s card without its notes or its private sightings', async () => {
    mockSightings = [sighting('a', 'reef-manta'), sighting('b', 'whale-shark', { visibility: 'private' })];
    await render();
    expect(shareButton().length).toBeGreaterThan(0);
    await act(async () => shareButton()[0].props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(1);
    const shown = texts();
    expect(shown).toEqual(expect.arrayContaining(['Share this dive', 'NOT VERIFIED', '1 private sighting is left off this card.']));
    // The page behind lists every animal and the notes (it is the diver's own); the card in the preview has only the shared animal and no notes.
    expect(shown.filter((t) => t === 'Reef Manta Ray')).toHaveLength(2);
    expect(shown.filter((t) => t === 'Whale Shark')).toHaveLength(1);
    expect(shown.filter((t) => t === 'Notes only for me')).toHaveLength(1);
  });

  test('is not there when the page isn’t in the diver’s log', async () => {
    mockDives = [];
    await render();
    expect(shareButton()).toHaveLength(0);
  });
});
