import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { FlatList, StyleSheet, TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import ExploreMapScreen from '@/app/(tabs)/map';
import { REGIONS_BY_ID } from '@/data/regions';
import { SITES } from '@/data/sites';
import { announce } from '@/lib/announce';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
// The real dive sites: 69 curated and the imported ones.
jest.mock('@/lib/store', () => {
  const { SITES: all } = require('@/data/sites');
  const none = [];
  return { useAppStore: (select) => select({ sightings: [] }), useAllSites: () => all, useMyDives: () => none, useMyUserId: () => 'local', useSiteById: () => () => undefined };
});
const mockAnimateToRegion = jest.fn();
let mockMapRenders = 0;
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
  const MapView = forwardRef(function MockMapView(props, ref) {
    mockMapRenders += 1;
    useImperativeHandle(ref, () => ({ animateToRegion: (...args) => mockAnimateToRegion(...args) }));
    return createElement('map', props, props.children);
  });
  const Marker = (props) => createElement('marker', props, props.children);
  return { __esModule: true, default: MapView, Marker };
});

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  router.push.mockClear();
  announce.mockClear();
  mockAnimateToRegion.mockClear();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});

const PLACEHOLDER = 'Search dive sites or animals';

// Site counts from the data, as each import changes them: Egypt, the Red Sea (its parts included), Hurghada & Safaga.
const inRegion = (site, id) => {
  for (let r = site.regionId; r; r = REGIONS_BY_ID.get(r)?.parentId) if (r === id) return true;
  return false;
};
const EGYPT = SITES.filter((s) => s.country === 'Egypt').length;
const RED_SEA = SITES.filter((s) => inRegion(s, 'red-sea')).length;
const HURGHADA = SITES.filter((s) => inRegion(s, 'red-sea-hurghada')).length;
const GBR = SITES.filter((s) => inRegion(s, 'great-barrier-reef')).length;
const text = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join('')).join(' | ');
// Everything pressable that says what it is (once: a row passes its label on to the Pressable inside it).
const allPressables = () => root.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string');
const pressables = () => {
  const all = allPressables();
  return all.filter((n) => !all.includes(n.parent) || n.parent.props.accessibilityLabel !== n.props.accessibilityLabel);
};
const byTitle = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const pressable = (label) => {
  const found = pressables().find((p) => p.props.accessibilityLabel === label);
  if (!found) throw new Error(`No button labelled "${label}". Buttons: ${pressables().map((p) => p.props.accessibilityLabel).filter(Boolean).join(' / ')}`);
  return found;
};
const hasButton = (label) => pressables().some((p) => p.props.accessibilityLabel === label);
const labelsStarting = (start) => pressables().map((p) => p.props.accessibilityLabel).filter((l) => l?.startsWith(start));
const input = () => root.root.findByType(TextInput);
// The headings as a screen reader finds them: the views and texts themselves, not the components that made them.
const headingNodes = () => root.root.findAll((n) => n.props.accessibilityRole === 'header' && typeof n.type === 'string');
// (without the page's own title)
const headings = () => headingNodes().map((n) => n.props.accessibilityLabel ?? n.children.join('')).filter((h) => h !== 'Explore');
const press = async (label) => act(async () => pressable(label).props.onPress());
const render = async () => { await act(async () => { root = create(<ExploreMapScreen />); }); };
const openSearch = async () => { await press(PLACEHOLDER); };
const type = async (value) => { await act(async () => input().props.onChangeText(value)); };
const submit = async () => { await act(async () => input().props.onSubmitEditing()); };
const markers = () => root.root.findAllByType('marker');

const mantaSites = SITES.filter((s) => s.notableSpecies.includes('reef-manta'));

test('the bar says it searches dive sites or animals, and opens to suggestions of each kind', async () => {
  await render();
  expect(text()).toContain(PLACEHOLDER);
  expect(pressable(PLACEHOLDER).props.accessibilityRole).toBe('search');
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  await openSearch();
  expect(input().props.placeholder).toBe(PLACEHOLDER);
  expect(input().props.accessibilityLabel).toBe(PLACEHOLDER);
  expect(input().props.returnKeyType).toBe('search');
  expect(headings()).toEqual(['Try searching for']);
  // "Where can I see a…" lives on as the animals' suggestion.
  expect(text()).toContain('Where can I see a…');
  // Tapping a suggestion searches for it.
  await press('Cod Hole. A dive site');
  expect(input().props.value).toBe('Cod Hole');
  expect(labelsStarting('Cod Hole,')).toHaveLength(1);
});

