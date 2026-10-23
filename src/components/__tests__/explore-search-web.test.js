import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { FlatList, Platform, TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import ExploreMapScreen from '@/app/(tabs)/map';
import { REGIONS_BY_ID } from '@/data/regions';
import { SITES } from '@/data/sites';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
jest.mock('@/lib/store', () => {
  const { SITES: all } = require('@/data/sites');
  const none = [];
  return { useAppStore: (select) => select({ sightings: [] }), useAllSites: () => all, useMyDives: () => none, useMyUserId: () => 'local', useSiteById: () => () => undefined };
});
// The web build's Explore tab: the site list stands in for the map (Metro picks this file on the web).
jest.mock('@/components/site-map', () => jest.requireActual('@/components/site-map.web'));

let root;
let scrollToIndex;
let scrollToOffset;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'web');
  router.push.mockClear();
  scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
  scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const PLACEHOLDER = 'Search dive sites or animals';

// Site counts from the data, as each import changes them: Egypt, and Hurghada & Safaga.
const inRegion = (site, id) => {
  for (let r = site.regionId; r; r = REGIONS_BY_ID.get(r)?.parentId) if (r === id) return true;
  return false;
};
const EGYPT = SITES.filter((s) => s.country === 'Egypt').length;
const HURGHADA = SITES.filter((s) => inRegion(s, 'red-sea-hurghada')).length;
const text = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join('')).join(' | ');
// The last one: a site is in the list under the search as well as in its results, and the results are drawn over the list.
const button = (label) => {
  const found = root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).at(-1);
  if (!found) throw new Error(`No button labelled "${label}"`);
  return found;
};
const hasButton = (label) => root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).length > 0;
const press = async (label) => act(async () => button(label).props.onPress());
const type = async (value) => { await act(async () => root.root.findByType(TextInput).props.onChangeText(value)); };
const submit = async () => { await act(async () => root.root.findByType(TextInput).props.onSubmitEditing()); };
// The site list's own FlatList (the search results have one too, while the search is open).
const listData = () => root.root.findAll((n) => n.type === FlatList && n.props.onScrollToIndexFailed)[0].props.data;
const reveal = () => root.root.findAll((n) => n.props.reveal !== undefined && Array.isArray(n.props.sites))[0].props.reveal;
const render = async () => { await act(async () => { root = create(<ExploreMapScreen />); }); await press(PLACEHOLDER); };

test('on the web the Explore tab is the site list, and its search finds a site by name', async () => {
  await render();
  expect(listData()).toHaveLength(SITES.length);
  expect(text()).toContain(`${SITES.length} sites`);
  await type('cod hole');
  expect(hasButton('Cod Hole, Great Barrier Reef, Australia')).toBe(true);
  await type('thistlegrom');
  expect(hasButton('SS Thistlegorm, Red Sea, Egypt')).toBe(true);
  await type('egypt');
  expect(hasButton(`Egypt, Country, ${EGYPT} dive sites`)).toBe(true);
  expect(hasButton(`Show all ${EGYPT} dive sites`)).toBe(true);
});

test('picking a site selects it and scrolls the list to it, where the native map would fly', async () => {
  await render();
  await type('thistlegorm');
  await press('SS Thistlegorm, Red Sea, Egypt');
  // The card is up (above the list), and the list was asked to show the site.
  expect(text()).toContain('Log a dive here');
  expect(reveal()).toMatchObject({ siteId: 'ss-thistlegorm' });
  await act(async () => { jest.advanceTimersByTime(100); });
  const index = listData().findIndex((s) => s.id === 'ss-thistlegorm');
  expect(index).toBeGreaterThan(0);
  expect(scrollToIndex).toHaveBeenCalledTimes(1);
  expect(scrollToIndex).toHaveBeenCalledWith({ index, animated: true, viewPosition: 0.1 });
  // Its row in the list is the one marked as selected (the list is windowed, and A to Z puts it well below the first screen of rows).
  expect(root.root.findAll((n) => n.props.selectedSiteId === 'ss-thistlegorm' && Array.isArray(n.props.sites)).length).toBeGreaterThan(0);
  await act(async () => button('Details about SS Thistlegorm').props.onPress());
  expect(router.push).toHaveBeenCalledWith('/site/ss-thistlegorm');
});

test('Return picks the top result on the web too', async () => {
  await render();
  await type('cod hole');
  await submit();
  expect(hasButton('Details about Cod Hole')).toBe(true);
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
});

test('picking a place lists only its sites, and the chip brings the rest back', async () => {
  await render();
  await type('hurghada');
  await press(`Hurghada & Safaga, Red Sea, Egypt, ${HURGHADA} dive sites`);
  expect(listData()).toHaveLength(HURGHADA);
  expect(listData().every((s) => s.country === 'Egypt')).toBe(true);
  expect(text()).toContain(`${HURGHADA} sites`);
  // The list goes back to the top for the new set.
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
  await press(`Showing the dive sites in Hurghada & Safaga: ${HURGHADA} sites. Clear`);
  expect(listData()).toHaveLength(SITES.length);
});

test('picking an animal still filters the list to where it is seen, and the search is there to find a site meanwhile', async () => {
  await render();
  await type('manta');
  await press('Reef Manta Ray. Show where it’s seen');
  const seen = SITES.filter((s) => s.notableSpecies.includes('reef-manta'));
  expect(listData()).toHaveLength(seen.length);
  expect(hasButton(`Showing where to see the Reef Manta Ray: ${seen.length} sites. Clear`)).toBe(true);
  // A site the filter leaves out can still be searched for: the filter gives way, so the list can show it.
  await press(PLACEHOLDER);
  await type('thistlegorm');
  await press('SS Thistlegorm, Red Sea, Egypt');
  expect(listData()).toHaveLength(SITES.length);
  expect(hasButton(`Showing where to see the Reef Manta Ray: ${seen.length} sites. Clear`)).toBe(false);
});

test('the site list is in alphabetical order, not the order the sites were added in', async () => {
  await render();
  const names = listData().map((s) => s.name);
  expect(names).toHaveLength(SITES.length);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});
