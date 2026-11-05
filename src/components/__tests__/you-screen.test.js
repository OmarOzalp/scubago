import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import YouScreen from '@/app/you';
import HelpScreen, { HELP_ITEMS } from '@/app/help';
import { OCEAN_PAUSED_KEY, resetOceanPausedForTests } from '@/lib/ocean-pause';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockUser = null;
let mockBackend = true;
let mockBefore = 0;
let mockPending = { count: 0, failing: 0 };
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, backendEnabled: mockBackend, syncing: false, syncProblem: null, requestSync: jest.fn() }),
  usePendingChanges: () => mockPending,
  useDivesBefore: () => mockBefore,
}));

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
  resetOceanPausedForTests();
  mockUser = null;
  mockBackend = true;
  mockBefore = 0;
  mockPending = { count: 0, failing: 0 };
  router.push.mockClear();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async (Screen = YouScreen) => { await act(async () => { root = create(<Screen />); }); };
const texts = () => root.root.findAll((n) => n.type === 'Text' && typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const words = (list) => list.join(' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu)?.length ?? 0;
const press = (label) => root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];

describe('You', () => {
  test('signed out: the rows in order, each one a way to somewhere that existed before', async () => {
    await render();
    const shown = texts();
    expect(shown.filter((t) => ['You', 'Back up and sync', 'Dives before ScubaGo', 'Animate the ocean', 'How ScubaGo works', 'Data & credits'].includes(t))).toEqual([
      'You', 'Back up and sync', 'Dives before ScubaGo', 'Animate the ocean', 'How ScubaGo works', 'Data & credits',
    ]);
    expect(shown).toContain('Sign in to keep your log safe');
    await act(async () => press('Back up and sync. Sign in to keep your log safe').props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/auth');
    await act(async () => press('Dives before ScubaGo').props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/dive/count');
    await act(async () => press('How ScubaGo works').props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/help');
    await act(async () => press('Data & credits').props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/credits');
  });

  test('signed in: the name comes first, and the sync state is on the sync row', async () => {
    mockUser = { id: 'u1', username: 'diver-ab12' };
    mockBefore = 21;
    await render();
    const shown = texts();
    expect(shown.indexOf('@diver-ab12')).toBeLessThan(shown.indexOf('Back up and sync'));
    expect(shown).toContain('Backed up');
    expect(shown).toContain('21 logged elsewhere');
    await act(async () => root.unmount());
    mockPending = { count: 2, failing: 0 };
    await render();
    expect(texts()).toContain('2 changes waiting');
  });

  test('a build with no server says so plainly', async () => {
    mockBackend = false;
    await render();
    expect(texts()).toContain('Saved on this phone');
  });

  test('one line of copy per row, and the page stays short', async () => {
    mockUser = { id: 'u1', username: 'diver-ab12' };
    await render();
    expect(words(texts())).toBeLessThanOrEqual(30);
  });

  test('the ocean animation switch is labelled, on by default, and remembers being turned off', async () => {
    await render();
    const sw = () => root.root.findAll((n) => n.props.accessibilityRole === 'switch' && typeof n.props.onPress === 'function')[0];
    expect(sw().props.accessibilityLabel).toBe('Animate the ocean');
    expect(sw().props.accessibilityState).toEqual({ checked: true });
    await act(async () => sw().props.onPress());
    expect(sw().props.accessibilityState).toEqual({ checked: false });
    expect(await AsyncStorage.getItem(OCEAN_PAUSED_KEY)).toBe('1');
    await act(async () => sw().props.onPress());
    expect(await AsyncStorage.getItem(OCEAN_PAUSED_KEY)).toBe('0');
  });

  test('a remembered pause is read back from storage', async () => {
    await AsyncStorage.setItem(OCEAN_PAUSED_KEY, '1');
    await render();
    await act(async () => { await Promise.resolve(); });
    expect(root.root.findAll((n) => n.props.accessibilityRole === 'switch')[0].props.accessibilityState).toEqual({ checked: false });
  });
});

describe('How ScubaGo works', () => {
  test('is a few plain lines: the island, logging, the field guide, buddy signatures, the passport, and that no account is needed', async () => {
    await render(HelpScreen);
    const shown = texts();
    for (const title of ['Your island', 'Logging', 'Field guide', 'Buddy signatures', 'Passport', 'No account needed']) expect(shown).toContain(title);
    expect(shown.join(' ')).toMatch(/works without a signal/);
    expect(HELP_ITEMS).toHaveLength(6);
    expect(words(shown)).toBeLessThanOrEqual(120);
  });
});
