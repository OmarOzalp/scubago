import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import AuthScreen from '@/app/auth';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));
jest.mock('expo-linking', () => ({ useLinkingURL: () => null, createURL: (path) => `scubago://${path}` }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
// Whether this build has a server, who is signed in, and how many dives came before ScubaGo: set by each test.
let mockClient = {};
let mockUser = null;
let mockBefore = 0;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, signOutUser: jest.fn(), deleteAccount: jest.fn(), onSignedIn: jest.fn() }),
  usePendingChanges: () => ({ count: 0, failing: 0 }),
  useDivesBefore: () => mockBefore,
}));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockClient = {}; mockUser = null; mockBefore = 0; router.push.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<AuthScreen />); }); };
const texts = () => root.root.findAll((n) => n.type === 'Text' && typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const words = (list) => list.join(' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu)?.length ?? 0;
const button = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

describe('the setup rows that moved here from the Logbook', () => {
  test('signed in: “Dives before ScubaGo” and “Buddy code”, each opening its own screen, above Sign out', async () => {
    mockUser = { id: 'u1', username: 'diver-ab12' };
    await render();
    const shown = texts();
    expect(shown).toEqual(expect.arrayContaining(['Dives before ScubaGo', 'Buddy code']));
    expect(shown.indexOf('Buddy code')).toBeLessThan(shown.indexOf('Sign out'));
    await act(async () => button('Dives before ScubaGo')[0].props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/dive/count');
    await act(async () => button('Buddy code. Confirm a buddy’s sighting or dive')[0].props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/verify');
  });

  test('the dives before ScubaGo are a status on the row, once there are some, and nothing when there are none', async () => {
    mockUser = { id: 'u1', username: 'diver-ab12' };
    mockBefore = 21;
    await render();
    expect(texts()).toContain('21 logged elsewhere');
    expect(button('Dives before ScubaGo. 21 logged elsewhere').length).toBeGreaterThan(0);
    await act(async () => root.unmount());
    mockBefore = 0;
    await render();
    expect(texts().join('|')).not.toMatch(/logged elsewhere/);
  });

  test('signed out they are still here, under the form: neither needs an account to be found', async () => {
    await render();
    const shown = texts();
    expect(shown).toEqual(expect.arrayContaining(['Sign in to sync your log', 'Dives before ScubaGo', 'Buddy code']));
    expect(shown.indexOf('Dives before ScubaGo')).toBeGreaterThan(shown.indexOf('Forgot your password?'));
    await act(async () => button('Dives before ScubaGo')[0].props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/dive/count');
  });

  test('in a build with no server the dives before are still reachable, and the buddy code (which needs a server) is not offered', async () => {
    mockClient = null;
    await render();
    expect(texts()).toContain('Dives before ScubaGo');
    expect(texts()).not.toContain('Buddy code');
  });

  test('not while resetting a password: that page is for one thing', async () => {
    await render();
    const forgot = root.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.type === 'Text' && c.children.join('') === 'Forgot your password?').length > 0);
    await act(async () => forgot[0].props.onPress());
    expect(texts()).toContain('Reset your password');
    expect(texts().join('|')).not.toMatch(/Dives before ScubaGo|Buddy code/);
  });
});

describe('the copy budget', () => {
  test('signed out: the account page reads in at most 60 words, and says “Sign in” as a title once', async () => {
    await render();
    const shown = texts();
    expect(words(shown)).toBeLessThanOrEqual(60);
    expect(shown.filter((t) => t === 'Sign in to sync your log')).toHaveLength(1);
    expect(shown).toContain('Back up your log and use it on any device.');
  });

  test('signed in: at most 50 words, with the username once', async () => {
    mockUser = { id: 'u1', username: 'diver-ab12' };
    mockBefore = 21;
    await render();
    const shown = texts();
    expect(words(shown)).toBeLessThanOrEqual(50);
    expect(shown.filter((t) => t === '@diver-ab12')).toHaveLength(1);
  });
});
