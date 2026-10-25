import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Modal, StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import LogbookScreen from '@/app/(tabs)/logbook';
import { announce } from '@/lib/announce';

// The Logbook is a book: the cover, then a page per dive, opening at the newest. (The cover's own rows are
// tested in logbook-cover.test.js; a page's own content in the dive page's tests, since it is the same page.)
jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ready: true, badges: [], collections: [], passport: [], islands: [] }) }));
jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockUser = null;
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, sightings: mockSightings, backendEnabled: true, syncing: false, syncProblem: null, requestSync: jest.fn(), deleteDive: jest.fn() }),
  useMySightings: () => mockSightings,
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
  useDivesBefore: () => 0,
  usePendingChanges: () => ({ count: 0, failing: 0 }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
}));

const dive = (number, over = {}) => ({ id: `d${number}`, userId: 'local', number, siteId: 'shark-yolanda', divedOn: `2026-03-${10 + number}`, bottomTimeMin: 40 + number, maxDepthM: 20, createdAt: `2026-03-${10 + number}T12:00:00Z`, synced: false, ...over });
const sighting = (id, speciesId, diveId) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', diveId, sightedOn: '2026-03-13', isDemo: false, synced: false, createdAt: '2026-03-13T10:00:00Z' });

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUser = null;
  mockDives = [dive(1), dive(2), dive(3, { siteId: 'cod-hole' })];
  mockSightings = [sighting('a', 'reef-manta', 'd3'), sighting('b', 'whale-shark', 'd3')];
  router.push.mockClear();
  announce.mockClear();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<LogbookScreen />); }); };
const rerender = async () => { await act(async () => { root.update(<LogbookScreen />); }); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const pressable = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const press = async (label) => { await act(async () => pressable(label)[0].props.onPress()); };
/** The page count above the book ("3 of 3"), read from its one adjustable control. */
const counter = () => root.root.findAll((n) => n.props.accessibilityRole === 'adjustable' && n.props.accessible)[0];
const count = () => {
  const shown = texts().filter((t) => / of \d+$/.test(t));
  return shown.length ? shown[0] : '';
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });
/** The book's pager: a horizontal scroll view that pages, one leaf per page width. */
const pager = () => root.root.findAll((n) => n.props.horizontal && n.props.pagingEnabled && typeof n.props.onScroll === 'function')[0];
/** The width of a page: the pager starts at the last leaf, one page width per leaf before it. */
const pageWidth = (leaves) => pager().props.contentOffset.x / (leaves - 1);
/** The leaf in view: the one slot a screen reader is not kept out of. */
const openLeaf = () => root.root.findAll((n) => typeof n.type === 'string' && n.props['aria-hidden'] === false && StyleSheet.flatten(n.props.style)?.width === pageWidth(root.root.findAll((m) => m.props.horizontal && m.props.pagingEnabled)[0].props.children.length))[0];
/** The heads of the dive pages drawn (the open page and the ones beside it). */
const heads = () =>
  root.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header' && /^Page \d+ of \d+, Dive /.test(n.props.accessibilityLabel ?? ''))
    .map((h) => h.props.accessibilityLabel.split(',').slice(0, 3).join(','));

