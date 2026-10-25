import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';

import FieldGuideScreen from '@/app/(tabs)/field-guide';
import { CATALOG } from '@/lib/catalog';
import { CATEGORY_LABEL, RARITY_COLOR } from '@/lib/rarity';
import { searchSpecies } from '@/lib/text-search';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// Reduced motion: the progress ring only needs the hooks to exist.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => true,
  useSharedValue: (v) => ({ get: () => v, set: () => {} }),
  useAnimatedProps: () => ({}),
  withDelay: (_, v) => v,
  withTiming: (v) => v,
  default: { View: require('react-native').View, createAnimatedComponent: (C) => C },
}));
// The plates are drawn from code and slow a render of 120 cards down; their own tests cover them.
jest.mock('@/components/species-art', () => ({ SpeciesArt: ({ species }) => require('react').createElement('plate', { id: species.id }) }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ready: true, badges: [], collections: [], passport: [], islands: [] }) }));
let mockMine = [];
jest.mock('@/lib/store', () => ({ useMySightings: () => mockMine }));

const seen = (speciesId, sightedOn = '2026-03-12') => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId: 'yongala', sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const SEEN = ['grey-reef-shark', 'reef-manta', 'hawksbill-turtle'];
const nameOf = (id) => CATALOG.find((s) => s.id === id).commonName;

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  router.push.mockClear();
  mockMine = SEEN.map((id) => seen(id));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

const render = async () => { await act(async () => { root = create(<FieldGuideScreen />); }); };
const flat = (n) => (typeof n === 'string' ? n : n.children.map(flat).join(''));
/** The headings on the page (the screen's title, then each group's): the chips repeat the groups' names, so text alone can't tell. */
const headings = () => root.root.findAll((n) => n.type === 'Text' && n.props.accessibilityRole === 'header').map(flat);
const textOf = () => root.root.findAll((n) => n.type === 'Text').map(flat).join(' | ');
/** The species cards on the page, in order: the card and the pressable inside it carry the same props, so each is counted once. */
const cards = () =>
  root.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      /, (seen once|seen \d+ times|not seen yet)/.test(n.props.accessibilityLabel ?? '') &&
      n.parent?.props.accessibilityLabel !== n.props.accessibilityLabel,
  );
const cardNames = () => cards().map((c) => c.props.accessibilityLabel.split(',')[0]);
const searchBox = () => root.root.findAll((n) => n.props.accessibilityLabel === 'Search the field guide' && typeof n.props.onChangeText === 'function')[0];
const type = async (text) => act(async () => searchBox().props.onChangeText(text));
const radio = (label) => root.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function' && n.findAll((m) => m.type === 'Text').map(flat).join('') === label)[0];
const chip = (label) => root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll((m) => m.type === 'Text').map(flat).join('') === label)[0];
const status = (label) => act(async () => radio(label).props.onPress());

test('every species is on the page to begin with, with a search, a seen toggle and the group chips', async () => {
  await render();
  expect(cards()).toHaveLength(CATALOG.length);
  expect(searchBox()).toBeDefined();
  expect(root.root.findAll((n) => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === 'Show species').length).toBeGreaterThan(0);
  expect(['All', 'Seen', 'Not yet seen'].map((label) => !!radio(label))).toEqual([true, true, true]);
  // Nothing has narrowed it, so nothing says so.
  expect(textOf()).not.toContain('Showing');
});

test('typing a name lists what matches in one grid, best first, and says how many', async () => {
  await render();
  await type('manta');
  const expected = searchSpecies(CATALOG, 'manta').map((s) => s.commonName);
  expect(expected.length).toBeGreaterThan(1);
  expect(cardNames()).toEqual(expected);
  expect(expected[0]).toMatch(/Manta/);
  expect(textOf()).toContain(`Showing ${expected.length} of ${CATALOG.length} species`);
  // The groups' own headings are no use to a search, so they go.
  expect(headings()).toEqual(['3 of 120 species']);

  await act(async () => cards()[0].props.onPress());
  expect(router.push).toHaveBeenCalledWith(`/species/${searchSpecies(CATALOG, 'manta')[0].id}`);
});

test('a scientific name or another name finds the animal, and a stray space or capital makes no difference', async () => {
  await render();
  await type('  Mobula  ');
  expect(cardNames()).toContain('Reef Manta Ray');
  await type('GREY REEF');
  expect(cardNames()[0]).toBe('Grey Reef Shark');
});

test('nothing matching says so, and the clear button brings the whole guide back', async () => {
  await render();
  await type('xyzzy');
  expect(cards()).toHaveLength(0);
  expect(textOf()).toContain('Nothing matches “xyzzy”.');
  const live = root.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite');
  expect(live.length).toBeGreaterThan(0);

  const clear = root.root.findAll((n) => n.props.accessibilityLabel === 'Clear search' && typeof n.props.onPress === 'function')[0];
  await act(async () => clear.props.onPress());
  expect(cards()).toHaveLength(CATALOG.length);
  // The clear button is there only while there is something to clear, and it is a full 44 points.
  expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Clear search')).toHaveLength(0);
});

