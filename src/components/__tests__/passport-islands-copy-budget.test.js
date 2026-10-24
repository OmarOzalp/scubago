import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';

import IslandsRoute from '@/app/rewards/islands';
import PassportRoute from '@/app/rewards/passport';
import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateRewards } from '@/lib/rewards';

// The copy budget of the passport and the islands: how many words each says besides its list of things, and that
// each says its title once. A page that gains a line has to say why here ("Quiet Journal" rules 2 to 6).

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

test('the passport: no eyebrow, no tiles, no dates or footer on a page; the explanation waits behind a row (at most 40 words besides the stamps)', async () => {
  await render(<PassportRoute />);
  const shown = texts().join(' | ');
  expect(count('Site passport')).toBe(1);
  expect(shown).not.toMatch(/YOUR DIVE PASSPORT|PASSPORT · PAGE|FIRST \d|LATEST \d|still to stamp|Each stamp shows/);
  expect(shown).not.toContain('One stamp for every dive site');
  expect(texts()).toContain('About the passport');
  expect(shown).not.toContain('A site gets a stamp when');
  // Closed, it is the title, the row and a place's name and progress: no more than a screenful of words besides the stamps.
  expect(copyWords((n) => n.props.accessibilityRole === 'link')).toBeLessThanOrEqual(40);
  // The row opens the explanation, and it is under 40 words.
  const about = root.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props['aria-expanded'] === false)[0];
  await act(async () => about.props.onPress());
  const explanation = texts().find((t) => t.startsWith('A site gets a stamp when'));
  expect(words(explanation)).toBeLessThanOrEqual(40);

});

test('islands: the count above the title, the explanation behind a row, one line under each tag, and no habitat blurb (at most 170 words with every island on the page)', async () => {
  await render(<IslandsRoute />);
  const raised = rewards.islands.filter((i) => i.unlocked).length;
  expect(count('Islands')).toBe(1);
  expect(texts()).toContain(`${raised} of ${rewards.islands.length} raised`);
  const shown = texts().join(' | ');
  expect(shown).not.toContain('Your home island is always there');
  expect(texts()).toContain('About islands');
  for (const island of rewards.islands) expect(shown).not.toContain(island.blurb);
  expect(shown).not.toContain('Where every animal not at another island swims.');
  expect(shown).not.toContain('Rose when you logged');
  expect(copyWords(() => false)).toBeLessThanOrEqual(170);
});
