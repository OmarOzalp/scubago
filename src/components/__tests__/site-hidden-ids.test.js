import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import ExploreMapScreen from '@/app/(tabs)/map';
import SiteDetailScreen from '@/app/site/[id]';
import { canonicalSiteId, SITES, SITES_BY_ID } from '@/data/sites';

// The theme module imports the web stylesheet, which Jest can't parse.
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
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
jest.mock('@/hooks/use-site-sightings', () => ({ useSiteSightings: () => ({ summary: null, status: 'loading', refresh: () => {} }) }));
// The real dive sites, and sightings set by each test.
let mockSiteId = 'cod-hole';
let mockSightings = [];
jest.mock('@/lib/store', () => {
  const { SITES: all, SITES_BY_ID: byId } = require('@/data/sites');
  return {
    useAppStore: (select) => select({ sightings: mockSightings, user: null }),
    useAllSites: () => all,
    useSiteById: () => (id) => byId.get(id),
    useMySightings: () => [],
  };
});
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
  const MapView = forwardRef(function MockMapView(props, ref) {
    useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
    return createElement('map', props, props.children);
  });
  const Marker = (props) => createElement('marker', props, props.children);
  return { __esModule: true, default: MapView, Marker };
});

/** OpenStreetMap's own Cod Hole: hidden behind the seed, but a diver may have logged there while it was listed. */
const HIDDEN = 'osm-node-270802348';
const sighting = (over = {}) => ({
  id: 's1', userId: 'someone', username: 'reefdiver', speciesId: 'giant-moray', siteId: HIDDEN,
  sightedOn: '2026-05-01', isDemo: false, synced: true, createdAt: '2026-05-01T10:00:00.000Z', ...over,
});

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  router.push.mockClear();
  mockSightings = [sighting()];
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

const text = () => root.root.findAll((n) => typeof n.children?.[0] === 'string' && typeof n.type === 'string').map((n) => n.children.join('')).join(' | ');
const withLabel = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

test('the hidden id is a copy of Cod Hole, and Cod Hole has no giant moray of its own', () => {
  expect(canonicalSiteId(HIDDEN)).toBe('cod-hole');
  expect(SITES.some((s) => s.id === HIDDEN)).toBe(false);
  expect(SITES_BY_ID.get('cod-hole').notableSpecies).not.toContain('giant-moray');
});

test('a sighting logged at a hidden copy is on the page of the site it stands for', async () => {
  mockSiteId = 'cod-hole';
  await act(async () => { root = create(<SiteDetailScreen />); });
  expect(root.root.findAll((n) => n.props.accessibilityLabel === '1 sightings, 1 species').length).toBeGreaterThan(0);
  expect(text()).toContain('Giant Moray');
  expect(text()).not.toContain('None yet');
});

test('the hidden id’s own page is the listed site’s, so a sighting logged from it goes to the listed site', async () => {
  mockSiteId = HIDDEN;
  await act(async () => { root = create(<SiteDetailScreen />); });
  expect(text()).toContain(SITES_BY_ID.get('cod-hole').blurb);
  expect(root.root.findAll((n) => n.props.accessibilityLabel === '1 sightings, 1 species').length).toBeGreaterThan(0);
  const log = root.root.findAll((n) => n.props.title === 'Log a sighting here' && typeof n.props.onPress === 'function')[0];
  await act(async () => log.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { siteId: 'cod-hole' } });
});

test('on Explore, it counts on the site’s card and for the animal’s filter', async () => {
  jest.useFakeTimers();
  try {
    await act(async () => { root = create(<ExploreMapScreen />); });
    const map = () => root.root.findAll((n) => typeof n.props.onSelectSite === 'function' && 'highlightedSiteIds' in n.props)[0];

    // The card for Cod Hole has the giant moray logged at the copy.
    await act(async () => map().props.onSelectSite('cod-hole'));
    expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Giant Moray, 1 sighting').length).toBeGreaterThan(0);
    await act(async () => withLabel('Close').props.onPress());

    // "Where can I see a giant moray" has Cod Hole, where it was logged.
    await act(async () => withLabel('Search dive sites or animals').props.onPress());
    await act(async () => root.root.findByType(TextInput).props.onChangeText('giant moray'));
    await act(async () => withLabel('Giant Moray. Show where it’s seen').props.onPress());
    const seenAt = SITES.filter((s) => s.notableSpecies.includes('giant-moray') || s.id === 'cod-hole').length;
    expect(text()).toContain(`Seen at ${seenAt} sites`);
    expect(map().props.highlightedSiteIds.has('cod-hole')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    root = null;
    jest.useRealTimers();
  }
});