test('"Seen" shows only the animals the diver has logged, and "Not yet seen" the rest, each group still counting the whole group', async () => {
  await render();
  await status('Seen');
  expect(cardNames().sort()).toEqual(SEEN.map(nameOf).sort());
  expect(textOf()).toContain(`Showing ${SEEN.length} of ${CATALOG.length} species`);
  // Only groups with something left are listed; the sharks have one, of all the sharks there are.
  const sharks = CATALOG.filter((s) => s.category === 'shark').length;
  expect(headings()).toEqual(['3 of 120 species', CATEGORY_LABEL.shark, CATEGORY_LABEL.ray, CATEGORY_LABEL.turtle]);
  expect(textOf()).toContain(`1 / ${sharks}`);

  await status('Not yet seen');
  expect(cards()).toHaveLength(CATALOG.length - SEEN.length);
  expect(cardNames()).not.toContain('Reef Manta Ray');

  await status('All');
  expect(cards()).toHaveLength(CATALOG.length);
});

test('the search, the toggle and the group chips narrow together', async () => {
  await render();
  await type('manta');
  await status('Seen');
  expect(cardNames()).toEqual(['Reef Manta Ray']);
  await status('Not yet seen');
  expect(cardNames()).not.toContain('Reef Manta Ray');
  expect(cardNames()).toContain('Oceanic Manta Ray');

  await status('All');
  await act(async () => chip(CATEGORY_LABEL.ray).props.onPress());
  // Within the rays only: a manta search no longer finds the manatee or the mantis shrimp.
  expect(cardNames().every((name) => CATALOG.find((s) => s.commonName === name).category === 'ray')).toBe(true);
  expect(cardNames()).toContain('Reef Manta Ray');
});

test('a toggle or search that leaves nothing says why', async () => {
  mockMine = [];
  await render();
  await status('Seen');
  expect(cards()).toHaveLength(0);
  expect(textOf()).toContain('You haven’t seen any of these yet.');
  await type('manta');
  expect(textOf()).toContain('Nothing matches “manta” among the seen species.');
  await status('Not yet seen');
  expect(cardNames()[0]).toMatch(/Manta/);
});

test('with every animal seen, "Not yet seen" says there is nothing left', async () => {
  mockMine = CATALOG.map((s) => seen(s.id));
  await render();
  await status('Not yet seen');
  expect(cards()).toHaveLength(0);
  expect(textOf()).toContain('You’ve seen every one of these.');
});

test('the toggle and the clear button are each at least 44 points to hit', async () => {
  await render();
  const height = (node) => StyleSheet.flatten(node.props.style).minHeight;
  for (const label of ['All', 'Seen', 'Not yet seen']) expect(height(radio(label))).toBeGreaterThanOrEqual(44);
  await type('manta');
  const clear = root.root.findAll((n) => n.props.accessibilityLabel === 'Clear search' && typeof n.props.onPress === 'function')[0];
  const box = StyleSheet.flatten(clear.props.style({ pressed: false }));
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
});

// ---- The "Quiet Journal" pass: what the page no longer says, and the words it keeps for a screen reader ----

const words = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu) || []).length;
const label = (n) => n.props.accessibilityLabel ?? '';
const isCard = (n) => typeof n.props.onPress === 'function' && /, (seen once|seen \d+ times|not seen yet)/.test(label(n));
/** The Text on the page that is not on a species card. */
const chromeTexts = () =>
  root.root
    .findAll((n) => n.type === 'Text')
    .filter((n) => {
      for (let p = n; p; p = p.parent) if (isCard(p)) return false;
      return true;
    })
    .map(flat);

