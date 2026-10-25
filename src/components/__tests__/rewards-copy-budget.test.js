import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';

import RewardsRoute from '@/app/rewards/index';
import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateRewards } from '@/lib/rewards';

// The copy budget of the Badges & collections page: how many words it says besides its list of things, and that
// it says its title once. A page that gains a line has to say why here ("Quiet Journal" rules 2 to 6).

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
let mockParams = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// The pictures are drawn from code; each only needs a box here.
jest.mock('@/components/home/island-art', () => ({ IslandArt: () => null }));
jest.mock('@/components/species-art', () => ({ SpeciesArt: () => null }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => true,
  useSharedValue: (v) => ({ get: () => v, set: () => {} }),
  useAnimatedProps: () => ({}),
  withDelay: (_, v) => v,
  withTiming: (v) => v,
  default: { View: require('react-native').View, createAnimatedComponent: (C) => C },
}));
jest.mock('@/components/when-ready', () => ({ WhenReady: ({ children }) => children }));
let mockRewards;
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => mockRewards }));
jest.mock('@/hooks/use-new-badges', () => ({ useNewBadges: () => ({ fresh: [], markSeen: () => {} }) }));
let mockSightings = [];
jest.mock('@/lib/store', () => ({ useMyUserId: () => 'me', useMySightings: () => mockSightings }));

const seen = (speciesId, siteId, sightedOn) => ({
  id: `${speciesId}@${sightedOn}@${siteId}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const dived = (number, siteId, divedOn) => ({ id: `dive-${number}`, userId: 'me', number, siteId, divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z` });
const sites = new Map(SITES.map((s) => [s.id, s]));
const sightings = [
  seen('grey-reef-shark', 'shark-yolanda', '2026-03-12'), seen('whitetip-reef-shark', 'shark-yolanda', '2026-03-12'),
  seen('green-turtle', 'yongala', '2026-04-02'), seen('reef-manta', 'manta-sandy', '2026-05-09'), seen('blacktip-reef-shark', 'yongala', '2026-06-01'),
];
const dives = [dived(1, 'shark-yolanda', '2026-03-12'), dived(2, 'yongala', '2026-04-02'), dived(3, 'manta-sandy', '2026-05-09'), dived(4, 'yongala', '2026-06-01')];
const rewards = { ...evaluateRewards({ sightings, dives, sites, catalog: CATALOG_BY_ID }), ready: true };

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockRewards = rewards;
  mockSightings = sightings;
  mockParams = {};
  router.push.mockClear();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

const render = async (element) => { await act(async () => { root = create(element); }); };
const flat = (n) => (typeof n === 'string' ? n : n.children.map(flat).join(''));
const words = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu) || []).length;
const texts = (skip = () => false) =>
  root.root
    .findAll((n) => n.type === 'Text')
    .filter((n) => {
      for (let p = n; p; p = p.parent) if (skip(p)) return false;
      return true;
    })
    .map(flat);
/** The words a page says, not counting the things it lists (the rows, tiles and cards `skip` picks out). */
const copyWords = (skip) => texts(skip).reduce((n, t) => n + words(t), 0);
const count = (text) => texts().filter((t) => t === text).length;
const headers = () => root.root.findAll((n) => n.type === 'Text' && n.props.accessibilityRole === 'header').map(flat);
const label = (n) => n.props.accessibilityLabel ?? '';
const tab = (name) => root.root.findAll((n) => n.props.accessibilityRole === 'tab' && label(n).startsWith(name))[0];

/** A tile, a rung, a card or a stamp: something the page lists, so it is not copy. */
const isListed = (n) =>
  typeof n.props.onPress === 'function' &&
  (/earned|not earned yet/.test(label(n)) || n.props.accessibilityHint === 'Opens the collection' || n.props.accessibilityHint === 'Opens the badge' || /First visited/.test(label(n)));

