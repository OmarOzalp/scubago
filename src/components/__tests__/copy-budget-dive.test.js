import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import DivePageScreen from '@/app/dive/[id]';
import { screenTexts, screenWords } from '@/test-support/screen-words';

// A dive's page: at most 75 words in all (it was 104; about 70 is the target), the explanation of signing behind a
// closed row, and nothing about where the page is saved or when it was written when that is the day of the dive.
// The page's one title is the number box; the header carries the same number, so it is the page's only title.
const BUDGET = 75;

let mockHeader;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: 'd1' }),
  Stack: { Screen: ({ options }) => { mockHeader = options; return options?.headerRight ? options.headerRight() : null; } },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  // Signed out, in a build with a server: where the old page said "Saved on this device only. Sign in to back it up".
  useAppStore: (select) => select({ sightings: mockSightings, user: null, backendEnabled: true, syncing: false, requestSync: jest.fn(), deleteDive: jest.fn() }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
}));

const dive = (over = {}) => ({
  id: 'd1', userId: 'local', number: 25, siteId: 'shark-yolanda', divedOn: '2026-03-12', timeIn: '07:50', bottomTimeMin: 47, maxDepthM: 24,
  synced: false, createdAt: '2026-03-12T12:00:00', ...over,
});
const sighting = (id, speciesId) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', diveId: 'd1', isDemo: false, synced: false, createdAt: '2026-03-12T10:00:00' });

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockDives = [dive()];
  mockSightings = [sighting('a', 'reef-manta'), sighting('b', 'whale-shark')];
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const render = async () => { await act(async () => { root = create(<DivePageScreen />); }); };
const button = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function');

describe('the dive page’s copy budget', () => {
  test('stays within the budget, milestone bookplate and all', async () => {
    await render();
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(BUDGET);
  });

  test('says nothing about where the page is saved, and nothing about when it was written on the day of the dive', async () => {
    await render();
    const text = screenTexts(root.toJSON()).join(' | ');
    expect(text).not.toMatch(/Saved on this device|Sign in to back it up|Written in ScubaGo|Written /);
  });

  test('an old page written later says when, and an edited one says so', async () => {
    mockDives = [dive({ createdAt: '2026-04-02T12:00:00', updatedAt: '2026-04-03T12:00:00' })];
    await render();
    expect(screenTexts(root.toJSON()).join(' | ')).toMatch(/Written .*2026 · edited .*2026/);
  });

  test('signing is one line and one button; how it works is behind a row', async () => {
    await render();
    const texts = screenTexts(root.toJSON());
    expect(texts).toContain('No signatures yet.');
    expect(texts).toContain('About signatures');
    expect(texts.join(' ')).not.toMatch(/Your buddy or guide can sign|ScubaGo doesn’t check/);
    expect(button('Ask your buddy to sign')).toHaveLength(1);
    const [toggle] = root.root.findAll((n) => n.props.accessibilityLabel === 'About signatures' && typeof n.props.onPress === 'function');
    await act(async () => toggle.props.onPress());
    expect(screenTexts(root.toJSON()).join(' ')).toContain('ScubaGo doesn’t check certifications or centres.');
  });

  test('the number is the page’s title in the header, and the rows do not say “Only you” on every animal', async () => {
    mockSightings = [{ ...sighting('a', 'reef-manta'), visibility: 'private' }, { ...sighting('b', 'whale-shark'), visibility: 'private' }];
    await render();
    expect(mockHeader.title).toBe('No. 25');
    expect(screenTexts(root.toJSON()).join(' ')).not.toContain('Only you');
  });
});
