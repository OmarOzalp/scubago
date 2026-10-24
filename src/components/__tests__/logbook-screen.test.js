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

describe('the page', () => {
  test('puts the dives first: three totals, “Badges & collections”, then the pages, and nothing after the last page', async () => {
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['Badges & collections', 'Pages']));
    // (Every page here is at Shark & Yolanda Reef.) Badges come before the first page, and nothing follows the last.
    const pages = texts().map((t, i) => (t === 'Shark & Yolanda Reef' ? i : -1)).filter((i) => i >= 0);
    expect(pages).toHaveLength(2);
    expect(row('Badges & collections')).toBeLessThan(row('Pages'));
    expect(row('Pages')).toBeLessThan(pages[0]);
    // The page ends with the last page's own row (its date and facts), not with setup rows.
    const lastRow = Math.max(...texts().map((t, i) => (/^Mar \d+, 2026/.test(t) || t === 'Shark & Yolanda Reef' ? i : -1)));
    expect(texts().length - 1 - lastRow).toBeLessThanOrEqual(3);
  });

  test('has no eyebrow over its title, and three totals (dives, time, deepest) without the species count', async () => {
    await render();
    expect(texts()).toContain('Logbook');
    expect(texts()).not.toContain('Your logbook');
    expect(texts().filter((t) => /^@/.test(t))).toEqual([]);
    expect(texts()).toEqual(expect.arrayContaining(['DIVES', 'TIME', 'DEEPEST']));
    expect(texts().filter((t) => /species/i.test(t))).toEqual([]);
  });

  test('says how many pages beside the heading, not in an eyebrow above it', async () => {
    await render();
    expect(texts()).not.toContain('2 in ScubaGo');
    expect(root.root.findAll((n) => n.props.accessibilityLabel === '2 pages in ScubaGo').length).toBeGreaterThan(0);
  });

  test('the badges line is a count to scan', async () => {
    await render();
    expect(texts().filter((t) => /badges/.test(t))).toEqual(['0 of 0 badges']);
  });

  test('has no “Begin entry” row, no “Field guide” link beside Pages, and no “Badges & passport”', async () => {
    await render();
    const shown = texts().join('|');
    expect(shown).not.toMatch(/Begin entry/);
    expect(shown).not.toMatch(/Field guide/);
    expect(shown).not.toMatch(/Badges & passport/);
  });

  test('“Dives before ScubaGo” and “Buddy code” are not here: they are on the account page', async () => {
    await render();
    expect(texts().filter((t) => /Dives before ScubaGo|Buddy code|logged elsewhere/.test(t))).toEqual([]);
    expect(button(/./)).toBeDefined();
    // The count they set still stands in the totals (21 logged before ScubaGo, and only 2 pages numbered below it).
    expect(texts()).toContain('21');
  });

  test('the account icon is always there, so every diver can reach what moved to the account page', async () => {
    const label = () => root.root.findAll((n) => n.props.accessibilityRole === 'button' && /^Sign in or create an account$|^Account/.test(n.props.accessibilityLabel ?? ''));
    await render();
    expect(label().length).toBeGreaterThan(0);
    await act(async () => label()[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/auth');
    await act(async () => root.unmount());

    // No server in this build: nothing to sign in to, but "Dives before ScubaGo" is still on the account page.
    mockBackend = false;
    await render();
    expect(label().length).toBeGreaterThan(0);
    await act(async () => label()[0].props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/auth');
    await act(async () => root.unmount());

    mockBackend = true;
    mockUser = { id: 'u1', username: 'kai' };
    await render();
    expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Account, signed in as kai').length).toBeGreaterThan(0);
  });

  test('with no pages, the empty state is where the first one is begun, in one short line, with no badges row yet', async () => {
    mockDives = [];
    mockSightings = [];
    await render();
    expect(texts()).toContain('Your first page is blank');
    expect(texts()).toContain('Log a dive and what you saw to write it here.');
    expect(texts().filter((t) => /Badges|badges/.test(t))).toEqual([]);
    expect(texts().filter((t) => /Dives before ScubaGo|Buddy code/.test(t))).toEqual([]);
  });

  test('the time in the totals is short enough to stay on one line of its cell', async () => {
    await render();
    // 120 + 177 minutes.
    expect(texts()).toContain('4h 57m');
  });
});