test('"cod hole" finds Cod Hole under dive sites', async () => {
  await render();
  await openSearch();
  await type('cod hole');
  // Once: OpenStreetMap's Cod Hole is the curated one, 2.6 km from where the seed puts it.
  expect(headings()).toEqual(['Dive sites, 1 match']);
  expect(labelsStarting('Cod Hole,')).toEqual(['Cod Hole, Great Barrier Reef, Australia']);
});

test('"manta" shows the reef manta under animals, below the Manta sites, with the old "Where can I see a…" question', async () => {
  await render();
  await openSearch();
  await type('manta');
  expect(headings()).toEqual(['Dive sites, 4 matches', 'Animals, where can I see a, 6 matches']);
  expect(hasButton('Reef Manta Ray. Show where it’s seen')).toBe(true);
  expect(text()).toContain('Where can I see a…');
  expect(labelsStarting('Manta ').length).toBe(4);
  // Only the first few of a section show, with a way to the rest.
  expect(hasButton('Show all 6 animals')).toBe(true);
  expect(labelsStarting('Mandarinfish')).toHaveLength(0);
});

test('"egypt" and "hurghada" list the Red Sea sites, and "show all" opens every one', async () => {
  await render();
  await openSearch();
  await type('egypt');
  expect(headings()).toEqual(['Places, 1 match', `Dive sites, ${EGYPT} matches`]);
  expect(hasButton(`Egypt, Country, ${EGYPT} dive sites`)).toBe(true);
  expect(labelsStarting('Blue Hole, Dahab, Egypt')).toHaveLength(1);
  const rows = () => root.root.findByType(FlatList).props.data;
  // 2 headings, 1 place, 3 sites and the "show all" row.
  expect(rows()).toHaveLength(2 + 1 + 3 + 1);
  await press(`Show all ${EGYPT} dive sites`);
  expect(rows()).toHaveLength(2 + 1 + EGYPT + 1);
  // The way back is in the section's heading, which stays at the top as the rows scroll, not hundreds of rows down.
  const listProps = root.root.findByType(FlatList).props;
  expect(listProps.stickyHeaderIndices).toEqual([0, 2]);
  expect(pressable('Show fewer dive sites').props.accessibilityState).toEqual({ expanded: true });
  await press('Show fewer dive sites');
  expect(rows()).toHaveLength(2 + 1 + 3 + 1);

  await type('hurghada');
  expect(headings()[0]).toBe('Places, 1 match');
  expect(hasButton(`Hurghada & Safaga, Red Sea, Egypt, ${HURGHADA} dive sites`)).toBe(true);
  expect(headings()[1]).toMatch(/^Dive sites, 8\d matches$/);
  expect(labelsStarting('SS Thistlegorm')).toEqual(['SS Thistlegorm, Red Sea, Egypt']);
});

test('a typo still finds the site', async () => {
  await render();
  await openSearch();
  await type('thistlegrom');
  expect(headings()).toEqual(['Dive sites, 1 match']);
  expect(hasButton('SS Thistlegorm, Red Sea, Egypt')).toBe(true);
});

test('tapping a site selects it as a tapped pin does: its card opens and the map flies to it', async () => {
  await render();
  await openSearch();
  await type('thistlegrom');
  await press('SS Thistlegorm, Red Sea, Egypt');
  // The search is closed, and the card for the site is up with its way to the page and to logging.
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  expect(text()).toContain('SS Thistlegorm');
  expect(text()).toContain('Log a dive here');
  expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
  const [region] = mockAnimateToRegion.mock.calls[0];
  expect(region.latitude).toBeCloseTo(27.813, 3);
  expect(region.longitude).toBeCloseTo(33.92, 3);
  // Close enough that the site is a pin of its own, not part of a cluster.
  expect(region.longitudeDelta).toBeLessThan(0.015);
  await act(async () => pressable('Details about SS Thistlegorm').props.onPress());
  expect(router.push).toHaveBeenCalledWith('/site/ss-thistlegorm');
  // Closing the card leaves the map where it is.
  await act(async () => pressable('Close').props.onPress());
  expect(text()).not.toContain('Log a dive here');
  expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
});

