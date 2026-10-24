import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import { BuddyVerification } from '@/components/buddy-verification';
import { screenTexts } from '@/test-support/screen-words';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
// A server to ask, and whether anyone is signed in; the answers it gives are set by each test.
let mockUser = null;
// Stable, as the real client and store are: a new one each render would restart the page's look-up each time.
const mockClient = {};
const mockRequestSync = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, requestSync: mockRequestSync }),
}));
let mockSummary = { requests: [], answers: [] };
jest.mock('@/lib/verification-api', () => ({
  ...jest.requireActual('@/lib/verification-api'),
  verificationSummary: jest.fn(async () => mockSummary),
  askBuddy: jest.fn(async () => ({ id: 'r1', code: 'ABCDE-FGHJK', maxUses: 3, expiresAt: '2026-12-01T00:00:00Z' })),
}));

const sighting = (over = {}) => ({ id: 's1', userId: 'u1', username: 'kai', speciesId: 'reef-manta', siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over });

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
  router.push.mockClear();
  mockUser = null;
  mockSummary = { requests: [], answers: [] };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async (s = sighting()) => { await act(async () => { root = create(<BuddyVerification sighting={s} speciesName="Reef Manta Ray" />); }); };
const button = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function');

describe('asking a buddy', () => {
  test('signed out, it is one button and one short line: no card, no heading and no paragraph above them', async () => {
    await render();
    expect(screenTexts(root.toJSON())).toEqual(['Ask a buddy to confirm', 'Sign in first.']);
    await act(async () => button('Ask a buddy to confirm')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/auth');
  });

  test('signed in with nothing asked yet, it is the same one button', async () => {
    mockUser = { id: 'u1', username: 'kai' };
    await render();
    expect(screenTexts(root.toJSON())).toEqual(['Ask a buddy to confirm']);
  });

  test('asking makes a code to send, in a card with its heading', async () => {
    mockUser = { id: 'u1', username: 'kai' };
    await render();
    await act(async () => button('Ask a buddy to confirm')[0].props.onPress());
    const shown = screenTexts(root.toJSON());
    expect(shown).toContain('Ask a buddy');
    expect(shown).toContain('Send this code to someone who was on the dive with you:');
    expect(shown).toContain('ABCDE-FGHJK');
  });

  test('a sighting that has not synced yet says what it is waiting for', async () => {
    mockUser = { id: 'u1', username: 'kai' };
    await render(sighting({ synced: false }));
    expect(screenTexts(root.toJSON()).join(' ')).toContain('Once this sighting has synced, you can ask someone who was on the dive to confirm it.');
  });
});
