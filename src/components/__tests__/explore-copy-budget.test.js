import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import ExploreMapScreen from '@/app/(tabs)/map';

// The copy budget of the Explore tab: how many words the page says besides its list of sites, that it says
// its title once and has no eyebrow, and that the add-site button has a word as well as a picture.
// A page that gains a line has to say why here ("Quiet Journal" rules 2 to 6).

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
// Sites generated here, not part of the app's data: one of them seen by the diver.
const site = (id, name, region, country) => ({ id, name, region, country, lat: 27.2, lng: 33.85, blurb: '', notableSpecies: [], source: 'seed' });
const mockSites = [
  site('s1', '3 Pools', 'Sinai, Red Sea', 'Egypt'),
  site('s2', 'Abu Dabab', 'Marsa Alam & the south, Red Sea', 'Egypt'),
  site('s3', 'Cod Hole', 'Cairns/Cooktown, Great Barrier Reef', 'Australia'),
];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: [] }),
  useAllSites: () => mockSites,
  useMyDives: () => [],
  useMyUserId: () => 'local',
  useSiteById: () => () => undefined,
}));
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
  const MapView = forwardRef(function MockMapView(props, ref) {
    useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
    return createElement('map', props, props.children);
  });
  const Marker = (props) => createElement('marker', props, props.children);
  return { __esModule: true, default: MapView, Marker };
});

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  await AsyncStorage.clear();
  router.push.mockClear();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});

const render = async () => { await act(async () => { root = create(<ExploreMapScreen />); }); };
const flat = (n) => (typeof n === 'string' ? n : n.children.map(flat).join(''));
const words = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu) || []).length;
const texts = () => root.root.findAll((n) => n.type === 'Text').map(flat);
const label = (n) => n.props.accessibilityLabel ?? '';
const button = (name) => root.root.findAll((n) => typeof n.props.onPress === 'function' && label(n) === name)[0];
const box = (node) => StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

test('the tab says "Explore" once, with no eyebrow over it, and the page\'s own words are the title, the button and the search (at most 10 words)', async () => {
  await render();
  expect(texts().filter((t) => t === 'Explore')).toHaveLength(1);
  expect(texts().some((t) => /^dive sites$/i.test(t))).toBe(false);
  // Over the map the page has no list to count: the title, "Add site", and the search bar's own words.
  expect(texts().reduce((n, t) => n + words(t), 0)).toBeLessThanOrEqual(10);
});

test('adding a site is a button with its word beside the picture, 44 points to hit, named by what it says', async () => {
  await render();
  const add = button('Add site');
  expect(add.props.accessibilityRole).toBe('button');
  expect(texts()).toContain('Add site');
  expect(box(add).minHeight).toBeGreaterThanOrEqual(44);
  await act(async () => add.props.onPress());
  expect(router.push).toHaveBeenCalledWith('/add-site');
});

test('the list of sites says "Red Sea, Egypt", and the whole region only for two sites with one name', async () => {
  await render();
  await act(async () => button('Show sites as a list').props.onPress());
  const shown = texts();
  expect(shown).toContain('3 sites');
  expect(shown).toContain('3 Pools');
  expect(shown).toContain('Red Sea, Egypt');
  expect(shown).not.toContain('Sinai, Red Sea, Egypt');
  expect(shown).toContain('Great Barrier Reef, Australia');
  // A screen reader hears the whole place.
  expect(root.root.findAll((n) => label(n) === '3 Pools, Sinai, Red Sea, Egypt').length).toBeGreaterThan(0);
});

test('a site you pick says what has been seen there in a few words, or that nothing has (no dash, no exclamation)', async () => {
  await render();
  await act(async () => button('Show sites as a list').props.onPress());
  const row = root.root.findAll((n) => typeof n.props.onPress === 'function' && label(n) === '3 Pools, Sinai, Red Sea, Egypt')[0];
  await act(async () => row.props.onPress());
  expect(texts()).toContain('No sightings here yet.');
  expect(texts().join(' ')).not.toMatch(/—|!/);
  // The card is the site's region, its name, one line, and two buttons: about 15 words.
  expect(words(texts().find((t) => t === 'No sightings here yet.'))).toBeLessThanOrEqual(4);
});
