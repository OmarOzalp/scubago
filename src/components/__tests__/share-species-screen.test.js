import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Modal } from 'react-native';
import { create } from 'react-test-renderer';
import SpeciesDetailScreen from '@/app/species/[id]';
import { SITES } from '@/data/sites';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 'reef-manta' }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSightings, user: null, deleteSpeciesLog: jest.fn() }),
  useAllSites: () => require('@/data/sites').SITES,
  useMyUserId: () => 'local',
}));

const sighting = (id, over = {}) => ({
  id, userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: SITES[0].id, sightedOn: '2026-03-01', isDemo: false, synced: true, createdAt: '2026-03-01T10:00:00Z', ...over,
});

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<SpeciesDetailScreen />); }); };
const shareButton = () => root.root.findAll((n) => n.props.accessibilityHint === 'Shows a picture of this discovery to share' && typeof n.props.onPress === 'function');

describe('the species page’s Share button', () => {
  test('is there when the diver has seen the species, and opens the discovery card', async () => {
    mockSightings = [sighting('a')];
    await render();
    expect(shareButton().length).toBeGreaterThan(0);
    await act(async () => shareButton()[0].props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(1);
    const text = root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
    expect(text).toEqual(expect.arrayContaining(['Share your discovery', 'No. 1 in my collection']));
  });

  test.each([
    ['has not seen the species', []],
    ['has only seen it on a private sighting', [sighting('a', { visibility: 'private' })]],
    ['has only an example sighting of it', [sighting('a', { isDemo: true })]],
    ['only has someone else’s sighting of it', [sighting('a', { userId: 'someone' })]],
    ['has only seen another species', [sighting('a', { speciesId: 'whale-shark' })]],
  ])('is not there when the diver %s', async (_name, sightings) => {
    mockSightings = sightings;
    await render();
    expect(shareButton()).toHaveLength(0);
  });
});
