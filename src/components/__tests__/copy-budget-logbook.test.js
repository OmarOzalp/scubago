import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import LogbookScreen from '@/app/(tabs)/logbook';
import { Cover } from '@/components/logbook/cover';
import { headingTexts, screenTexts, screenWords } from '@/test-support/screen-words';

// The Logbook is a book, and each of its screens keeps to the style guide's budgets:
// - the book as it opens (the bar over the newest page): 80 words, the dive page's own 75 and the bar's few;
// - the cover (a tab screen's first view): 35 words, banner and all, with the title once and no eyebrow;
// - the contents with three pages: 40 words (a row is its number, site and date, nothing to explain);
// - an empty log's blank page: 25 words (the empty-state budget), and its cover a word or two.
// The book adds no explanatory text of its own: the bar says "Contents" and the page count, nothing else.
const BOOK_BUDGET = 80;
const COVER_BUDGET = 35;
const CONTENTS_BUDGET = 40;
const EMPTY_BUDGET = 25;

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ ready: true, badges: [], collections: [], passport: [], islands: [] }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockUser = null;
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ user: mockUser, sightings: mockSightings, backendEnabled: true, syncing: false, syncProblem: null, requestSync: jest.fn(), deleteDive: jest.fn() }),
  useMySightings: () => mockSightings,
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
  useDivesBefore: () => 21,
  usePendingChanges: () => ({ count: 0, failing: 0 }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
}));

// A milestone page (No. 25) with its bookplate, two animals and the facts most pages have.
const dive = (number) => ({ id: `d${number}`, userId: 'local', number, siteId: 'shark-yolanda', divedOn: `2026-03-${number - 10}`, timeIn: '07:50', bottomTimeMin: 50, maxDepthM: 24, createdAt: `2026-03-${number - 10}T12:00:00`, synced: false });
const sighting = (id, speciesId, diveId) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', diveId, sightedOn: '2026-03-15', isDemo: false, synced: false, createdAt: '2026-03-15T10:00:00' });

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
  mockUser = null;
  mockDives = [dive(23), dive(24), dive(25)];
  mockSightings = [sighting('a', 'reef-manta', 'd25'), sighting('b', 'whale-shark', 'd25')];
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const render = async (element = <LogbookScreen />) => { await act(async () => { root = create(element); }); };
/**
 * What a diver sees of the book: the bar and the open page. The pages beside it are drawn, ready for a
 * swipe, but off screen and hidden from screen readers, so they are left out of the count.
 */
const seen = (json) => {
  const prune = (node) => {
    if (node == null || typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(prune).filter((n) => n !== null);
    if (node.props?.['aria-hidden'] === true) return null;
    return { ...node, children: node.children ? node.children.map(prune).filter((n) => n !== null) : node.children };
  };
  return prune(json);
};
const openContents = async () => {
  await act(async () => root.root.findAll((n) => n.props.accessibilityHint === 'Lists every page' && typeof n.props.onPress === 'function')[0].props.onPress());
};

describe('the Logbook book’s copy budget', () => {
  test('the book as it opens, the newest page under the bar, stays within the budget', async () => {
    await render();
    expect(screenTexts(seen(root.toJSON()))).toContain('3 of 3');
    expect(screenWords(seen(root.toJSON()))).toBeLessThanOrEqual(BOOK_BUDGET);
  });

  test('the bar adds no words of its own but “Contents” and the count', async () => {
    await render();
    const texts = screenTexts(seen(root.toJSON()));
    // The page's own first words follow the bar.
    expect(texts.slice(0, 2)).toEqual(['Contents', '3 of 3']);
  });

  test('the cover stays within the budget, with the backup banner showing', async () => {
    await render(<Cover dives={mockDives} />);
    const texts = screenTexts(root.toJSON());
    expect(texts).toContain('3 pages only on this phone');
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(COVER_BUDGET);
  });

  test('the cover’s title is named once, with no eyebrow over it, and the banner says it once', async () => {
    await render(<Cover dives={mockDives} />);
    const texts = screenTexts(root.toJSON());
    expect(texts.filter((t) => t === 'Logbook')).toHaveLength(1);
    expect(texts).not.toContain('Your logbook');
    expect(texts.filter((t) => /only on this phone/.test(t))).toHaveLength(1);
    expect(texts.join(' ')).not.toMatch(/Saved on this device/);
  });

  test('the contents, three pages and the cover, stay within the budget', async () => {
    await render();
    await openContents();
    const all = screenWords(seen(root.toJSON()));
    expect(screenTexts(root.toJSON())).toContain('Contents');
    // What the open sheet adds to the screen behind it.
    await act(async () => root.unmount());
    await render();
    expect(all - screenWords(seen(root.toJSON()))).toBeLessThanOrEqual(CONTENTS_BUDGET);
  });

  test('an empty log’s blank page is lighter still, and its cover is a title', async () => {
    mockDives = [];
    mockSightings = [];
    await render();
    expect(screenWords(seen(root.toJSON()))).toBeLessThanOrEqual(EMPTY_BUDGET);
    expect(headingTexts(root.toJSON())).toContain('Your first page is blank');
    await act(async () => root.unmount());
    await render(<Cover dives={[]} />);
    // 21 dives before ScubaGo still stand on the cover; nothing else does.
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(5);
  });
});
