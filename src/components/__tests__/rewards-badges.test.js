import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { BadgeDetailView, collectionIdOfBadge } from '@/components/rewards/badge-detail';
import { countEarned, itemsOfKind, ladderOf, latestEarned } from '@/components/rewards/badge-groups';
import { ladderNote } from '@/components/rewards/badge-ladder';
import { badgeCaption, badgeLabel } from '@/components/rewards/badge-tile';
import { BadgesView } from '@/components/rewards/badges-view';
import { longDate, stampDate } from '@/components/rewards/format';
import { areaOfBadge } from '@/components/rewards/emblem';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { SITES } from '@/data/sites';
import { evaluateRewards } from '@/lib/rewards';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
// Reduced motion: things appear in place. The ring and bar only need the hooks to exist.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => true,
  useSharedValue: (v) => ({ get: () => v, set: () => {} }),
  useAnimatedProps: () => ({}),
  withDelay: (_, v) => v,
  withTiming: (v) => v,
  default: { View: require('react-native').View, createAnimatedComponent: (C) => C },
}));

// A small hand-written log: real catalogue species and seed sites, nobody's real log.
const seen = (speciesId, siteId, sightedOn) => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const dived = (number, siteId, divedOn) => ({ id: `dive-${number}`, userId: 'me', number, siteId, divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z` });
const sites = new Map(SITES.map((s) => [s.id, s]));
const logbook = {
  sightings: [
    seen('grey-reef-shark', 'shark-yolanda', '2026-03-12'), seen('whitetip-reef-shark', 'shark-yolanda', '2026-03-12'),
    seen('green-turtle', 'yongala', '2026-04-02'), seen('reef-manta', 'manta-sandy', '2026-05-09'), seen('blacktip-reef-shark', 'yongala', '2026-06-01'),
  ],
  dives: [dived(1, 'shark-yolanda', '2026-03-12'), dived(2, 'yongala', '2026-04-02'), dived(3, 'manta-sandy', '2026-05-09'), dived(4, 'yongala', '2026-06-01')],
  sites, catalog: CATALOG_BY_ID,
};
const rewards = evaluateRewards(logbook);
const emptyRewards = evaluateRewards({ sightings: [], dives: [], sites, catalog: CATALOG_BY_ID });
const flat = (n) => (typeof n === 'string' ? n : n.children.map(flat).join(''));
const textOf = (r) => r.root.findAll((n) => n.type === 'Text').map(flat).join(' | ');
const labelsOf = (r) => r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel);

const badge = (id, from = rewards) => from.badges.find((b) => b.id === id);
let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('dates are written the same everywhere, without a time zone to move them', () => {
  expect(longDate('2026-03-12')).toBe('12 March 2026');
  expect(stampDate('2026-03-02')).toBe('02 MAR 2026');
  expect(longDate('2026-12-31')).toBe('31 December 2026');
});

test('a badge says what it is, its tier, and when it was earned or how far there is to go', () => {
  expect(badgeLabel(badge('first-shark'))).toBe('First shark, earned 12 March 2026');
  expect(badgeLabel(badge('species-10'))).toMatch(/^Ten species, bronze, not earned yet, 5 of 10\. 5 more species$/);
  expect(badgeLabel(badge('first-turtle'), true)).toBe('First turtle, earned 2 April 2026, new');
  expect(badgeLabel(badge('first-sea-mammal') ?? badge('first-mammal'))).toMatch(/^First sea mammal, not earned yet\. Log your first marine mammal\.$/);
  expect(badgeCaption(badge('first-shark'))).toBe('12 MAR 2026');
  expect(badgeCaption(badge('species-10'))).toBe('5 OF 10');
  expect(badgeCaption(badge('first-mammal'))).toBe('NOT YET');
});

test('badges are gathered by kind, with each ladder as one item at its first rung', () => {
  const places = itemsOfKind(rewards.badges, 'place');
  const ladders = places.filter((i) => i.type === 'ladder').map((i) => [i.key, i.rungs.map((r) => r.progress.need)]);
  expect(ladders).toEqual([['sites', [5, 10, 25, 50]], ['countries', [3, 5]], ['gbr-sites', [5, 15, 40]], ['red-sea-sites', [5, 15, 40]]]);
  expect(places.filter((i) => i.type === 'single').map((i) => i.badge.id)).toEqual(['region-great-barrier-reef', 'region-red-sea']);
  // Every badge lands in exactly one item.
  const kinds = ['first', 'milestone', 'place', 'collection'];
  const count = kinds.flatMap((k) => itemsOfKind(rewards.badges, k)).reduce((n, i) => n + (i.type === 'ladder' ? i.rungs.length : 1), 0);
  expect(count).toBe(rewards.badges.length);
  expect(ladderOf(rewards.badges, badge('dives-10')).map((b) => b.id)).toEqual(['dives-1', 'dives-10', 'dives-25', 'dives-50', 'dives-100', 'dives-250', 'dives-500']);
  expect(ladderOf(rewards.badges, badge('first-shark')).map((b) => b.id)).toEqual(['first-shark']);
});

test('the latest badges are the ones earned most recently, the harder of two on one day first', () => {
  const latest = latestEarned(rewards.badges, 3);
  expect(latest.map((b) => b.earnedOn)).toEqual([...latest.map((b) => b.earnedOn)].sort().reverse());
  expect(latest[0].earnedOn).toBe(latestEarned(rewards.badges, 10)[0].earnedOn);
  expect(latestEarned(emptyRewards.badges, 3)).toEqual([]);
  expect(countEarned(rewards.badges)).toBe(rewards.badges.filter((b) => b.earned).length);
});

test('a ladder says what comes next, and an area badge knows its habitat', () => {
  expect(ladderNote(ladderOf(rewards.badges, badge('species-10')))).toBe('Next: 5 more species · 5 of 10');
  expect(ladderNote([{ earned: true }, { earned: true }])).toBe('Every rung climbed');
  expect(areaOfBadge('collection-area-kelp-forest')).toBe('kelp-forest');
  expect(areaOfBadge('collection-family-shark')).toBeUndefined();
  expect(collectionIdOfBadge(badge('collection-family-shark'))).toBe('family-shark');
  expect(collectionIdOfBadge(badge('first-shark'))).toBeUndefined();
});

test('the badges page puts every badge on an album page, earned ones with their date and the rest with their progress', async () => {
  const onOpenBadge = jest.fn();
  await act(async () => { root = create(<BadgesView badges={rewards.badges} newIds={new Set(['first-turtle'])} onOpenBadge={onOpenBadge} />); });
  const labels = labelsOf(root);
  expect(labels).toContain('First shark, earned 12 March 2026');
  expect(labels).toContain('First turtle, earned 2 April 2026, new');
  expect(labels.some((l) => /^Ten species, bronze, not earned yet, 5 of 10/.test(l))).toBe(true);
  const text = textOf(root);
  expect(text).toContain('Latest');
  for (const title of ['Firsts', 'Milestones', 'Places', 'Collections']) expect(text).toContain(title);
  expect(text).toContain('Next: 5 more species · 5 of 10');
  // A tap opens the badge.
  const tile = root.root.find((n) => n.props.accessibilityLabel === 'First shark, earned 12 March 2026' && typeof n.props.onPress === 'function');
  await act(async () => tile.props.onPress());
  expect(onOpenBadge).toHaveBeenCalledWith(expect.objectContaining({ id: 'first-shark' }));
});

test('an empty logbook has nothing in "Latest", and offers to log a dive', async () => {
  const onLog = jest.fn();
  await act(async () => { root = create(<BadgesView badges={emptyRewards.badges} onLog={onLog} />); });
  const text = textOf(root);
  expect(text).toContain('No badges yet');
  expect(text).not.toContain('Latest');
  expect(labelsOf(root).some((l) => /earned \d/.test(l))).toBe(false);
  const button = root.root.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
  await act(async () => button.props.onPress());
  expect(onLog).toHaveBeenCalled();
});

test('a badge in full shows the day it was earned, or how far there is to go and a way to log', async () => {
  const onLog = jest.fn();
  await act(async () => { root = create(<BadgeDetailView badge={badge('first-shark')} onLog={onLog} />); });
  expect(textOf(root)).toContain('12 March 2026');
  expect(textOf(root)).not.toContain('Not earned yet');
  await act(async () => root.unmount());

  await act(async () => { root = create(<BadgeDetailView badge={badge('species-10')} rungs={ladderOf(rewards.badges, badge('species-10'))} onLog={onLog} />); });
  expect(textOf(root)).toContain('Not earned yet');
  expect(textOf(root)).toContain('5 of 10');
  expect(textOf(root)).toContain('5 more species');
  const log = root.root.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
  await act(async () => log.props.onPress());
  expect(onLog).toHaveBeenCalled();
});