test('tapping an animal applies the species filter, and the chip clears it; the search stays open to use', async () => {
  await render();
  await openSearch();
  await type('manta');
  await press('Reef Manta Ray. Show where it’s seen');
  const chip = `Showing where to see the Reef Manta Ray: ${mantaSites.length} sites. Clear`;
  expect(hasButton(chip)).toBe(true);
  expect(text()).toContain(`Seen at ${mantaSites.length} sites`);
  expect(text()).toContain('Where to see it');
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  // The map doesn't move for an animal, as before.
  expect(mockAnimateToRegion).not.toHaveBeenCalled();
  // The bar is still there, under the filter's, so a site can be searched while it is on.
  expect(hasButton(PLACEHOLDER)).toBe(true);
  await press(chip);
  expect(hasButton(chip)).toBe(false);
  expect(text()).not.toContain('Where to see it');
});

test('a site the filter includes keeps the filter; one it leaves out clears it, so it isn’t hidden', async () => {
  await render();
  await openSearch();
  await type('manta');
  await press('Reef Manta Ray. Show where it’s seen');
  const chip = `Showing where to see the Reef Manta Ray: ${mantaSites.length} sites. Clear`;

  await openSearch();
  await type('manta sandy');
  await press('Manta Sandy, Raja Ampat, Indonesia');
  expect(hasButton(chip)).toBe(true);
  expect(text()).toContain('Log a dive here');

  await openSearch();
  await type('thistlegorm');
  await press('SS Thistlegorm, Red Sea, Egypt');
  expect(hasButton(chip)).toBe(false);
  expect(text()).toContain('Details'); // its card is up, though the filter left it out
});

test('the map and the list forget the site searched for once another site, or an animal, is chosen', async () => {
  const scrolls = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
  const switchView = async (label) => {
    await press(label);
    await act(async () => jest.advanceTimersByTime(200));
  };
  const siteList = () => root.root.findAll((n) => typeof n.props.onSelectSite === 'function' && 'reveal' in n.props)[0];
  const scrolledTo = () => scrolls.mock.calls.map(([{ index }]) => root.root.findAll((n) => n.type === FlatList && n.props.data?.length === SITES.length)[0].props.data[index].id);
  try {
    await render();
    await openSearch();
    await type('thistlegorm');
    await press('SS Thistlegorm, Red Sea, Egypt');
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    // Its card is open, so the list scrolls to it.
    await switchView('Show sites as a list');
    expect(scrolledTo()).toEqual(['ss-thistlegorm']);
    scrolls.mockClear();

    // Another site, chosen from its row: the map that comes back stays put, and so does the list.
    await act(async () => siteList().props.onSelectSite('cod-hole'));
    expect(text()).toContain('Cod Hole');
    await switchView('Show the map');
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    await switchView('Show sites as a list');
    expect(scrolledTo()).toEqual([]);

    // A site, then an animal: the same.
    await openSearch();
    await type('thistlegorm');
    await press('SS Thistlegorm, Red Sea, Egypt');
    await openSearch();
    await type('manta');
    await press('Reef Manta Ray. Show where it’s seen');
    mockAnimateToRegion.mockClear();
    await switchView('Show the map');
    expect(mockAnimateToRegion).not.toHaveBeenCalled();
  } finally {
    scrolls.mockRestore();
  }
});

test('tapping a place shows only its sites and frames them on the map; picking an animal replaces it', async () => {
  await render();
  await openSearch();
  await type('red sea');
  expect(headings()[0]).toBe('Places, 5 matches');
  await press(`Red Sea, Region, ${RED_SEA} dive sites`);
  const chip = `Showing the dive sites in Red Sea: ${RED_SEA} sites. Clear`;
  expect(hasButton(chip)).toBe(true);
  expect(text()).toContain('In Red Sea');
  // The map frames the Red Sea's sites (Egypt, 22 to 29 N).
  expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
  const [region] = mockAnimateToRegion.mock.calls[0];
  expect(region.latitude).toBeGreaterThan(22);
  expect(region.latitude).toBeLessThan(30);
  expect(region.latitudeDelta).toBeGreaterThan(3);
  expect(region.latitudeDelta).toBeLessThan(12);

  await openSearch();
  await type('manta');
  await press('Reef Manta Ray. Show where it’s seen');
  expect(hasButton(chip)).toBe(false);
  expect(hasButton(`Showing where to see the Reef Manta Ray: ${mantaSites.length} sites. Clear`)).toBe(true);
  expect(text()).toContain('Where to see it');

  await openSearch();
  await type('great barrier reef');
  await press(`Great Barrier Reef, Australia, ${GBR} dive sites`);
  expect(hasButton(`Showing the dive sites in Great Barrier Reef: ${GBR} sites. Clear`)).toBe(true);
  expect(hasButton(`Showing where to see the Reef Manta Ray: ${mantaSites.length} sites. Clear`)).toBe(false);
  await press(`Showing the dive sites in Great Barrier Reef: ${GBR} sites. Clear`);
  expect(text()).not.toContain('In Great Barrier Reef');
});

