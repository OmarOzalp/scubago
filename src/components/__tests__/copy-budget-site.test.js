import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import SiteDetailScreen from '@/app/site/[id]';
import { headingTexts, screenTexts, screenWords } from '@/test-support/screen-words';

// A dive site's page: at most 110 words in all (the style guide's budget for a detail page), its name once as the
// big title, the public-records explanation behind a row, and no card of zeros, legend note or "@you" on every row
// for a site the diver knows well or has never visited.
const BUDGET = 110;

let mockHeader;
let mockSiteId = 'cod-hole';
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => false, default: { View: require('react-native').View } }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: mockSiteId }),
  Stack: { Screen: ({ options }) => { mockHeader = options; return null; } },
  Link: () => null,
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(), WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' } }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
// Offline, as the audit saw it: the records could not be reached.
jest.mock('@/hooks/use-site-sightings', () => ({ useSiteSightings: () => ({ summary: null, status: 'offline', refresh: () => {} }) }));
let mockSightings = [];
let mockMine = [];
let mockDives = [];
jest.mock('@/lib/store', () => {
  const { SITES: all, SITES_BY_ID: byId } = require('@/data/sites');
  return {
    useAppStore: (select) => select({ sightings: mockSightings, user: null }),
    useAllSites: () => all,
    useSiteById: () => (id) => byId.get(id),
    useMySightings: () => mockMine,
    useMyDives: () => mockDives,
    useMyUserId: () => 'local',
  };
});

const sighting = (id, speciesId, over = {}) => ({
  id, userId: 'local', username: 'you', speciesId, siteId: 'cod-hole', diveId: 'dive-1', sightedOn: '2026-10-21', isDemo: false, synced: true, createdAt: '2026-10-21T10:00:00Z', visibility: 'private', ...over,
});
const visited = () => {
  mockMine = [sighting('a', 'potato-cod'), sighting('b', 'napoleon-wrasse'), sighting('c', 'whitetip-reef-shark')];
  mockSightings = mockMine;
  mockDives = [{ id: 'dive-1', userId: 'local', number: 27, siteId: 'cod-hole', divedOn: '2026-10-21', bottomTimeMin: 55, maxDepthM: 21, synced: true, createdAt: '2026-10-21T09:00:00Z' }];
};

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockSightings = []; mockMine = []; mockDives = []; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const render = async (id) => { mockSiteId = id; await act(async () => { root = create(<SiteDetailScreen />); }); };

describe('the site page’s copy budget', () => {
  test('a site the diver has dived stays within the budget', async () => {
    visited();
    await render('cod-hole');
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(BUDGET);
  });

  test('a site nobody has logged at is lighter, with no card of zeros and no empty "Recent sightings"', async () => {
    await render('anilao');
    const texts = screenTexts(root.toJSON());
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(BUDGET - 10);
    expect(texts).not.toContain('Sightings');
    expect(texts.join(' ')).not.toMatch(/\bSIGHTINGS?\b|Recent sightings|None yet/i);
  });

  test('the site is named once as the page’s title, and the header holds only the back arrow', async () => {
    visited();
    await render('cod-hole');
    expect(headingTexts(root.toJSON()).filter((h) => h === 'Cod Hole')).toHaveLength(1);
    expect(mockHeader.headerTitle).toBe('');
    expect(mockHeader.title).toBe('Cod Hole');
  });

  test('no legend note, and no “@you” or “Only you” on rows that are all the diver’s own', async () => {
    visited();
    await render('cod-hole');
    const text = screenTexts(root.toJSON()).join(' | ');
    expect(text).not.toMatch(/pencil sketches/);
    expect(text).not.toMatch(/@you|Only you/);
    // The rows are there, with their dates.
    expect(text).toContain('Recent sightings');
    expect(text).toContain('Potato Cod');
  });

  test('the public records are one closed row, and their short offline line is one line', async () => {
    visited();
    await render('cod-hole');
    const text = screenTexts(root.toJSON());
    expect(text).toContain('Marine life recorded here');
    expect(text).toContain('About these records');
    expect(text).toContain('Couldn’t reach records.');
    expect(text.join(' ')).not.toMatch(/not checked by ScubaGo|offline/i);
  });
});
