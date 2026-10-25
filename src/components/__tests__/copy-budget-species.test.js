import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import SpeciesDetailScreen from '@/app/species/[id]';
import { SITES } from '@/data/sites';
import { headingTexts, screenWords } from '@/test-support/screen-words';

// The species page's copy budget: a detail page says at most 100 words in all (the style guide allows 110 for a
// detail page), and names the animal once, as its own big title. Words behind a closed row ("How rare?", "About
// these records") are not on the page until it is opened. If a new feature pushes the page over, the test says so.
const BUDGET = 100;

let mockHeader;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 'whale-shark' }),
  Stack: { Screen: ({ options }) => { mockHeader = options; return null; } },
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-image', () => ({ Image: (props) => require('react').createElement('img', props) }));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSightings, user: null, deleteSpeciesLog: jest.fn() }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
  useMyUserId: () => 'local',
}));

const sighting = (id, over = {}) => ({
  id, userId: 'local', username: 'you', speciesId: 'whale-shark', siteId: SITES[0].id, sightedOn: '2026-09-04', isDemo: false, synced: true, createdAt: '2026-09-04T10:00:00Z', ...over,
});

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const render = async () => { await act(async () => { root = create(<SpeciesDetailScreen />); }); };

describe('the species page’s copy budget', () => {
  test('an animal the diver has seen stays within the budget, with the explanations closed', async () => {
    mockSightings = [sighting('a')];
    await render();
    const words = screenWords(root.toJSON());
    expect(words).toBeLessThanOrEqual(BUDGET);
    // The old page said 165 words; the budget leaves room for a few more sightings' rows, not for another paragraph.
    expect(words).toBeGreaterThan(30);
  });

  test('an animal not seen yet is lighter still', async () => {
    mockSightings = [];
    await render();
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(BUDGET - 15);
  });

  test('the animal is named once on the page, and the header holds only the back arrow', async () => {
    mockSightings = [sighting('a')];
    await render();
    // (The diver's own sighting row names it again, as every row does: that is a row, not a second title.)
    expect(headingTexts(root.toJSON()).filter((h) => h === 'Whale Shark')).toHaveLength(1);
    expect(mockHeader.headerTitle).toBe('');
  });

  test('the explanations are behind rows, not on the page', async () => {
    mockSightings = [sighting('a')];
    await render();
    const text = root.toJSON();
    const shown = JSON.stringify(text);
    expect(shown).toContain('About these records');
    expect(shown).toContain('How rare?');
    expect(shown).not.toContain('not checked by ScubaGo');
    expect(shown).not.toContain('estimate');
  });
});