test('Return picks the top result: a site, a place or an animal', async () => {
  await render();
  await openSearch();
  await type('cod hole');
  await submit();
  expect(text()).toContain('Log a dive here');
  expect(hasButton('Details about Cod Hole')).toBe(true);
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  await act(async () => pressable('Details about Cod Hole').props.onPress());
  expect(router.push).toHaveBeenCalledWith('/site/cod-hole');

  await openSearch();
  await type('whale shark');
  await submit();
  expect(labelsStarting('Showing where to see the Whale Shark')).toHaveLength(1);

  await openSearch();
  await type('egypt');
  await submit();
  expect(labelsStarting(`Showing the dive sites in Egypt: ${EGYPT} sites`)).toHaveLength(1);
  expect(labelsStarting('Showing where to see')).toHaveLength(0);

  // Nothing to pick: the search stays open.
  await openSearch();
  await type('xyzzy');
  await submit();
  expect(root.root.findAllByType(TextInput)).toHaveLength(1);
});

test('Return uses what is in the field now, even if the results are a keystroke behind', async () => {
  await render();
  await openSearch();
  await type('cod hol');
  await type('whale shark');
  await submit();
  expect(labelsStarting('Showing where to see the Whale Shark')).toHaveLength(1);
});

test('no match says so politely, and offers to add the site with what was typed', async () => {
  await render();
  await openSearch();
  await type('Blue Lagoon Hideaway');
  expect(text()).toContain('Nothing matches “Blue Lagoon Hideaway”.');
  expect(root.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite').length).toBeGreaterThan(0);
  await act(async () => byTitle('Add “Blue Lagoon Hideaway” as a dive site').props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/add-site', params: { name: 'Blue Lagoon Hideaway' } });
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
});

test('Cancel and Escape close the search and forget the query', async () => {
  await render();
  await openSearch();
  await type('manta');
  await press('Cancel search');
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  await openSearch();
  expect(input().props.value).toBe('');
  await type('manta');
  await act(async () => input().props.onKeyPress({ nativeEvent: { key: 'a' } }));
  expect(root.root.findAllByType(TextInput)).toHaveLength(1);
  await act(async () => input().props.onKeyPress({ nativeEvent: { key: 'Escape' } }));
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
});

test('screen readers get the section names as headings, every row is a 44-point button, and the outcome is announced', async () => {
  await render();
  await openSearch();
  await type('manta');
  expect(headings()).toHaveLength(2);
  // The Pressables themselves (the row components pass their props on to one), but not the page's own buttons.
  const rows = allPressables().filter((p) => p.props.accessibilityRole === 'button' && !/^(Add site|Show sites|Show the map)/.test(p.props.accessibilityLabel) && (typeof p.props.style === 'function' || p.props.style));
  // 4 sites, 3 animals, "Show all 6 animals", the search's own Cancel.
  expect(rows).toHaveLength(9);
  for (const row of rows) {
    const style = StyleSheet.flatten(typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style);
    expect(style.minHeight ?? 0).toBeGreaterThanOrEqual(44);
  }
  // Said once typing has paused.
  expect(announce).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith('4 dive sites, 6 animals');
  await type('xyzzy');
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(announce).toHaveBeenLastCalledWith('No match for xyzzy');
});

test('the species filter still lights up the matching pins and dims the rest', async () => {
  await render();
  expect(markers().every((m) => m.props.opacity === 1)).toBe(true);
  await openSearch();
  await type('manta');
  await press('Reef Manta Ray. Show where it’s seen');
  // Zoomed out the sites are clusters: the ones holding a site where it is seen say so, and the rest dim.
  expect(markers().some((m) => /match/.test(m.props.accessibilityLabel) && m.props.opacity === 1)).toBe(true);
  expect(markers().some((m) => m.props.opacity === 0.3)).toBe(true);
  await press(`Showing where to see the Reef Manta Ray: ${mantaSites.length} sites. Clear`);
  expect(markers().every((m) => m.props.opacity === 1)).toBe(true);
});

test('opening the search, typing and closing it never redraw the map', async () => {
  await render();
  const drawn = mockMapRenders;
  expect(drawn).toBeGreaterThan(0);
  await openSearch();
  for (const query of ['m', 'ma', 'man', 'mant', 'manta', 'manta p']) await type(query);
  await press('Cancel search');
  expect(mockMapRenders).toBe(drawn);
});
