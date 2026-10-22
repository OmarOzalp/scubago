import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import SpeciesDetailScreen from '@/app/species/[id]';
import { confirmAction } from '@/lib/confirm';
import { SITES } from '@/data/sites';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 'reef-manta' }),
  Stack: { Screen: () => null },
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
// The diver's sightings, someone else's, and the store's delete action.
const mockDelete = jest.fn(async () => 2);
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSightings, user: null, deleteSpeciesLog: mockDelete }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
  useMyUserId: () => 'local',
}));

const sighting = (id, userId, sightedOn) => ({
  id, userId, username: userId, speciesId: 'reef-manta', siteId: SITES[0].id, sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00Z`,
});

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockDelete.mockClear(); router.back.mockClear(); router.push.mockClear(); confirmAction.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const deleteButton = () => root.root.findAll((n) => n.props.accessibilityLabel === 'Delete your Reef Manta Ray log' && typeof n.props.onPress === 'function');

test("an animal's page lists the diver's sightings of it, each opening its own page, and deletes the whole log after asking", async () => {
  mockSightings = [sighting('a', 'local', '2026-03-01'), sighting('b', 'local', '2026-05-02'), sighting('c', 'someone', '2026-04-01')];
  await act(async () => { root = create(<SpeciesDetailScreen />); });

  // Only the diver's own sightings are listed, newest first; a tap opens that sighting's page (to edit or delete one).
  const rows = root.root.findAll((n) => typeof n.props.onPress === 'function' && /Reef Manta Ray, .*2026/.test(n.props.accessibilityLabel ?? ''));
  expect(rows.map((r) => r.props.accessibilityLabel)).toHaveLength(2);
  await act(async () => rows[0].props.onPress());
  expect(router.push).toHaveBeenCalledWith('/sighting/b');

  const [button] = deleteButton();
  await act(async () => button.props.onPress());
  expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete your Reef Manta Ray log?', destructive: true }));
  expect(confirmAction.mock.calls[0][0].message).toMatch(/All 2 of your Reef Manta Ray sightings .* leave your island/);
  expect(mockDelete).toHaveBeenCalledWith('reef-manta');
  expect(router.back).toHaveBeenCalled();
});

test('nothing is deleted when the diver says no, and an animal they have not logged has nothing to delete', async () => {
  mockSightings = [sighting('a', 'local', '2026-03-01')];
  confirmAction.mockImplementationOnce(async () => false);
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  await act(async () => deleteButton()[0].props.onPress());
  expect(confirmAction.mock.calls[0][0].message).toMatch(/^Your Reef Manta Ray sighting will be removed/);
  expect(mockDelete).not.toHaveBeenCalled();
  await act(async () => root.unmount());

  mockSightings = [sighting('c', 'someone', '2026-04-01')];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  expect(deleteButton()).toHaveLength(0);
});