test('Badges & collections: no eyebrow, no row of figures; the counts are in the tab names, and the page says its title once', async () => {
  await render(<RewardsRoute />);
  expect(count('Badges & collections')).toBe(1);
  expect(headers()[0]).toBe('Badges & collections');
  expect(texts().some((t) => /YOUR REWARDS/i.test(t))).toBe(false);
  // The ledger's three tiles are gone: nothing says "Islands" but the one row that opens them.
  expect(count('Badges')).toBe(0);
  const earned = rewards.badges.filter((b) => b.earned).length;
  expect(flat(tab('Badges'))).toBe(`Badges ${earned}/${rewards.badges.length}`);
  expect(label(tab('Badges'))).toBe(`Badges, ${earned} of ${rewards.badges.length} earned`);
  const complete = rewards.collections.filter((c) => c.completed).length;
  expect(flat(tab('Collections'))).toBe(`Collections ${complete}/${rewards.collections.length}`);
  expect(label(tab('Collections'))).toBe(`Collections, ${complete} of ${rewards.collections.length} complete`);
});

test('Badges & collections: the passport and the islands are one line each, with a status of a few words', async () => {
  await render(<RewardsRoute />);
  const rows = (title) => root.root.findAll((n) => n.props.accessibilityRole === 'link' && label(n).startsWith(`${title}.`));
  const row = (title) => rows(title)[0];
  // The pressable inside the row is the one whose style is a function of its pressed state.
  const box = (title) => StyleSheet.flatten(rows(title).find((n) => typeof n.props.style === 'function').props.style({ pressed: false }));
  const stamps = rewards.passport.reduce((n, g) => n + g.stamps.length, 0);
  const raised = rewards.islands.filter((i) => i.unlocked).length;
  expect(label(row('Site passport'))).toBe(`Site passport. ${stamps} stamps`);
  expect(label(row('Islands'))).toBe(`Islands. ${raised} of ${rewards.islands.length} raised`);
  // One line is a row that needs no more than 48 points, with no icon box of its own.
  expect(box('Islands').minHeight).toBe(48);
  expect(box('Islands').flexDirection).toBe('row');
  await act(async () => row('Islands').props.onPress());
  expect(router.push).toHaveBeenCalledWith('/rewards/islands');
});

test('Badges & collections, badges tab: no legend lines, no dates under the medals, each group says "9 / 10" once; at most 110 words besides the badges', async () => {
  await render(<RewardsRoute />);
  const shown = texts().join(' | ');
  for (const legend of ['The first time for everything', 'Species and dives, rung by rung', 'Sites, countries and famous reefs', 'Finish a set to earn its badge']) expect(shown).not.toContain(legend);
  // The dates stay in the "Latest" strip and on the badge's own page: three there, none under the 51 medals.
  expect(texts().filter((t) => /^\d\d [A-Z]{3} \d{4}$/.test(t))).toHaveLength(3);
  expect(shown).not.toContain('NOT YET');
  const first = rewards.badges.filter((b) => b.kind === 'first');
  expect(shown).toContain(`${first.filter((b) => b.earned).length} / ${first.length}`);
  // What is left is the "Latest" strip, the group headings and counts, and one progress line per ladder.
  expect(copyWords(isListed)).toBeLessThanOrEqual(110);
});

test('Badges & collections, collections tab: a heading and a count per kind, "6 of 34" on a card, at most 30 words besides the cards', async () => {
  mockParams = { tab: 'collections' };
  await render(<RewardsRoute />);
  const shown = texts().join(' | ');
  expect(shown).not.toContain('Everyone who lives in each corner');
  expect(shown).not.toContain('Small sets worth chasing');
  expect(shown).toContain('0 / 7');
  const reef = rewards.collections.find((c) => c.id === 'area-coral-reef');
  expect(texts()).toContain(`${reef.found} of ${reef.total}`);
  expect(shown).not.toMatch(/ found( |$)/);
  expect(copyWords(isListed)).toBeLessThanOrEqual(30);
});