describe('the book', () => {
  test('opens at the newest page, the last one, with a quiet count of “3 of 3”', async () => {
    await render();
    expect(count()).toBe('3 of 3');
    // The open page is the newest dive's own page (its head names its place in the book first).
    expect(heads()).toContain('Page 3 of 3, Dive 3, Cod Hole');
    // The newest page and the one before it are drawn; nothing else is yet.
    expect(heads()).toEqual(['Page 2 of 3, Dive 2, Shark & Yolanda Reef', 'Page 3 of 3, Dive 3, Cod Hole']);
  });

  test('a long log draws only the open page and the ones beside it', async () => {
    mockDives = Array.from({ length: 300 }, (_, i) => dive(i + 1, { divedOn: '2026-03-01' }));
    await render();
    expect(count()).toBe('300 of 300');
    expect(heads()).toEqual(['Page 299 of 300, Dive 299, Shark & Yolanda Reef', 'Page 300 of 300, Dive 300, Shark & Yolanda Reef']);
    await press('Previous page');
    await press('Previous page');
    expect(heads()).toEqual([297, 298, 299].map((n) => `Page ${n} of 300, Dive ${n}, Shark & Yolanda Reef`));
  });

  test('the cover comes first and the newest page last: the arrows turn back to the cover and on again, and stop at each end', async () => {
    await render();
    const arrow = (label) => pressable(label).find((n) => n.props.accessibilityRole === 'button');
    expect(arrow('Next page').props.disabled).toBe(true);
    await press('Previous page');
    expect(count()).toBe('2 of 3');
    await press('Previous page');
    expect(count()).toBe('1 of 3');
    await press('Previous page');
    // The cover has no page count, and nothing before it.
    expect(count()).toBe('');
    expect(counter().props.accessibilityValue.text).toBe('Cover');
    expect(arrow('Previous page').props.disabled).toBe(true);
    await press('Next page');
    expect(count()).toBe('1 of 3');
  });

  test('a swipe turns the page: the count follows the scroll', async () => {
    await render();
    const width = pageWidth(4);
    expect(width).toBeGreaterThan(0);
    // A swipe starts with a touch.
    await act(async () => pager().props.onTouchStart());
    await act(async () => pager().props.onScroll({ nativeEvent: { contentOffset: { x: width * 1, y: 0 } } }));
    expect(count()).toBe('1 of 3');
    await act(async () => pager().props.onScroll({ nativeEvent: { contentOffset: { x: width * 0.4, y: 0 } } }));
    expect(count()).toBe('');
  });

  test('each turn is announced once it settles: “Page 2 of 3, Shark & Yolanda Reef, March 12”, and “Cover”', async () => {
    await render();
    await settle();
    // Opening the book says nothing: the page is simply there.
    expect(announce).not.toHaveBeenCalled();
    await press('Previous page');
    await settle();
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/^Page 2 of 3, Shark & Yolanda Reef, .*12/));
    await press('Previous page');
    await press('Previous page');
    await settle();
    // A quick run of turns says only where it ended.
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('Cover');
  });

  test('the count is one adjustable control for a screen reader, and the page’s head has next and previous actions', async () => {
    await render();
    expect(counter().props.accessibilityLabel).toBe('Page');
    expect(counter().props.accessibilityValue.text).toMatch(/^Page 3 of 3, Cod Hole, /);
    expect(counter().props.accessibilityActions.map((a) => a.name)).toEqual(['increment', 'decrement']);
    await act(async () => counter().props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(count()).toBe('2 of 3');
    await act(async () => counter().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(count()).toBe('3 of 3');

    // The newest page has a page before it and none after.
    const head = () => openLeaf().findAll((n) => n.props.accessibilityRole === 'header' && Array.isArray(n.props.accessibilityActions))[0];
    expect(head().props.accessibilityActions).toEqual([{ name: 'previous', label: 'Previous page' }]);
    await act(async () => head().props.onAccessibilityAction({ nativeEvent: { actionName: 'previous' } }));
    expect(count()).toBe('2 of 3');
  });

  test('Contents lists the cover and every page in the order you turn them, marks the open page, and a tap turns to it', async () => {
    await render();
    expect(root.root.findAllByType(Modal)).toHaveLength(0);
    await act(async () => root.root.findAll((n) => n.props.accessibilityHint === 'Lists every page' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(1);
    const rows = root.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityState && 'selected' in n.props.accessibilityState && typeof n.props.onPress === 'function');
    expect(rows.map((r) => r.props.accessibilityLabel.split(',').slice(0, 2).join(','))).toEqual(['Cover', 'Page 1 of 3, Shark & Yolanda Reef', 'Page 2 of 3, Shark & Yolanda Reef', 'Page 3 of 3, Cod Hole']);
    expect(rows.map((r) => r.props.accessibilityState.selected)).toEqual([false, false, false, true]);
    // The newest page says what is on it: its animals.
    expect(rows[3].props.accessibilityLabel).toContain('2 species seen');
    // Like a book's contents: the number, the site and the date, no explanations.
    expect(texts()).toEqual(expect.arrayContaining(['Contents', 'Cover', 'Cod Hole']));

    await act(async () => rows[1].props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(0);
    expect(count()).toBe('1 of 3');
    await settle();
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/^Page 1 of 3, Shark & Yolanda Reef/));
  });

  test('the contents of a long log open at the open page without drawing every row above it', async () => {
    mockDives = Array.from({ length: 300 }, (_, i) => dive(i + 1, { divedOn: '2026-03-01' }));
    await render();
    await act(async () => root.root.findAll((n) => n.props.accessibilityHint === 'Lists every page' && typeof n.props.onPress === 'function')[0].props.onPress());
    const rows = root.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityState && 'selected' in n.props.accessibilityState && n.props.accessibilityRole === 'button');
    expect(rows.length).toBeLessThan(40);
    const open = rows.filter((r) => r.props.accessibilityState.selected);
    expect(open.map((r) => r.props.accessibilityLabel.split(',')[0])).toEqual(['Page 300 of 300']);
  });

  test('Contents closes without turning', async () => {
    await render();
    await act(async () => root.root.findAll((n) => n.props.accessibilityHint === 'Lists every page' && typeof n.props.onPress === 'function')[0].props.onPress());
    await press('Close');
    expect(root.root.findAllByType(Modal)).toHaveLength(0);
    expect(count()).toBe('3 of 3');
  });

  test('coming back after logging a dive shows the new page', async () => {
    await render();
    await press('Previous page');
    await press('Previous page');
    expect(count()).toBe('1 of 3');
    mockDives = [...mockDives, dive(4)];
    await rerender();
    expect(count()).toBe('4 of 4');
  });

  test('a page synced in or renumbered elsewhere leaves the book open where it was; a deleted page leaves it on the page now there', async () => {
    await render();
    await press('Previous page');
    expect(count()).toBe('2 of 3');
    // An older page arrives from another phone: the same page stays open, now one further in.
    mockDives = [dive(0, { id: 'd0', divedOn: '2026-03-01' }), ...mockDives];
    await rerender();
    expect(count()).toBe('3 of 4');
    expect(counter().props.accessibilityValue.text).toMatch(/^Page 3 of 4, Shark & Yolanda Reef/);
    // The open page is deleted: the book stays where it was, at the page now in its place.
    mockDives = mockDives.filter((d) => d.id !== 'd2');
    await rerender();
    expect(count()).toBe('3 of 3');
    expect(counter().props.accessibilityValue.text).toMatch(/Cod Hole/);
  });

  test('the open page is the dive’s own page: Share and Edit at its head, what you saw, signatures and Delete', async () => {
    await render();
    const inPage = (label) => openLeaf().findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    expect(inPage('Share this page').length).toBeGreaterThan(0);
    await act(async () => inPage('Edit page')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/dive/edit', params: { id: 'd3' } });
    expect(texts()).toEqual(expect.arrayContaining(['What you saw', 'Reef Manta Ray', 'Whale Shark', 'Signatures', 'Delete page']));
    // The swipe and the arrows turn the book's pages, so the page has no previous and next buttons of its own.
    expect(root.root.findAll((n) => /^(Previous|Next) page: dive/.test(n.props.accessibilityLabel ?? ''))).toHaveLength(0);
  });

  test('only the page in view is there for a screen reader', async () => {
    await render();
    // A leaf is as wide as the list's page; the one drawn is the open page, and it is not hidden.
    const width = pageWidth(4);
    const leaves = root.root.findAll((n) => typeof n.type === 'string' && n.props['aria-hidden'] !== undefined && StyleSheet.flatten(n.props.style)?.width === width);
    // Every leaf has its slot; the pages beside the newest are drawn, ready for a swipe, but hidden. The newest is the one there.
    expect(leaves.map((l) => l.props['aria-hidden'])).toEqual([true, true, true, false]);
  });

  test('the Contents button and the arrows are 44 points or more', async () => {
    await render();
    const host = (pred) => root.root.findAll((n) => typeof n.type === 'string' && pred(n.props))[0];
    const contents = StyleSheet.flatten(host((p) => p.accessibilityHint === 'Lists every page').props.style);
    expect(contents.minHeight).toBeGreaterThanOrEqual(44);
    for (const label of ['Previous page', 'Next page']) {
      const arrow = StyleSheet.flatten(host((p) => p.accessibilityLabel === label && p.accessibilityRole === 'button').props.style);
      expect(Math.min(arrow.width, arrow.height)).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('an empty log', () => {
  test('is the cover and a blank first page inviting “Log a dive”, with nothing to list yet', async () => {
    mockDives = [];
    mockSightings = [];
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['Your first page is blank', 'Log a dive and what you saw to write it here.']));
    expect(count()).toBe('');
    expect(root.root.findAll((n) => n.props.accessibilityHint === 'Lists every page')).toHaveLength(0);
    await act(async () => root.root.findAll((n) => n.props.title === 'Log a dive' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/log/new');
    // The cover is one turn back.
    await press('Previous page');
    expect(counter().props.accessibilityValue.text).toBe('Cover');
  });

  test('turns to the first page as soon as it is written', async () => {
    mockDives = [];
    await render();
    mockDives = [dive(1)];
    await rerender();
    expect(count()).toBe('1 of 1');
  });
});
