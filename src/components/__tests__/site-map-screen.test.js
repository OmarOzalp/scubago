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
// The diver's sightings and the sites on offer (generated below, not part of the app's data).
let mockSites = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: [] }),
  useAllSites: () => mockSites,
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
  expect(text()).toContain('Log sighting here');
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
