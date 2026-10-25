import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import SpeciesDetailScreen from '@/app/species/[id]';
import { confirmAction } from '@/lib/confirm';
import { SITES } from '@/data/sites';

let mockHeader;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 'reef-manta' }),
  // The header options the page sets, so a test can say what the header shows.
  Stack: { Screen: ({ options }) => { mockHeader = options; return null; } },
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
  for (const later of ['iNaturalist ›', 'See reef manta ray in 3D']) expect(text.indexOf(later)).toBeGreaterThan(log);
  // With no sighting of it anywhere there is nothing to say under "Where it’s been seen", so the heading is not there.
  expect(text).not.toContain('Where it’s been seen');

  const [button] = root.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && n.props.title === 'I saw one! Log it');
  await act(async () => button.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { speciesId: 'reef-manta' } });
});

test('an animal the diver has seen is not asked for again: their own record comes first, with the way to log another straight under it', async () => {
  mockSightings = [sighting('a', 'local', '2026-03-01')];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  const text = textOf();
  expect(text).not.toContain('I saw one! Log it');
  // The record, then "Log another sighting", then the share button, then the photo's credit and the 3D link.
  const order = ['A 3–4 m wing-span acrobat', 'In your log', 'Log another sighting', 'Share this discovery', 'iNaturalist ›', 'See reef manta ray in 3D'].map((s) => text.indexOf(s));
  expect(order.every((i) => i > -1)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  // It is the filled (coral) button of the page, and logs this animal.
  const [button] = root.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && n.props.title === 'Log another sighting');
  expect(button.props.variant).toBe('log');
  await act(async () => button.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { speciesId: 'reef-manta' } });
});

test('the diver’s own sighting rows do not say "Only you": it is the same on every row', async () => {
  mockSightings = [{ ...sighting('a', 'local', '2026-03-01'), visibility: 'private' }];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  expect(textOf()).not.toContain('Only you');
  // The screen reader still hears it.
  expect(root.root.findAll((n) => /only you can see it/.test(n.props.accessibilityLabel ?? '')).length).toBeGreaterThan(0);
});

test('"Where it’s been seen" shows for two sites or more, and not when it only repeats the one sighting above', async () => {
  mockSightings = [sighting('a', 'local', '2026-03-01')];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  expect(textOf()).not.toContain('Where it’s been seen');
  await act(async () => root.unmount());

  mockSightings = [sighting('a', 'local', '2026-03-01'), { ...sighting('b', 'local', '2026-03-02'), siteId: SITES[3].id }];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  expect(textOf()).toContain('Where it’s been seen');
});

test('the photo credit is short, keeps the photographer and the licence, and still reads in full to a screen reader', async () => {
  mockSightings = [];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  const credit = textOf().split(' | ').find((t) => t.includes('iNaturalist ›'));
  expect(credit).toMatch(/^Photo: .+ \(CC [A-Z0-9 -]+\) · iNaturalist ›$/);
  expect(credit).not.toMatch(/some rights reserved|uploaded by/);
  const link = root.root.findAll((n) => n.props.accessibilityRole === 'link' && /^Photo \(c\)|^Photo no rights/.test(n.props.accessibilityLabel ?? ''));
  expect(link.length).toBeGreaterThan(0);
});

test('the header shows only the back arrow: the page’s own title is the big one below', async () => {
  mockSightings = [];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  expect(mockHeader.headerTitle).toBe('');
  // The title is kept for the browser tab.
  expect(mockHeader.title).toBe('Reef Manta Ray');
  expect(textOf().split(' | ').filter((t) => t === 'Reef Manta Ray')).toHaveLength(1);
});

test('"How rare?" is the shared disclosure: closed to begin with, and it opens where the rarity comes from', async () => {
  mockSightings = [];
  await act(async () => { root = create(<SpeciesDetailScreen />); });
  const [toggle] = root.root.findAll((n) => n.props.accessibilityLabel === 'How rare?' && typeof n.props.onPress === 'function');
  expect(toggle.props['aria-expanded']).toBe(false);
  expect(textOf()).not.toContain('estimate');
  await act(async () => toggle.props.onPress());
  expect(textOf()).toMatch(/Rarity is ScubaGo’s own estimate|recorded near/i);
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
