import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import LogbookScreen from '@/app/(tabs)/logbook';
import DivePageScreen from '@/app/dive/[id]';
import SpeciesDetailScreen from '@/app/species/[id]';
import { canonicalSiteId, RETIRED_SITE_IDS, SITES, SITES_BY_ID } from '@/data/sites';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ready: false, badges: [], collections: [], passport: [], islands: [] }) }));
let mockParams = {};
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => {
  const { SITES: all, SITES_BY_ID: byId } = require('@/data/sites');
  const state = () => ({ sightings: mockSightings, user: null, backendEnabled: false, syncing: false, syncProblem: null, ready: true, requestSync: jest.fn(), deleteDive: jest.fn(), deleteSpeciesLog: jest.fn() });
  return {
    useAppStore: (select) => select(state()),
    useAllSites: () => all,
    useSiteById: () => (id) => byId.get(id),
    useMyDives: () => mockDives,
    useMySightings: () => mockSightings,
    useMyUserId: () => 'local',
    useDivesBefore: () => 0,
    useNextDiveNumber: () => mockDives.length + 1,
    usePendingChanges: () => ({ count: 0, failing: 0 }),
  };
});

/**
 * Two ids no longer listed, which a diver may have logged at while they were: OpenStreetMap's
 * "Shark Reef", hidden behind the seed Shark & Yolanda Reef, and the second Kormoran mark, retired.
 */
const SHARK_REEF = 'osm-node-271182010';
const KORMORAN = 'osm-node-663869852';

const dive = (id, number, siteId) => ({ id, userId: 'local', number, siteId, divedOn: `2026-03-0${number}`, synced: true, createdAt: `2026-03-0${number}T12:00:00Z` });
const sighting = (id, siteId, over = {}) => ({
  id, userId: 'local', username: 'you', speciesId: 'reef-manta', siteId, sightedOn: '2026-03-01', isDemo: false, synced: true, createdAt: '2026-03-01T10:00:00Z', ...over,
});

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockDives = [];
  mockSightings = [];
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

const labels = () => root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel);
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

test('the ids are hidden, but still a site', () => {
  for (const id of [SHARK_REEF, KORMORAN]) expect(SITES.some((s) => s.id === id)).toBe(false);
  expect(SITES_BY_ID.get(SHARK_REEF).name).toBe('Shark Reef');
  expect(canonicalSiteId(SHARK_REEF)).toBe('shark-yolanda');
  expect(RETIRED_SITE_IDS.has(KORMORAN)).toBe(true);
});

test('the logbook names the site of a page logged at a hidden id', async () => {
  mockDives = [dive('d1', 1, SHARK_REEF), dive('d2', 2, KORMORAN)];
  await act(async () => { root = create(<LogbookScreen />); });
  const rows = labels().filter((l) => l.startsWith('Dive '));
  expect(rows.some((l) => l.startsWith('Dive 1, Shark Reef'))).toBe(true);
  expect(rows.some((l) => l.startsWith('Dive 2, Kormoran'))).toBe(true);
  expect(texts()).not.toContain('Unknown site');
});

test('a dive page’s previous and next buttons name sites at hidden ids', async () => {
  mockDives = [dive('d1', 1, SHARK_REEF), dive('d2', 2, 'shark-yolanda'), dive('d3', 3, KORMORAN)];
  mockParams = { id: 'd2' };
  await act(async () => { root = create(<DivePageScreen />); });
  expect(labels()).toEqual(expect.arrayContaining(['Previous page: dive 1, Shark Reef', 'Next page: dive 3, Kormoran']));
});

test('an animal’s page counts a sighting at a hidden id at its site, names the site on its row, and on the share card', async () => {
  mockParams = { id: 'reef-manta' };
  mockSightings = [sighting('a', SHARK_REEF), sighting('b', 'shark-yolanda', { sightedOn: '2026-04-01', createdAt: '2026-04-01T10:00:00Z' }), sighting('c', KORMORAN, { userId: 'someone' })];
  await act(async () => { root = create(<SpeciesDetailScreen />); });

  // Where it's been seen: both Shark Reef sightings at Shark & Yolanda Reef, and the Kormoran.
  const seenAt = root.root.findAll((n) => n.props.site && typeof n.props.count === 'number' && typeof n.props.last === 'string');
  expect(seenAt.map((c) => [c.props.site.id, c.props.count])).toEqual([['shark-yolanda', 2], [canonicalSiteId(KORMORAN), 1]]);
  // The diver's sites: one, though logged under two ids.
  expect(root.root.findAll((n) => Array.isArray(n.props.items) && n.props.items.some((i) => i.label === 'Site')).length).toBeGreaterThan(0);

  // Each of the diver's rows says where it was logged.
  const rows = labels().filter((l) => /^Reef Manta Ray, /.test(l));
  expect(rows).toEqual(expect.arrayContaining([expect.stringContaining('Shark Reef'), expect.stringContaining('Shark & Yolanda Reef')]));

  // The share card is for the first sighting: at Shark Reef.
  const share = root.root.findAll((n) => n.props.accessibilityHint === 'Shows a picture of this discovery to share' && typeof n.props.onPress === 'function')[0];
  await act(async () => share.props.onPress());
  expect(texts().some((t) => /^First seen .* · Shark Reef$/.test(t))).toBe(true);
});
