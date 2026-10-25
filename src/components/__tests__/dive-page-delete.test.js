import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import DivePageScreen from '@/app/dive/[id]';

// Deleting a page from its own screen (/dive/[id]): the screen closes to wherever the diver came from, or to the
// Logbook when nothing is underneath (opened from a link, or a reload on the web), and it keeps showing the page,
// animals and all, while it closes.
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => mockCanGoBack) },
  useLocalSearchParams: () => ({ id: 'd1' }),
  Stack: { Screen: () => null },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockDives = [];
let mockSightings = [];
let mockFail = false;
let mockReady = true;
jest.mock('@/lib/store', () => ({
  useAppStore: (select) =>
    select({
      sightings: mockSightings,
      ready: mockReady,
      user: null,
      backendEnabled: false,
      // As the store does: the page and its sightings go in one update.
      deleteDive: async (id) => {
        if (mockFail) throw new Error('The disk is full');
        mockDives = mockDives.filter((d) => d.id !== id);
        mockSightings = mockSightings.filter((s) => s.diveId !== id);
      },
    }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
}));

const dive = (over = {}) => ({ id: 'd1', userId: 'local', number: 12, siteId: 'shark-yolanda', divedOn: '2026-03-12', maxDepthM: 28, synced: true, createdAt: '2026-03-12T12:00:00Z', ...over });
const sighting = (id, speciesId) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', diveId: 'd1', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z' });

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockCanGoBack = true;
  mockFail = false;
  mockReady = true;
  mockDives = [dive({ id: 'd0', number: 11, divedOn: '2026-03-11' }), dive()];
  mockSightings = [sighting('a', 'reef-manta')];
  router.back.mockClear();
  router.replace.mockClear();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<DivePageScreen />); }); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const remove = async () => {
  const del = root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll((c) => c.children?.[0] === 'Delete page').length > 0)[0];
  await act(async () => del.props.onPress());
  // The store has changed under the screen: draw it again, as the store's update would.
  await act(async () => root.update(<DivePageScreen />));
};

describe('deleting a page from its own screen', () => {
  test('goes back to where the diver came from', async () => {
    await render();
    await remove();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('opened from a link or a reload, with nothing underneath, goes to the Logbook instead of getting stuck', async () => {
    mockCanGoBack = false;
    await render();
    await remove();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/logbook');
  });

  test('keeps showing the page and its animals while it closes, not “This page isn’t in your log.”', async () => {
    await render();
    await remove();
    const shown = texts();
    expect(shown.join(' ')).not.toMatch(/isn’t in your log/);
    expect(shown).toEqual(expect.arrayContaining(['Shark & Yolanda Reef', 'Reef Manta Ray']));
    expect(shown).not.toContain('Nothing logged on this dive yet.');
  });

  test('a delete that fails stays on the page and says why', async () => {
    mockFail = true;
    await render();
    await remove();
    expect(texts()).toContain('The disk is full');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('a page that really is gone (an old link) still says so', async () => {
    mockDives = [];
    await render();
    expect(texts()).toContain('This page isn’t in your log.');
  });

  test('says nothing while the log is still loading (a cold start, or a reload on the web), then shows the page', async () => {
    mockReady = false;
    const all = mockDives;
    mockDives = [];
    await render();
    expect(texts().join(' ')).not.toMatch(/isn’t in your log/);
    mockReady = true;
    mockDives = all;
    await act(async () => root.update(<DivePageScreen />));
    expect(texts()).toContain('Shark & Yolanda Reef');
  });
});
