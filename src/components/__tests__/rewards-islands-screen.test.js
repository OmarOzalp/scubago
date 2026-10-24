import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';

import IslandsRoute from '@/app/rewards/islands';
import { IslandCard } from '@/components/rewards/island-card';
import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateRewards } from '@/lib/rewards';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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

// A small hand-written log: a sea otter (the Kelp Forest's) and a grey reef shark (Home's), nobody's real log.
const seen = (speciesId, siteId, sightedOn) => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const sites = new Map(SITES.map((s) => [s.id, s]));
const rewards = evaluateRewards({
  sightings: [seen('grey-reef-shark', 'shark-yolanda', '2026-03-12'), seen('sea-otter', 'yongala', '2026-04-02')],
  dives: [],
  sites,
  catalog: CATALOG_BY_ID,
});
const island = (id) => rewards.islands.find((i) => i.id === id);

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  router.push.mockClear();
  mockRewards = rewards;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

const flat = (n) => (typeof n === 'string' ? n : n.children.map(flat).join(''));
const textOf = () => root.root.findAll((n) => n.type === 'Text').map(flat).join(' | ');
/** The tappable head of an island's card, by the start of what a screen reader says for it. */
const head = (name) =>
  root.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function' && (n.props.accessibilityLabel ?? '').startsWith(`${name},`))[0];

test('the fixture has Home, a raised Kelp Forest and a locked island, so the cases below are real ones', () => {
  expect(island('coral-reef').unlocked).toBe(true);
  expect(island('kelp-forest').unlocked).toBe(true);
  expect(island('shipwreck').unlocked).toBe(false);
});

test('a raised island opens when its picture and name are tapped, saying so to a screen reader', async () => {
  const onOpen = jest.fn();
  await act(async () => { root = create(<IslandCard island={island('kelp-forest')} onOpen={onOpen} />); });
  const link = head('Kelp Forest');
  expect(link.props.accessibilityLabel).toMatch(/^Kelp Forest, raised 2 April 2026\./);
  expect(link.props.accessibilityHint).toBe('Opens the island full screen');
  await act(async () => link.props.onPress());
  expect(onOpen).toHaveBeenCalledWith('kelp-forest');
});

test('a locked island has nothing to open, and a card given no way to open one is not a link', async () => {
  const onOpen = jest.fn();
  await act(async () => { root = create(<IslandCard island={island('shipwreck')} onOpen={onOpen} />); });
  expect(head('Shipwreck')).toBeUndefined();
  expect(root.root.findAll((n) => n.props.accessibilityLabel?.startsWith('Shipwreck, locked')).length).toBeGreaterThan(0);
  await act(async () => root.unmount());

  await act(async () => { root = create(<IslandCard island={island('kelp-forest')} />); });
  expect(head('Kelp Forest')).toBeUndefined();
});

test('on the Islands page Home’s island opens the explorer, and another opens it on that island', async () => {
  await act(async () => { root = create(<IslandsRoute />); });
  expect(textOf()).toContain('Kelp Forest');
  await act(async () => head('Coral Reef').props.onPress());
  expect(router.push).toHaveBeenLastCalledWith('/explore');
  await act(async () => head('Kelp Forest').props.onPress());
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/explore', params: { island: 'kelp-forest' } });
  // Islands still to rise have no explorer to open.
  expect(head('Shipwreck')).toBeUndefined();
  expect(head('Mangroves & Seagrass')).toBeUndefined();
});

test('a resident to look for still opens its own page, not the island', async () => {
  await act(async () => { root = create(<IslandsRoute />); });
  const next = island('kelp-forest').next[0];
  const resident = root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === `${next.name}, ${next.rarity}, not seen yet`)[0];
  await act(async () => resident.props.onPress());
  expect(router.push).toHaveBeenLastCalledWith(`/species/${next.speciesId}`);
});
