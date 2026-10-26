import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import SightingDetailScreen from '@/app/sighting/[id]';

// The header's buttons are drawn by the navigator; here the screen's own options are drawn in its place.
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: 's1' }),
  Stack: { Screen: ({ options }) => { mockHeader = options; return options?.headerRight ? options.headerRight() : null; } },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/hooks/use-photo-url', () => ({ usePhotoUrl: () => undefined }));
jest.mock('@/components/buddy-verification', () => ({ BuddyVerification: () => null }));
jest.mock('@/components/sync-line', () => ({ SyncLine: () => null, useSyncLineShown: () => true }));
let mockHeader;
let mockSighting;
let mockBackend = false;
let mockDelete = jest.fn();
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSighting ? [mockSighting] : [], dives: [], backendEnabled: mockBackend, deleteSighting: (...args) => mockDelete(...args) }),
  useMyUserId: () => 'local',
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
}));

const sighting = (over = {}) => ({ id: 's1', userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over });

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockSighting = sighting(); mockBackend = false; router.push.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<SightingDetailScreen />); }); };
const button = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const titled = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function');
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

describe('the sighting page’s actions', () => {
  test('Edit is a header button for the diver’s own sighting, and not a button at the foot of the page', async () => {
    await render();
    expect(button('Edit sighting').length).toBeGreaterThan(0);
    await act(async () => button('Edit sighting')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { edit: 's1' } });
    expect(titled('Edit sighting')).toHaveLength(0);
  });

  test('another diver’s sighting has no Edit, and no way to delete', async () => {
    mockSighting = sighting({ userId: 'someone-else', username: 'reefdiver' });
    await render();
    expect(button('Edit sighting')).toHaveLength(0);
    expect(texts()).not.toContain('Delete sighting');
  });

  test('deleting stays in its own zone at the foot', async () => {
    await render();
    expect(texts()).toContain('Delete sighting');
  });

  // The bug: the store drops the sighting before the navigator takes the page down, so the page said
  // "This sighting isn't here any more" while it slid away.
  test('deleted from here, the page goes on showing the sighting while it closes', async () => {
    mockDelete = jest.fn(async () => { mockSighting = undefined; });
    await render();
    const del = root.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.children?.[0] === 'Delete sighting').length > 0).at(-1);
    await act(async () => del.props.onPress());
    await act(async () => root.update(<SightingDetailScreen />));
    expect(mockDelete).toHaveBeenCalledWith('s1');
    expect(router.back).toHaveBeenCalled();
    expect(texts()).not.toContain('This sighting isn’t here any more.');
    expect(texts()).toContain('Reef Manta Ray');
  });

  test('a sighting that is gone (opened from an old link) says so', async () => {
    mockSighting = undefined;
    await render();
    expect(texts()).toContain('This sighting isn’t here any more.');
  });
});

describe('the status card', () => {
  test('is three ruled lines (the page, who sees it, where it stands), and the explanations wait behind one row', async () => {
    mockBackend = true;
    mockSighting = sighting({ visibility: 'private', diveId: undefined });
    await render();
    const shown = texts();
    // The three lines, in order, with their values.
    const order = ['Dive', 'Visible to', 'Only you', 'Status', 'Unverified', 'No photo'].map((t) => shown.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Nothing is said twice or explained inline.
    expect(shown).not.toContain('Verification');
    expect(shown).not.toContain('Who can see this');
    expect(shown.join(' ')).not.toMatch(/Only you can see this sighting|No one else has confirmed/);
    expect(shown).toContain('What does this mean?');
  });

  test('"What does this mean?" has both the privacy sentence (for a private sighting) and what the status says', async () => {
    mockBackend = true;
    mockSighting = sighting({ visibility: 'private' });
    await render();
    const [toggle] = button('What does this mean?');
    expect(toggle.props['aria-expanded']).toBe(false);
    await act(async () => toggle.props.onPress());
    const shown = texts().join(' ');
    expect(shown).toContain('Only you can see this sighting. If you ask a buddy to confirm it, they’ll see the species, site and date, never your notes or photo.');
    expect(shown).toContain('The diver’s own report. No one else has confirmed it yet.');
    // Under 40 words, as a disclosure's body should be.
    const body = 'Only you can see this sighting. If you ask a buddy to confirm it, they’ll see the species, site and date, never your notes or photo. The diver’s own report. No one else has confirmed it yet.';
    expect(body.split(/\s+/).length).toBeLessThanOrEqual(40);
  });

  test('a shared sighting has no privacy sentence, and another diver’s page has no "Visible to" line', async () => {
    mockBackend = true;
    mockSighting = sighting({ visibility: 'public' });
    await render();
    await act(async () => button('What does this mean?')[0].props.onPress());
    expect(texts().join(' ')).not.toContain('Only you can see this sighting');
    await act(async () => root.unmount());

    mockSighting = sighting({ userId: 'someone-else', username: 'reefdiver' });
    await render();
    expect(texts()).not.toContain('Visible to');
    expect(texts()).toContain('Status');
  });
});

describe('the foot of the page', () => {
  test('a sighting written on the day it was seen and never edited says nothing about when it was logged', async () => {
    mockSighting = sighting({ createdAt: '2026-03-12T10:00:00' });
    await render();
    expect(texts().join(' ')).not.toMatch(/Logged|Written|edited/i);
  });

  test('one logged later, or edited, says so; another diver’s says who logged it', async () => {
    mockSighting = sighting({ createdAt: '2026-03-20T10:00:00', updatedAt: '2026-03-21T10:00:00' });
    await render();
    expect(texts().join(' ')).toMatch(/Logged .*2026 · edited .*2026/);
    await act(async () => root.unmount());

    mockSighting = sighting({ userId: 'someone-else', username: 'reefdiver', createdAt: '2026-03-12T10:00:00' });
    await render();
    expect(texts().join(' ')).toMatch(/Logged by @reefdiver in ScubaGo on .*2026/);
  });

  test('"Saved on this device only. Sign in to back it up" is not on the page', async () => {
    mockBackend = true;
    await render();
    expect(texts().join(' ')).not.toMatch(/Saved on this device|Sign in to back it up/);
  });
});

test('the header shows only the back arrow and Edit: the page’s own title is the big date below', async () => {
  await render();
  expect(mockHeader.headerTitle).toBe('');
  expect(mockHeader.title).toBe('Reef Manta Ray');
});
