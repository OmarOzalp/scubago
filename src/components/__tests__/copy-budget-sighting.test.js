import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import SightingDetailScreen from '@/app/sighting/[id]';
import { screenTexts, screenWords, timesShown } from '@/test-support/screen-words';

// A sighting's page: at most 55 words in all (it was 105; the style guide allows 110 for a detail page), with the
// explanations behind one closed row, nothing about "saved on this device" (the Logbook's banner says it), and the
// day named once, as the page's own title. The signed-out diver is the one who saw the most before.
const BUDGET = 55;

let mockHeader;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 's1' }),
  Stack: { Screen: ({ options }) => { mockHeader = options; return options?.headerRight ? options.headerRight() : null; } },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/hooks/use-photo-url', () => ({ usePhotoUrl: () => undefined }));
const mockClient = {};
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));
let mockSighting;
const mockRequestSync = jest.fn();
jest.mock('@/lib/store', () => ({
  // Signed out, in a build with a server: the state that used to say "Saved on this device only. Sign in to back it up".
  useAppStore: (select) =>
    select({
      sightings: [mockSighting],
      dives: [{ id: 'd25', userId: 'local', number: 25, siteId: 'shark-yolanda', divedOn: '2026-03-12', synced: false, createdAt: '2026-03-12T09:00:00Z' }],
      backendEnabled: true,
      user: null,
      syncing: false,
      requestSync: mockRequestSync,
      deleteSighting: jest.fn(),
    }),
  useMyUserId: () => 'local',
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
}));

const sighting = (over = {}) => ({
  id: 's1', userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: 'shark-yolanda', diveId: 'd25', sightedOn: '2026-03-12',
  isDemo: false, synced: false, createdAt: '2026-03-12T10:00:00', visibility: 'private', ...over,
});

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
  mockSighting = sighting();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const render = async () => { await act(async () => { root = create(<SightingDetailScreen />); }); };

describe('the sighting page’s copy budget', () => {
  test('stays within the budget for the diver’s own, private, unverified sighting', async () => {
    await render();
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(BUDGET);
  });

  test('the animal is named once, on its card, and the header holds only the back arrow and Edit', async () => {
    await render();
    expect(timesShown(root.toJSON(), 'Reef Manta Ray')).toBe(1);
    expect(mockHeader.headerTitle).toBe('');
    expect(mockHeader.title).toBe('Reef Manta Ray');
  });

  test('says nothing about where it is saved, and has no “@you” or logged-by line', async () => {
    await render();
    const text = screenTexts(root.toJSON()).join(' | ');
    expect(text).not.toMatch(/Saved on this device|Sign in to back it up|Logged by|ScubaGo on/);
    expect(text).not.toMatch(/@you/);
  });

  test('keeps the explanations behind one row: nothing about what “unverified” or “only you” mean is on the page', async () => {
    await render();
    const text = screenTexts(root.toJSON()).join(' | ');
    expect(text).toContain('What does this mean?');
    expect(text).not.toMatch(/No one else has confirmed|they’ll see the species/);
    // And the buddy part is one button and “Sign in first.”, not a card with a paragraph.
    expect(text).toContain('Ask a buddy to confirm');
    expect(text).not.toMatch(/Someone on the dive saw it too/);
  });
});
