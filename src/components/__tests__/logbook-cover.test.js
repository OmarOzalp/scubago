import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import { Cover } from '@/components/logbook/cover';

// The book's cover: what the Logbook's first screen held before it became a book (the totals, the badges,
// the account button, the backup and sync rows), now on the front, a swipe back from the pages.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ready: true, badges: [], collections: [], passport: [], islands: [] }) }));
// Who is signed in, what is on the phone, and whether the app has a server to back up to: set by each test.
let mockUser = null;
let mockBackend = true;
let mockSightings = [];
let mockBefore = 21;
let mockPending = { count: 0, failing: 0 };
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, backendEnabled: mockBackend, syncing: false, syncProblem: null, requestSync: jest.fn() }),
  useMySightings: () => mockSightings,
  useDivesBefore: () => mockBefore,
  usePendingChanges: () => mockPending,
}));

const dive = (number, over = {}) => ({ id: `d${number}`, userId: 'local', number, siteId: 'shark-yolanda', divedOn: `2026-03-${10 + number}`, createdAt: `2026-03-${10 + number}T12:00:00Z`, synced: false, ...over });
const sighting = (id, speciesId) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: false, createdAt: '2026-03-12T10:00:00Z' });

let root;
let dives;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
  mockUser = null;
  mockBackend = true;
  mockBefore = 21;
  mockPending = { count: 0, failing: 0 };
  dives = [dive(22, { bottomTimeMin: 120, maxDepthM: 31 }), dive(23, { bottomTimeMin: 177, maxDepthM: 18 })];
  mockSightings = [sighting('a', 'reef-manta')];
  router.push.mockClear();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<Cover dives={dives} />); }); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const button = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

describe('the cover', () => {
  test('is titled “Logbook”; signed in, it carries the diver’s name under a small LOGBOOK', async () => {
    await render();
    const title = () => root.root.findAll((n) => n.props.accessibilityRole === 'header' && n.props.accessible)[0].props.accessibilityLabel;
    expect(title()).toBe('Logbook');
    expect(texts().filter((t) => t === 'Logbook')).toHaveLength(1);
    await act(async () => root.unmount());
    mockUser = { id: 'u1', username: 'kai' };
    await render();
    expect(title()).toBe('Logbook of kai');
    expect(texts()).toEqual(expect.arrayContaining(['Logbook', 'kai']));
  });

  test('holds the three lifetime totals (dives, time, deepest) and the way to the badges', async () => {
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['DIVES', 'TIME', 'DEEPEST', 'Badges & collections']));
    // 21 before ScubaGo, and the pages numbered on from there.
    expect(texts()).toContain('23');
    // 120 + 177 minutes, short enough to stay on one line of its cell.
    expect(texts()).toContain('4h 57m');
    expect(texts()).toContain('31 m');
    expect(texts().filter((t) => /badges/.test(t))).toEqual(['0 of 0 badges']);
    await act(async () => button('Badges & collections. 0 of 0 badges')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/rewards');
    // The species count is the field guide's, not the logbook's.
    expect(texts().filter((t) => /species/i.test(t))).toEqual([]);
  });

  test('has no ledger of zeros and no badges row before the first dive', async () => {
    dives = [];
    mockBefore = 0;
    mockSightings = [];
    await render();
    expect(texts().filter((t) => /DIVES|TIME|DEEPEST|Badges|badges/.test(t))).toEqual([]);
    expect(texts()).toEqual(['Logbook']);
  });

  test('still counts the dives before ScubaGo before the first page', async () => {
    dives = [];
    mockSightings = [];
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['21', 'DIVES']));
    expect(texts().filter((t) => /Badges/.test(t))).toEqual([]);
  });

  test('“Dives before ScubaGo” and “Buddy code” are not here: they are on the account page', async () => {
    await render();
    expect(texts().filter((t) => /Dives before ScubaGo|Buddy code|logged elsewhere/.test(t))).toEqual([]);
  });

  test('the account button is always there, so every diver can reach what lives on the account page', async () => {
    const account = () => root.root.findAll((n) => n.props.accessibilityRole === 'button' && /^Sign in or create an account$|^Account/.test(n.props.accessibilityLabel ?? ''));
    await render();
    await act(async () => account()[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/auth');
    await act(async () => root.unmount());

    // No server in this build: nothing to sign in to, but "Dives before ScubaGo" is still on the account page.
    mockBackend = false;
    await render();
    expect(account()[0].props.accessibilityLabel).toBe('Account');
    await act(async () => root.unmount());

    mockBackend = true;
    mockUser = { id: 'u1', username: 'kai' };
    await render();
    expect(button('Account, signed in as kai').length).toBeGreaterThan(0);
  });

  test('says what is waiting to sync, with a way to sync now', async () => {
    mockUser = { id: 'u1', username: 'kai' };
    mockPending = { count: 2, failing: 0 };
    await render();
    expect(texts().join(' ')).toMatch(/2 changes waiting to sync/);
    expect(texts()).toContain('Sync now');
  });
});

describe('the backup row', () => {
  test('is one line about what is only on this phone, with a way to back it up and a way to close it', async () => {
    await render();
    expect(texts()).toContain('2 pages only on this phone');
    expect(texts()).not.toContain('Back up my log');
    await act(async () => button('2 pages only on this phone. Back up my log')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/auth');
  });

  test('says sightings while there are no pages yet, and is not there before there is anything to lose', async () => {
    dives = [];
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

  test('once closed it stays closed for a week, on the next visit too', async () => {
    await render();
    await act(async () => button('Dismiss this reminder for a week')[0].props.onPress());
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
    expect(await AsyncStorage.getItem('scubago.backupRowDismissed.v1')).toBeTruthy();
    await act(async () => root.unmount());
    await render();
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
  });

  test('comes back 7 days after it was closed, and not a day sooner', async () => {
    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
    await AsyncStorage.setItem('scubago.backupRowDismissed.v1', daysAgo(6.9));
    await render();
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
    await act(async () => root.unmount());

    await AsyncStorage.setItem('scubago.backupRowDismissed.v1', daysAgo(7.1));
    await render();
    expect(texts()).toContain('2 pages only on this phone');
  });

  test('a value an older build stored, that is not a date, counts as closed today', async () => {
    await AsyncStorage.setItem('scubago.backupRowDismissed.v1', '1');
    await render();
    expect(texts().filter((t) => /only on this phone/.test(t))).toEqual([]);
    // It was rewritten as a date, so the row comes back a week from now.
    expect(Number.isNaN(Date.parse(await AsyncStorage.getItem('scubago.backupRowDismissed.v1')))).toBe(false);
  });

  test('is a plain card with an info mark, not a warning', async () => {
    await render();
    expect(root.root.findAll((n) => n.props.name === 'warning')).toHaveLength(0);
    expect(root.root.findAll((n) => n.props.tone === 'sand')).toHaveLength(0);
    expect(root.root.findAll((n) => n.props.name === 'info').length).toBeGreaterThan(0);
  });
});
