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
let mockParams = {};
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => mockParams }));
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
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ...mockRewards, ready: true }) }));
let mockMine = [];
let mockRewards = { badges: [], collections: [], passport: [], islands: [] };
jest.mock('@/hooks/use-new-badges', () => ({ useNewBadges: () => ({ fresh: [], markSeen: () => {} }) }));
jest.mock('@/lib/store', () => ({ useMySightings: () => mockMine, useMyUserId: () => 'me' }));

const seen = (speciesId, sightedOn = '2026-03-12') => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId: 'yongala', sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const SEEN = ['grey-reef-shark', 'reef-manta', 'hawksbill-turtle'];
const nameOf = (id) => CATALOG.find((s) => s.id === id).commonName;

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  router.push.mockClear();
  mockParams = {};
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
const chip = (label) => root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll((m) => m.type === 'Text').map(flat).join('') === label)[0];

test('every species is on the page to begin with, with a search, the Animals, Sets, Badges control and one row of chips', async () => {
  await render();
  expect(cards()).toHaveLength(CATALOG.length);
  expect(searchBox()).toBeDefined();
  // Animals, Sets, Badges: under the title.
  expect(root.root.findAll((n) => n.props.accessibilityRole === 'tablist' && n.props.accessibilityLabel === 'Show').length).toBeGreaterThan(0);
  expect(['All', 'Seen'].map((label) => !!chip(label))).toEqual([true, true]);
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

test('"Seen" shows only the animals the diver has logged, each group still counting the whole group, and "All" brings the rest back', async () => {
  await render();
  await act(async () => chip('Seen').props.onPress());
  expect(cardNames().sort()).toEqual(SEEN.map(nameOf).sort());
  expect(textOf()).toContain(`Showing ${SEEN.length} of ${CATALOG.length} species`);
  // Only groups with something left are listed; the sharks have one, of all the sharks there are.
  const sharks = CATALOG.filter((s) => s.category === 'shark').length;
  expect(headings()).toEqual(['3 of 120 species', CATEGORY_LABEL.shark, CATEGORY_LABEL.ray, CATEGORY_LABEL.turtle]);
  expect(textOf()).toContain(`1 of ${sharks}`);
  expect(chip('Seen').props['aria-selected']).toBe(true);

  await act(async () => chip('All').props.onPress());
  expect(cards()).toHaveLength(CATALOG.length);
  expect(chip('All').props['aria-selected']).toBe(true);
});

test('one row of chips: Seen, All, then the groups; and a search narrows within the chip that is on', async () => {
  await render();
  const row = root.root.findAll((n) => n.props.accessibilityLabel === 'Filter animals' && n.props.horizontal)[0];
  const labels = row.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').map((n) => n.findAll((m) => m.type === 'Text').map(flat).join(''));
  expect(labels.slice(0, 3)).toEqual(['Seen', 'All', CATEGORY_LABEL.shark]);
  // No second row: no All / Seen / Not yet seen toggle above the chips.
  expect(root.root.findAll((n) => n.props.accessibilityRole === 'radiogroup')).toHaveLength(0);
  expect(chip('Not yet seen')).toBeUndefined();

  await type('manta');
  await act(async () => chip('Seen').props.onPress());
  expect(cardNames()).toEqual(['Reef Manta Ray']);
  await act(async () => chip('All').props.onPress());
  await act(async () => chip(CATEGORY_LABEL.ray).props.onPress());
  // Within the rays only: a manta search no longer finds the manatee or the mantis shrimp.
  expect(cardNames().every((name) => CATALOG.find((s) => s.commonName === name).category === 'ray')).toBe(true);
  expect(cardNames()).toContain('Reef Manta Ray');
});

test('a chip or search that leaves nothing says why', async () => {
  mockMine = [];
  await render();
  await act(async () => chip('Seen').props.onPress());
  expect(cards()).toHaveLength(0);
  expect(textOf()).toContain('You haven’t seen any of these yet.');
  await type('manta');
  expect(textOf()).toContain('Nothing matches “manta” among the animals you have seen.');
  await act(async () => chip('All').props.onPress());
  expect(cardNames()[0]).toMatch(/Manta/);
});

test('the chips and the clear button are each at least 44 points to hit', async () => {
  await render();
  const height = (node) => StyleSheet.flatten(node.props.style({ pressed: false })).minHeight;
  for (const label of ['All', 'Seen', CATEGORY_LABEL.ray]) expect(height(chip(label))).toBeGreaterThanOrEqual(44);
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

test('the page has no eyebrow, says its title once, and has no corner link to collections (the Sets view replaces it)', async () => {
  await render();
  expect(textOf()).not.toMatch(/Your field guide/i);
  expect(chromeTexts().filter((t) => t === '3 of 120 species')).toHaveLength(1);
  expect(headings()[0]).toBe('3 of 120 species');
  expect(root.root.findAll((n) => n.props.accessibilityRole === 'link')).toHaveLength(0);
  expect(textOf()).not.toContain('Collections');
  expect(textOf()).not.toContain('to fill');
  expect(root.root.findAll((n) => /percent of the field guide/.test(label(n)))).toHaveLength(0);
});

test('a group chip that is on turns off (to All) when tapped again', async () => {
  await render();
  await act(async () => chip(CATEGORY_LABEL.ray).props.onPress());
  expect(cards().every((c) => CATALOG.find((s) => s.commonName === c.props.accessibilityLabel.split(',')[0]).category === 'ray')).toBe(true);
  expect(cards().length).toBeLessThan(CATALOG.length);
  expect(chip(CATEGORY_LABEL.ray).props['aria-selected']).toBe(true);
  expect(chip(CATEGORY_LABEL.ray).props.accessibilityHint).toBe('Shows every group again');
  await act(async () => chip(CATEGORY_LABEL.ray).props.onPress());
  expect(cards()).toHaveLength(CATALOG.length);
  expect(chip(CATEGORY_LABEL.ray).props['aria-selected']).toBe(false);
  expect(chip('All').props['aria-selected']).toBe(true);
});

test('no card prints its rarity: the top edge is its colour, a species still to find has a paler name, and a screen reader still hears the words', async () => {
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
  // Rarity is the card's edge alone: no card, seen or not, prints the word.
  const rarityWords = new Set(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
  expect(textOf().split(' | ').filter((t) => rarityWords.has(t.replace(/\s+×\d+$/, '')))).toHaveLength(0);
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
  // The title, the Animals, Sets, Badges control, the chips, and each group's name and count.
  expect(chrome.reduce((n, t) => n + words(t), 0)).toBeLessThanOrEqual(100);
  expect(chrome.filter((t) => words(t) > 10)).toEqual([]);
  await act(async () => root.unmount());

  mockMine = [];
  await render();
  const first = chromeTexts().find((t) => /appear here/.test(t));
  expect(first).toBe('Animals you log appear here.');
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

// ---- Sets and Badges: the other two views of one collection ----

const LOGGED = ['grey-reef-shark', 'whitetip-reef-shark', 'green-turtle', 'reef-manta', 'blacktip-reef-shark'];
const withRewards = () => {
  const { SITES } = require('@/data/sites');
  const { evaluateRewards } = require('@/lib/rewards');
  const { CATALOG_BY_ID } = require('@/lib/catalog');
  mockMine = LOGGED.map((id, i) => ({ ...seen(id, `2026-03-0${i + 1}`), siteId: 'shark-yolanda' }));
  mockRewards = evaluateRewards({ sightings: mockMine, dives: [], sites: new Map(SITES.map((s) => [s.id, s])), catalog: CATALOG_BY_ID });
};
const segment = (label) => root.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function' && n.findAll((m) => m.type === 'Text').map(flat).join('') === label)[0];
const press = (node) => act(async () => node.props.onPress());

test('the control reads Animals, Sets, Badges, and Animals is first', async () => {
  await render();
  expect(['Animals', 'Sets', 'Badges'].map((l) => !!segment(l))).toEqual([true, true, true]);
  expect(segment('Animals').props['aria-selected']).toBe(true);
});

test('Sets lists every collection with "x of y" and its next step; tapping one opens its page', async () => {
  withRewards();
  await render();
  await press(segment('Sets'));
  expect(cards()).toHaveLength(0);
  const sets = root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityHint === 'Opens the collection');
  expect(sets.length).toBeGreaterThan(5);
  const reef = mockRewards.collections.find((c) => !c.completed && c.found > 0);
  expect(textOf()).toContain(`of ${reef.total}`);
  expect(textOf()).toContain(reef.hint);
  await press(sets.find((n) => n.props.accessibilityLabel.startsWith(reef.title)));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/rewards/collections/[id]', params: { id: reef.id } });
});

test('Badges lists every badge by kind with "x of y", a locked one says its next step, and there is no "Latest" repeating the grid', async () => {
  withRewards();
  await render();
  await press(segment('Badges'));
  expect(textOf()).not.toContain('Latest');
  expect(headings()).toEqual(expect.arrayContaining(['Firsts', 'Milestones', 'Places']));
  const earned = mockRewards.badges.filter((b) => b.kind === 'first' && b.earned).length;
  const total = mockRewards.badges.filter((b) => b.kind === 'first').length;
  expect(root.root.findAll((n) => n.props.accessibilityLabel === `${earned} of ${total} earned`).length).toBeGreaterThan(0);
  const locked = mockRewards.badges.find((b) => !b.earned && b.hint && !b.ladder && b.kind === 'first');
  expect(textOf()).toContain(locked.hint);
  const tile = root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityHint === 'Opens the badge' && (n.props.accessibilityLabel ?? '').startsWith(`${locked.title},`))[0];
  await press(tile);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/rewards/[badge]', params: { badge: locked.id } });
});

test('a link with ?view=badges or ?view=sets opens on that view', async () => {
  withRewards();
  mockParams = { view: 'badges' };
  await render();
  expect(segment('Badges').props['aria-selected']).toBe(true);
  await act(async () => root.unmount());
  mockParams = { view: 'sets' };
  await render();
  expect(segment('Sets').props['aria-selected']).toBe(true);
});

test('the big heading follows the view: species seen, sets complete, badges earned', async () => {
  withRewards();
  await render();
  expect(headings()[0]).toBe(`${LOGGED.length} of ${CATALOG.length} species`);
  await press(segment('Sets'));
  expect(headings()[0]).toBe(`${mockRewards.collections.filter((c) => c.completed).length} of ${mockRewards.collections.length} sets complete`);
  await press(segment('Badges'));
  expect(headings()[0]).toBe(`${mockRewards.badges.filter((b) => b.earned).length} of ${mockRewards.badges.length} badges`);
});
