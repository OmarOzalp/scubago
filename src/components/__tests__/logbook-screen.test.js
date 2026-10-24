import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import LogbookScreen from '@/app/(tabs)/logbook';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ready: true, badges: [], collections: [], passport: [], islands: [] }) }));
// Who is signed in, what is on the phone, and whether the app has a server to back up to: set by each test.
let mockUser = null;
let mockBackend = true;
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, backendEnabled: mockBackend, syncing: false, syncProblem: null, requestSync: jest.fn() }),
  useMySightings: () => mockSightings,
  useMyDives: () => mockDives,
  useDivesBefore: () => 21,
  usePendingChanges: () => ({ count: 0, failing: 0 }),
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
}));

const dive = (number, over = {}) => ({ id: `d${number}`, userId: 'local', number, siteId: 'shark-yolanda', divedOn: `2026-03-${10 + number}`, createdAt: `2026-03-${10 + number}T12:00:00Z`, synced: false, ...over });
const sighting = (id, speciesId) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: false, createdAt: '2026-03-12T10:00:00Z' });

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
  mockUser = null;
  mockBackend = true;
  mockDives = [dive(1, { bottomTimeMin: 120 }), dive(2, { bottomTimeMin: 177 })];
  mockSightings = [sighting('a', 'reef-manta')];
  router.push.mockClear();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<LogbookScreen />); }); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const button = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const row = (text) => texts().indexOf(text);

describe('the backup row', () => {
  test('is one line about what is only on this phone, with a way to back it up and a way to close it', async () => {
    await render();
    expect(texts()).toContain('2 pages only on this phone');
    expect(texts()).not.toContain('Back up my log');
    await act(async () => button('2 pages only on this phone. Back up my log')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/auth');
  });

  test('says sightings while there are no pages yet, and is not there before there is anything to lose', async () => {
    mockDives = [];
    await render();
    expect(texts()).toContain('1 sighting only on this phone');
    await act(async () => root.unmount());
    mockSightings = [];
    await render();
    expect(texts().filter((t) => /only on this phone|Back up/.test(t))).toEqual([]);
  });

  test('is not there for a signed-in diver, or in a build with nowhere to back up to', async () => {
    mockUser = { id: 'u1', username: 'kai' };
    await render();
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
    await act(async () => root.unmount());
    mockUser = null;
    mockBackend = false;
    await render();
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
  });

  test('once closed it stays closed, on the next visit too', async () => {
    await render();
    await act(async () => button('Dismiss this reminder')[0].props.onPress());
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
    expect(await AsyncStorage.getItem('scubago.backupRowDismissed.v1')).toBeTruthy();
    await act(async () => root.unmount());
    await render();
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
  });
});

describe('the page', () => {
  test('puts the dives first: totals, “Badges & collections”, the pages, and only then the rarely used rows', async () => {
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['Badges & collections', 'Pages', 'Dives before ScubaGo', 'Buddy code']));
    // (Every page here is at Shark & Yolanda Reef.) The two rows come after the last page, and Badges before the first.
    const pages = texts().map((t, i) => (t === 'Shark & Yolanda Reef' ? i : -1)).filter((i) => i >= 0);
    expect(pages).toHaveLength(2);
    expect(row('Badges & collections')).toBeLessThan(row('Pages'));
    expect(row('Pages')).toBeLessThan(pages[0]);
    expect(row('Dives before ScubaGo')).toBeGreaterThan(pages[1]);
    expect(row('Buddy code')).toBeGreaterThan(row('Dives before ScubaGo'));
  });

  test('has no “Begin entry” row, no “Field guide” link beside Pages, and no “Badges & passport”', async () => {
    await render();
    const shown = texts().join('|');
    expect(shown).not.toMatch(/Begin entry/);
    expect(shown).not.toMatch(/Field guide/);
    expect(shown).not.toMatch(/Badges & passport/);
  });

  test('the rows below the list still lead to their screens', async () => {
    await render();
    await act(async () => button('Dives before ScubaGo. 21 logged elsewhere; your pages are numbered after them')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/dive/count');
    await act(async () => button('Buddy code. Confirm a buddy’s sighting or sign their dive')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/verify');
  });

  test('with no pages, the empty state is where the first one is begun, and the rows are still below it', async () => {
    mockDives = [];
    mockSightings = [];
    await render();
    expect(texts()).toContain('Your first page is blank');
    expect(row('Dives before ScubaGo')).toBeGreaterThan(row('Your first page is blank'));
  });

  test('the time in the totals is short enough to stay on one line of its cell', async () => {
    await render();
    // 120 + 177 minutes.
    expect(texts()).toContain('4h 57m');
  });
});
