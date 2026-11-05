import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';

import RewardsRoute from '@/app/rewards/index';
import { BadgesTab, SetsTab } from '@/components/rewards/collection-tabs';
import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateRewards } from '@/lib/rewards';

// The Rewards screen is gone (its link redirects to the Field guide); this is the copy budget of the Field guide's Badges and Sets views: how many words it says besides its list of things, and that
// it says its title once. A page that gains a line has to say why here ("Quiet Journal" rules 2 to 6).

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
let mockParams = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }) => require('react').createElement('redirect', { href }),
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

test('the Rewards link lands on the Field guide: the Badges view, or the Sets view for ?tab=collections', async () => {
  await render(<RewardsRoute />);
  expect(root.root.findByType('redirect').props.href).toEqual({ pathname: '/field-guide', params: { view: 'badges' } });
  await act(async () => root.unmount());
  mockParams = { tab: 'collections' };
  await render(<RewardsRoute />);
  expect(root.root.findByType('redirect').props.href).toEqual({ pathname: '/field-guide', params: { view: 'sets' } });
});

test('Badges: no legend lines, no "Latest" strip, no dates under the medals; each kind says "x of y" once; at most 140 words besides the badges', async () => {
  await render(<BadgesTab />);
  const shown = texts().join(' | ');
  for (const legend of ['The first time for everything', 'Species and dives, rung by rung', 'Sites, countries and famous reefs', 'Finish a set to earn its badge', 'Latest']) expect(shown).not.toContain(legend);
  expect(texts().filter((t) => /^\d\d [A-Z]{3} \d{4}$/.test(t))).toHaveLength(0);
  const first = rewards.badges.filter((b) => b.kind === 'first');
  expect(texts().filter((t) => t === `${first.filter((b) => b.earned).length} of ${first.length}`)).toHaveLength(1);
  expect(headers()).toEqual(expect.arrayContaining(['Firsts', 'Milestones', 'Places', 'Sets']));
  // What is left is the kinds' headings and counts, a next step under each badge still to earn, and one progress line per ladder.
  expect(copyWords(isListed)).toBeLessThanOrEqual(140);
});

test('Sets: a heading and an "x of y" per kind, "6 of 34" and the next step on a card, at most 90 words besides the cards', async () => {
  await render(<SetsTab />);
  const shown = texts().join(' | ');
  expect(shown).not.toContain('Everyone who lives in each corner');
  expect(shown).not.toContain('Small sets worth chasing');
  expect(texts()).toContain('0 of 7');
  const reef = rewards.collections.find((c) => c.id === 'area-coral-reef');
  expect(shown).toContain(`${reef.found} of ${reef.total} · ${reef.hint}`);
  expect(copyWords(isListed)).toBeLessThanOrEqual(90);
  const card = root.root.findAll((n) => n.props.accessibilityHint === 'Opens the collection' && label(n).startsWith(reef.title))[0];
  await act(async () => card.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/rewards/collections/[id]', params: { id: 'area-coral-reef' } });
});