test('the page has no eyebrow and says its title once; "Collections" is a link beside it, 44 points to hit', async () => {
  await render();
  expect(textOf()).not.toMatch(/Your field guide/i);
  expect(chromeTexts().filter((t) => t === '3 of 120 species')).toHaveLength(1);
  expect(headings()[0]).toBe('3 of 120 species');
  const link = root.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function')[0];
  expect(link.props.accessibilityLabel).toBe('Collections');
  expect(StyleSheet.flatten(link.props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(44);
  await act(async () => link.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/rewards', params: { tab: 'collections' } });
  // The old card ("16 collections to fill, from sharks to shipwrecks") and the progress ring are gone.
  expect(textOf()).not.toContain('to fill');
  expect(root.root.findAll((n) => /percent of the field guide/.test(label(n)))).toHaveLength(0);
});

test('"All" is said once, by the toggle: the group chips have none, and a chip that is on turns off when tapped again', async () => {
  await render();
  expect(chromeTexts().filter((t) => t === 'All')).toHaveLength(1);
  expect(chip('All')).toBeUndefined();
  await act(async () => chip(CATEGORY_LABEL.ray).props.onPress());
  expect(cards().every((c) => c.props.accessibilityLabel.split(',')[0] && CATALOG.find((s) => s.commonName === c.props.accessibilityLabel.split(',')[0]).category === 'ray')).toBe(true);
  expect(cards().length).toBeLessThan(CATALOG.length);
  expect(chip(CATEGORY_LABEL.ray).props['aria-selected']).toBe(true);
  expect(chip(CATEGORY_LABEL.ray).props.accessibilityHint).toBe('Shows every group again');
  await act(async () => chip(CATEGORY_LABEL.ray).props.onPress());
  expect(cards()).toHaveLength(CATALOG.length);
  expect(chip(CATEGORY_LABEL.ray).props['aria-selected']).toBe(false);
});

test('a species still to find has no caption: its name is paler, its top edge is its rarity colour, and a screen reader still hears the words', async () => {
  await render();
  // Not one "Not seen yet" on the page (it was on 117 cards), but each card says it to a screen reader.
  expect(textOf()).not.toContain('Not seen yet');
  const unseen = cards().filter((c) => /not seen yet$/.test(label(c)));
  expect(unseen).toHaveLength(CATALOG.length - SEEN.length);
  const tiger = CATALOG.find((s) => s.id === 'tiger-shark');
  const card = unseen.find((c) => label(c).startsWith(`${tiger.commonName},`));
  expect(label(card)).toBe(`${tiger.commonName}, ${tiger.rarity.toLowerCase()}, not seen yet`);
  // The rarity colour on the card's top edge is the hunting hint; it is the same colour a seen card of the rarity has.
  const edge = (c) => StyleSheet.flatten(typeof c.props.style === 'function' ? c.props.style({ pressed: false }) : c.props.style).borderTopColor;
  expect(edge(card)).toBe(RARITY_COLOR[tiger.rarity]);
  const seenCard = cards().find((c) => label(c).startsWith('Grey Reef Shark,'));
  expect(edge(seenCard)).toBe(RARITY_COLOR[CATALOG.find((s) => s.id === 'grey-reef-shark').rarity]);
  // Only the animals the diver has logged carry a rarity word on the card.
  const rarityWords = new Set(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
  const seenWords = textOf().split(' | ').filter((t) => rarityWords.has(t.replace(/\s+×\d+$/, '')));
  expect(seenWords).toHaveLength(SEEN.length);
});

test('species names are 15 points, two lines allowed, on a card the diver can read at a large text size', async () => {
  await render();
  const name = root.root.findAll((n) => n.type === 'Text' && flat(n) === 'Nurse Shark')[0];
  const style = StyleSheet.flatten(name.props.style);
  expect(style.fontSize).toBe(15);
  expect(name.props.numberOfLines).toBe(2);
  expect(style.minHeight).toBeGreaterThanOrEqual(2 * style.lineHeight);
});

test('copy budget: besides the species, the page says at most 100 words (a tab screen\'s 120 less a margin), and a first run says one short line', async () => {
  await render();
  const chrome = chromeTexts();
  // The title, "Collections", the toggle, the group chips, and each group's name and count.
  expect(chrome.reduce((n, t) => n + words(t), 0)).toBeLessThanOrEqual(100);
  expect(chrome.filter((t) => words(t) > 10)).toEqual([]);
  await act(async () => root.unmount());

  mockMine = [];
  await render();
  const first = chromeTexts().find((t) => /painted in/.test(t));
  expect(first).toBe('Species you log are painted in.');
  expect(words(first)).toBeLessThanOrEqual(10);
  expect(chromeTexts().filter((t) => t === '0 of 120 species')).toHaveLength(1);
});

// The bug: covered by a species page, the guide (hidden by the web) measured 0 wide and drew all 120 cards
// narrower than nothing: "<svg> attribute width: A negative value is not valid (-5.46)", 120 times.
test('covered by another screen (measured 0 wide), the guide keeps its cards as they were; a real width still counts', async () => {
  const widthOfACard = () => StyleSheet.flatten(cards()[0].props.style).width;
  await render();
  const grid = root.root.findAll((n) => n.type === 'View' && typeof n.props.onLayout === 'function')[0];
  const layout = (width) => act(async () => grid.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 900 } } }));
  const before = widthOfACard();
  await layout(0);
  expect(widthOfACard()).toBe(before);
  await layout(5);
  expect(widthOfACard()).toBeGreaterThanOrEqual(0);
  await layout(600);
  expect(widthOfACard()).toBe(Math.floor((600 - 10 * 3) / 4));
});

test('three cards a row at the normal text size and two at 150%, so a name at that size has room', async () => {
  const widthOfACard = () => StyleSheet.flatten(cards()[0].props.style).width;
  const window = Dimensions.get('window');
  try {
    Dimensions.set({ window: { ...window, fontScale: 1 } });
    await render();
    expect(widthOfACard()).toBe(Math.floor((358 - 10 * 2) / 3));
    await act(async () => root.unmount());
    Dimensions.set({ window: { ...window, fontScale: 1.5 } });
    await render();
    expect(widthOfACard()).toBe(Math.floor((358 - 10) / 2));
  } finally {
    Dimensions.set({ window });
  }
});
