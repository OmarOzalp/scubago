import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import SightingDetailScreen from '@/app/sighting/[id]';

// The header's buttons are drawn by the navigator; here the screen's own options are drawn in its place.
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 's1' }),
  Stack: { Screen: ({ options }) => (options?.headerRight ? options.headerRight() : null) },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/hooks/use-photo-url', () => ({ usePhotoUrl: () => undefined }));
jest.mock('@/components/buddy-verification', () => ({ BuddyVerification: () => null }));
jest.mock('@/components/sync-line', () => ({ SyncLine: () => null }));
let mockSighting;
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: [mockSighting], dives: [], backendEnabled: false, deleteSighting: jest.fn() }),
  useMyUserId: () => 'local',
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
}));

const sighting = (over = {}) => ({ id: 's1', userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over });

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockSighting = sighting(); router.push.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<SightingDetailScreen />); }); };
const button = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const titled = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function');
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

describe('the sighting page’s actions', () => {
  test('Edit is a header button for the diver’s own sighting, and not a button at the foot of the page', async () => {
    await render();
    expect(button('Edit sighting').length).toBeGreaterThan(0);
    await act(async () => button('Edit sighting')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { edit: 's1' } });
    expect(titled('Edit sighting')).toHaveLength(0);
  });

  test('another diver’s sighting has no Edit, and no way to delete', async () => {
    mockSighting = sighting({ userId: 'someone-else', username: 'reefdiver' });
    await render();
    expect(button('Edit sighting')).toHaveLength(0);
    expect(texts()).not.toContain('Delete sighting');
  });

  test('deleting stays in its own zone at the foot', async () => {
    await render();
    expect(texts()).toContain('Delete sighting');
  });
});
