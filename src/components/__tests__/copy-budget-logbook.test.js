import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import LogbookScreen from '@/app/(tabs)/logbook';
import { headingTexts, screenTexts, screenWords } from '@/test-support/screen-words';

// The Logbook (a tab screen): at most 120 words in all with three pages on it (the style guide's budget for a tab
// screen; it was 150 with the same pages), the title once and with no eyebrow over it, and a banner of one line.
const BUDGET = 120;

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ready: true, badges: [], collections: [], passport: [], islands: [] }) }));
let mockUser = null;
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, backendEnabled: true, syncing: false, syncProblem: null, requestSync: jest.fn() }),
  useMySightings: () => mockSightings,
  useMyDives: () => mockDives,
  useDivesBefore: () => 21,
  usePendingChanges: () => ({ count: 0, failing: 0 }),
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
}));

const dive = (number) => ({ id: `d${number}`, userId: 'local', number, siteId: 'shark-yolanda', divedOn: `2026-03-${10 + number}`, bottomTimeMin: 50, maxDepthM: 24, createdAt: `2026-03-${10 + number}T12:00:00Z`, synced: false });
const sighting = (id, speciesId, diveId) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', diveId, sightedOn: '2026-03-12', isDemo: false, synced: false, createdAt: '2026-03-12T10:00:00Z' });

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
  mockUser = null;
  mockDives = [dive(1), dive(2), dive(3)];
  mockSightings = [sighting('a', 'reef-manta', 'd3'), sighting('b', 'whale-shark', 'd3')];
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const render = async () => { await act(async () => { root = create(<LogbookScreen />); }); };

describe('the Logbook’s copy budget', () => {
  test('stays within the budget, with the backup banner showing', async () => {
    await render();
    const text = screenTexts(root.toJSON());
    expect(text).toContain('3 pages only on this phone');
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(BUDGET);
  });

  test('the title is named once, with no eyebrow over it', async () => {
    await render();
    expect(headingTexts(root.toJSON()).filter((h) => h === 'Logbook')).toHaveLength(1);
    const text = screenTexts(root.toJSON());
    expect(text.filter((t) => t === 'Logbook')).toHaveLength(1);
    expect(text).not.toContain('Your logbook');
  });

  test('the banner is one line and says Saved-on-this-phone once; the pages do not say it again', async () => {
    await render();
    const text = screenTexts(root.toJSON());
    expect(text.filter((t) => /only on this phone/.test(t))).toHaveLength(1);
    expect(text.join(' ')).not.toMatch(/Saved on this device/);
  });

  test('the empty log is lighter still: 30 words at most', async () => {
    mockDives = [];
    mockSightings = [];
    await render();
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(30);
  });
});
