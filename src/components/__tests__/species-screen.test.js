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
// A plain <img> that keeps its props, so a test can say the photo failed to load.
jest.mock('expo-image', () => ({ Image: (props) => require('react').createElement('img', props) }));
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

const textOf = () => root.root.findAll((n) => typeof n.type === 'string' && n.children.some((c) => typeof c === 'string')).map((n) => n.children.filter((c) => typeof c === 'string').join('')).join(' | ');
const photo = () => root.root.findAll((n) => n.type === 'img');

test('an animal not seen yet has "I saw one! Log it" straight after its description, above the photo and the rest', async () => {
  mockSightings = [];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  const text = textOf();
  const blurb = text.indexOf('A 3–4 m wing-span acrobat');
  const log = text.indexOf('I saw one! Log it');
  expect(blurb).toBeGreaterThan(-1);
  expect(log).toBeGreaterThan(blurb);
  // Nothing but the blurb comes between: the photo's credit, the 3D button and the sites all follow it.
  expect(text.slice(blurb, log).split(' | ')).toHaveLength(2);
  for (const later of ['iNaturalist ›', 'See reef manta ray in 3D', 'Where it’s been seen']) expect(text.indexOf(later)).toBeGreaterThan(log);

  const [button] = root.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && n.props.title === 'I saw one! Log it');
  await act(async () => button.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { speciesId: 'reef-manta' } });
});

test('an animal the diver has seen is not asked for again, and can be logged once more lower down', async () => {
  mockSightings = [sighting('a', 'local', '2026-03-01')];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  expect(textOf()).not.toContain('I saw one! Log it');
  expect(textOf()).toContain('Log another sighting');
});

test('a photo that cannot be loaded gives way to a note, not an empty card', async () => {
  mockSightings = [];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  expect(photo()).toHaveLength(1);
  expect(textOf()).not.toContain('couldn’t be loaded');
  await act(async () => photo()[0].props.onError());
  expect(photo()).toHaveLength(0);
  expect(textOf()).toContain('The photo couldn’t be loaded.');
  expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Photo of a Reef Manta Ray: couldn’t be loaded').length).toBeGreaterThan(0);
});
