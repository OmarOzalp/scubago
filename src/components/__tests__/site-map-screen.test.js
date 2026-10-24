import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import ExploreMapScreen from '@/app/(tabs)/map';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
// The sites on offer (generated below, not part of the app's data), and the sightings and dives a test gives the diver.
let mockSites = [];
let mockSightings = [];
let mockDives = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSightings }),
  useAllSites: () => mockSites,
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
  useSiteById: () => (id) => mockSites.find((s) => s.id === id),
}));
let mockMap = null;
const mockMarkerRenders = [];
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
  const MapView = forwardRef(function MockMapView(props, ref) {
    mockMap = props;
    useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
    return createElement('map', props, props.children);
  });
  const Marker = (props) => {
    mockMarkerRenders.push(props.accessibilityLabel);
    return createElement('marker', props, props.children);
  };
  return { __esModule: true, default: MapView, Marker };
});

const dense = (prefix) =>
  Array.from({ length: 60 }, (_, i) => ({
    id: `${prefix}${i}`, name: `Reef ${i}`, region: 'Hurghada & Safaga, Red Sea', country: 'Egypt', blurb: '', notableSpecies: [], source: 'seed',
    lat: 27.2 + (i % 8) * 0.0007, lng: 33.85 + Math.floor(i / 8) * 0.0007,
  }));

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockMarkerRenders.length = 0;
  router.push.mockClear();
  mockSites = dense('osm-node-');
  mockSightings = [];
  mockDives = [];
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});

const text = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join('')).join(' | ');
const markers = () => root.root.findAllByType('marker');

test('on the Explore map, tapping a pin opens the site’s card without redrawing a single marker', async () => {
  await act(async () => { root = create(<ExploreMapScreen />); });
  // Zoomed out, the sixty sites are a few clusters; zoomed in they are pins.
  expect(markers().length).toBeLessThan(10);
  await act(async () => { mockMap.onRegionChangeComplete({ latitude: 27.2025, longitude: 33.8525, latitudeDelta: 0.012, longitudeDelta: 0.008 }); jest.advanceTimersByTime(200); });
  expect(markers()).toHaveLength(60);
  mockMarkerRenders.length = 0;

  const pin = markers().find((m) => m.props.accessibilityLabel.startsWith('Reef 12,'));
  await act(async () => pin.props.onPress());
  // The card for the site is up, with its way to the page and to logging...
  expect(text()).toContain('Reef 12');
  expect(text()).toContain('Details');
  expect(text()).toContain('Log a dive here');
  // ...and the map was not touched.
  expect(mockMarkerRenders).toEqual([]);

  // Another pin: the card changes, the map still doesn't.
  await act(async () => markers().find((m) => m.props.accessibilityLabel.startsWith('Reef 30,')).props.onPress());
  expect(text()).toContain('Reef 30');
  expect(mockMarkerRenders).toEqual([]);

  // Details opens the site's page.
  const details = root.root.findAll((n) => n.props.accessibilityLabel === 'Details about Reef 30' && typeof n.props.onPress === 'function')[0];
  await act(async () => details.props.onPress());
  expect(router.push).toHaveBeenCalledWith('/site/osm-node-30');
});

test('the credit shows on the Explore map for imported sites, and not for the curated ones', async () => {
  await act(async () => { root = create(<ExploreMapScreen />); });
  expect(root.root.findAllByType('extlink')).toHaveLength(1);
  await act(async () => root.unmount());
  mockSites = dense('seed-');
  await act(async () => { root = create(<ExploreMapScreen />); });
  expect(root.root.findAllByType('extlink')).toHaveLength(0);
});

const dive = (number, siteId) => ({ id: `d${number}`, userId: 'local', number, siteId, divedOn: `2026-03-${10 + number}`, createdAt: `2026-03-${10 + number}T12:00:00Z` });
const seen = (id, userId, over = {}) => ({ id, userId, username: userId, speciesId: 'reef-manta', siteId: 'osm-node-5', sightedOn: '2026-03-12', isDemo: false, createdAt: '2026-03-12T10:00:00Z', ...over });

test('the map opens on the diver’s last site, not on South-East Asia', async () => {
  await act(async () => { root = create(<ExploreMapScreen />); });
  // Nothing logged yet: where most of the sites are.
  expect(mockMap.initialRegion).toMatchObject({ latitude: 12, longitude: 100 });
  await act(async () => root.unmount());

  // The newest page's site (page 3), whatever order they were written in.
  mockDives = [dive(2, 'osm-node-9'), dive(3, 'osm-node-5'), dive(1, 'osm-node-12')];
  await act(async () => { root = create(<ExploreMapScreen />); });
  const site = mockSites.find((s) => s.id === 'osm-node-5');
  expect(mockMap.initialRegion.latitude).toBeCloseTo(site.lat, 5);
  expect(mockMap.initialRegion.longitude).toBeCloseTo(site.lng, 5);
  // The region round it, not only the one site.
  expect(mockMap.initialRegion.latitudeDelta).toBeGreaterThanOrEqual(4);
  await act(async () => root.unmount());

  // No pages, but an animal logged: where it was last seen. Other divers' sightings don't count.
  mockDives = [];
  mockSightings = [seen('a', 'local', { siteId: 'osm-node-9', sightedOn: '2026-02-01' }), seen('b', 'local', { siteId: 'osm-node-20', sightedOn: '2026-03-01' }), seen('c', 'someone', { siteId: 'osm-node-30', sightedOn: '2026-04-01' })];
  await act(async () => { root = create(<ExploreMapScreen />); });
  const last = mockSites.find((s) => s.id === 'osm-node-20');
  expect(mockMap.initialRegion.latitude).toBeCloseTo(last.lat, 5);
});

test('the site card says whose each count is, and logs a dive from the site in coral', async () => {
  mockSightings = [seen('a', 'local'), seen('b', 'local'), seen('c', 'someone'), seen('d', 'someone'), seen('e', 'someone'), seen('f', 'someone', { speciesId: 'whale-shark' })];
  await act(async () => { root = create(<ExploreMapScreen />); });
  await act(async () => { mockMap.onRegionChangeComplete({ latitude: 27.2025, longitude: 33.8525, latitudeDelta: 0.012, longitudeDelta: 0.008 }); jest.advanceTimersByTime(200); });
  await act(async () => markers().find((m) => m.props.accessibilityLabel.startsWith('Reef 5,')).props.onPress());
  expect(text()).toContain('2 of yours · 3 by others');
  expect(text()).toContain('1 by others');
  expect(text()).not.toMatch(/×\d/);
  expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Reef Manta Ray, 2 of yours · 3 by others').length).toBeGreaterThan(0);
  // The most seen first.
  expect(text().indexOf('Reef Manta Ray')).toBeLessThan(text().indexOf('Whale Shark'));

  const log = root.root.findAll((n) => n.props.title === 'Log a dive here' && typeof n.props.onPress === 'function')[0];
  expect(log.props.variant).toBe('log');
  await act(async () => log.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { siteId: 'osm-node-5' } });
});
