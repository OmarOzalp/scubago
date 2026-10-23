import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Modal } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import DivePageScreen from '@/app/dive/[id]';

// The header's buttons are drawn by the navigator; here the screen's own options are drawn in its place.
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'd1' }),
  Stack: { Screen: ({ options }) => (options?.headerRight ? options.headerRight() : null) },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockDives = [];
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSightings, user: null, backendEnabled: false, deleteDive: jest.fn() }),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
  useMyDives: () => mockDives,
  useMyUserId: () => 'local',
}));

const dive = (over = {}) => ({ id: 'd1', userId: 'local', number: 87, siteId: 'shark-yolanda', divedOn: '2026-03-12', maxDepthM: 28, centreName: 'Red Sea Divers', notes: 'Notes only for me', synced: true, createdAt: '2026-03-12T12:00:00Z', ...over });
const sighting = (id, speciesId, over = {}) => ({ id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', diveId: 'd1', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over });

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockDives = [dive()]; mockSightings = []; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<DivePageScreen />); }); };
const shareButton = () => root.root.findAll((n) => n.props.accessibilityHint === 'Shows a picture of this logbook page to share' && typeof n.props.onPress === 'function');
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const button = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const titled = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function');

describe('the dive page’s Share button', () => {
  test('is in the page’s header, and opens that dive’s card without its notes or its private sightings', async () => {
    mockSightings = [sighting('a', 'reef-manta'), sighting('b', 'whale-shark', { visibility: 'private' })];
    await render();
    expect(shareButton().length).toBeGreaterThan(0);
    await act(async () => shareButton()[0].props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(1);
    const shown = texts();
    expect(shown).toEqual(expect.arrayContaining(['Share this dive', 'NOT VERIFIED', '1 private sighting is left off this card.']));
    // The page behind lists every animal and the notes (it is the diver's own); the card in the preview has only the shared animal and no notes.
    expect(shown.filter((t) => t === 'Reef Manta Ray')).toHaveLength(2);
    expect(shown.filter((t) => t === 'Whale Shark')).toHaveLength(1);
    expect(shown.filter((t) => t === 'Notes only for me')).toHaveLength(1);
  });

  test('is not there when the page isn’t in the diver’s log', async () => {
    mockDives = [];
    await render();
    expect(shareButton()).toHaveLength(0);
  });
});

describe('the dive page’s actions', () => {
  test('Edit is a header button, and there is no Edit or Share button left at the foot of the page', async () => {
    await render();
    expect(button('Edit page').length).toBeGreaterThan(0);
    await act(async () => button('Edit page')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/dive/edit', params: { id: 'd1' } });
    expect(titled('Edit page')).toHaveLength(0);
    expect(titled('Share this page')).toHaveLength(0);
  });

  test('“Ask your buddy to sign” is a secondary button, whether or not the page is signed', async () => {
    await render();
    expect(titled('Ask your buddy to sign')[0].props.variant).toBe('secondary');
    await act(async () => root.unmount());
    mockDives = [dive({ signature: { name: 'Maya', svg: '<svg/>', at: '2026-03-12T12:00:00Z' } })];
    await render();
    expect(titled('Add a signature')[0].props.variant).toBe('secondary');
  });

  test('deleting stays in its own zone at the foot', async () => {
    await render();
    expect(texts()).toContain('Delete page');
  });

  test('a row under “What you saw” says how rare the animal is and what was written about it, not the site again', async () => {
    mockSightings = [sighting('a', 'reef-manta', { notes: 'Came in over the cleaning station' }), sighting('b', 'whale-shark'), sighting('c', 'unlisted', { notes: 'A nudibranch I could not name' })];
    await render();
    const shown = texts();
    expect(shown).toContain('Uncommon · Came in over the cleaning station');
    expect(shown).toContain('Rare');
    expect(shown).toContain('A nudibranch I could not name');
    // The site is in the page's head, once, not under every animal.
    expect(shown.filter((t) => t.includes('Shark & Yolanda'))).toHaveLength(1);
  });
});
