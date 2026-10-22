import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import SiteDetailScreen from '@/app/site/[id]';
import { SITES } from '@/data/sites';

jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => false, default: { View: require('react-native').View } }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: mockSiteId }),
  Stack: { Screen: () => null },
  Link: () => null,
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(), WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' } }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockSiteId = 'osm-test-wreck';
const mockOsmSite = { id: 'osm-test-wreck', name: 'Test Wreck', lat: -19.3, lng: 147.6, region: 'Queensland', country: 'Australia', blurb: 'A wreck from OpenStreetMap.', notableSpecies: [], source: 'seed' };
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: [], user: null }),
  useAllSites: () => [...require('@/data/sites').SITES, mockOsmSite],
  useSiteById: () => (id) => [...require('@/data/sites').SITES, mockOsmSite].find((s) => s.id === id),
  useMySightings: () => [],
  useMyDives: () => [],
}));
let mockHook = { summary: null, status: 'loading', refresh: () => {} };
jest.mock('@/hooks/use-site-sightings', () => ({ useSiteSightings: () => mockHook }));

let root;
const textOf = () => root.root.findAll((n) => typeof n.children?.[0] === 'string' && typeof n.type === 'string').map((n) => n.children.join('')).join(' | ');
const render = async () => { await act(async () => { root = create(<SiteDetailScreen />); }); };

beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const now = new Date().toISOString();
const ready = {
  summary: {
    siteId: 'osm-test-wreck', radiusKm: 3, fetchedAt: now,
    sources: [
      { id: 'inaturalist', ok: true, fetchedAt: now, attribution: 'a', licenceNote: 'l', url: 'https://www.inaturalist.org/observations?lat=1&lng=2' },
      { id: 'obis', ok: true, fetchedAt: now, attribution: 'o', licenceNote: 'l', url: 'https://obis.org' },
    ],
    species: [{ speciesId: 'green-turtle', inaturalist: { observations: 12 }, obis: { records: 3 } }],
    recent: [],
    unmatched: { inaturalist: 0, obis: 0 },
  },
  status: 'ready',
  refresh: () => {},
};

test('a site with no species list: real records are the "what is here", and the hand-made list is simply absent', async () => {
  mockHook = ready;
  await render();
  const text = textOf();
  expect(text).not.toContain('What divers see here');
  expect(text).toContain('Marine life recorded here');
  expect(text).toContain('12 iNaturalist observations');
  expect(text).toContain('3 records in OBIS datasets');
  // The page's own ScubaGo sightings stay a separate, labelled section.
  expect(text).toContain('Recent sightings');
  expect(text).toContain('None yet — be the first to log one.');
});

test('a site with no species list reads well while the records load, and when they cannot be reached', async () => {
  mockHook = { summary: null, status: 'loading', refresh: () => {} };
  await render();
  expect(textOf()).toContain('Looking up public records…');
  expect(textOf()).toContain('Log a sighting here');
  await act(async () => root.unmount());

  mockHook = { summary: null, status: 'offline', refresh: () => {} };
  await render();
  expect(textOf()).toContain('Couldn’t reach the public records right now.');
  expect(textOf()).toContain('Log a sighting here');
});

test('a curated site shows both its hand-made list and the public records, each with its own title', async () => {
  mockSiteId = 'yongala';
  mockHook = ready;
  try {
    await render();
    const text = textOf();
    expect(SITES.find((s) => s.id === 'yongala').notableSpecies.length).toBeGreaterThan(0);
    expect(text.indexOf('What divers see here')).toBeGreaterThan(-1);
    expect(text.indexOf('Marine life recorded here')).toBeGreaterThan(text.indexOf('What divers see here'));
    expect(text.indexOf('Recent sightings')).toBeGreaterThan(text.indexOf('Marine life recorded here'));
  } finally {
    mockSiteId = 'osm-test-wreck';
  }
});
