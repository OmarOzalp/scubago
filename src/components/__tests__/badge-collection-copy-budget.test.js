import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';

import BadgeRoute from '@/app/rewards/[badge]';
import CollectionRoute from '@/app/rewards/collections/[id]';
import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateRewards } from '@/lib/rewards';

// The copy budget of a badge page and a collection page: how many words each says besides its list of things,
// that it says its title once, and that the header is the back arrow alone. A page that gains a line has to say why here.

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
let mockParams = {};
let mockScreenOptions = null;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: ({ options }) => { mockScreenOptions = options; return null; } },
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
  mockScreenOptions = null;
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

/** A tile, a rung, a card or a stamp: something the page lists, so it is not copy. */
const isListed = (n) =>
  typeof n.props.onPress === 'function' &&
  (/earned|not earned yet/.test(label(n)) || n.props.accessibilityHint === 'Opens the collection' || n.props.accessibilityHint === 'Opens the badge' || /First visited/.test(label(n)));

test('a badge page: the header is the back arrow alone, the title is said once, and the day it was earned is a line on the medal card (at most 25 words)', async () => {
  mockParams = { badge: 'first-shark' };
  await render(<BadgeRoute />);
  expect(mockScreenOptions).toEqual({ title: 'First shark', headerTitle: '' });
  expect(count('First shark')).toBe(1);
  expect(texts()).toContain('Earned 12 March 2026');
  expect(texts().some((t) => /^Earned$/i.test(t))).toBe(false);
  expect(copyWords(isListed)).toBeLessThanOrEqual(25);
});

test('a badge not earned yet keeps its progress card, and says its title once (at most 36 words)', async () => {
  mockParams = { badge: 'species-10' };
  await render(<BadgeRoute />);
  expect(count('Ten species')).toBe(1);
  expect(texts()).toContain('Not earned yet');
  expect(texts()).toContain('5 of 10');
  expect(copyWords(isListed)).toBeLessThanOrEqual(36);
});

test('a collection page: the header is the back arrow alone; "6 of 34 found" is said once, with no legend; at most 32 words besides the animals', async () => {
  mockParams = { id: 'area-coral-reef' };
  await render(<CollectionRoute />);
  const reef = rewards.collections.find((c) => c.id === 'area-coral-reef');
  expect(mockScreenOptions).toEqual({ title: 'Coral Reef', headerTitle: '' });
  expect(count('Coral Reef')).toBe(1);
  expect(texts().filter((t) => t === `${reef.found} of ${reef.total} found`)).toHaveLength(1);
  const shown = texts().join(' | ');
  expect(shown).not.toContain('pencil sketches');
  expect(shown).not.toContain('to go');
  // Said once: the progress card has the figure, the headings are just "Found" and "Still to find".
  expect(headers()).toEqual(['Coral Reef', 'Found', 'Still to find']);
  expect(copyWords((n) => typeof n.props.onPress === 'function' && /, (seen once|seen \d+ times|not seen yet)/.test(label(n)))).toBeLessThanOrEqual(32);
});
