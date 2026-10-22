import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { FlatList, TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import { SitePicker } from '../site-picker';
import { PaperButton } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { SITES_BY_ID } from '@/data/sites';
import { siteAddedBy } from '@/lib/site-details';
import { searchSites } from '@/lib/text-search';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
// Every row asks who added its site as it is drawn, so the calls count how often rows are drawn.
jest.mock('@/lib/site-details', () => {
  const actual = jest.requireActual('@/lib/site-details');
  return { ...actual, siteAddedBy: jest.fn(actual.siteAddedBy) };
});

/** Generated here, never added to the app's data: 600 sites in a handful of regions. */
const REGIONS = [['Dahab, Red Sea', 'Egypt'], ['Hurghada & Safaga, Red Sea', 'Egypt'], ['Cairns, Great Barrier Reef', 'Australia'], ['Raja Ampat', 'Indonesia'], ['Sipadan', 'Malaysia']];
const NAMES = ['Blue Hole', 'Canyon', 'Lighthouse', 'Coral Garden', 'Wreck', 'Pinnacle', 'Bommie', 'Wall'];
function generateSites(count, prefix = 'gen-') {
  return Array.from({ length: count }, (_, i) => {
    const [region, country] = REGIONS[i % REGIONS.length];
    return {
      id: `${prefix}${i}`, name: `${NAMES[i % NAMES.length]} ${String(i).padStart(3, '0')}`, region, country, lat: i / 100, lng: i / 50,
      blurb: '', notableSpecies: [], source: 'seed',
    };
  });
}
const SITES = generateSites(600);

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; router.push.mockClear(); siteAddedBy.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.restoreAllMocks(); });

const render = async (over = {}) => {
  const props = { sites: SITES, recentSiteIds: [], userId: 'me', onPick: jest.fn(), ...over };
  await act(async () => { root = create(<SitePicker {...props} />); });
  return props;
};
const rows = () => root.root.findAllByType(PaperButton);
const labels = () => rows().map((r) => r.props.accessibilityLabel);
const type = async (text) => { await act(async () => root.root.findByType(TextInput).props.onChangeText(text)); };
const data = () => root.root.findByType(FlatList).props.data;
const text = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join('')).join(' | ');

test('with 600 sites it builds only the rows near the top, in alphabetical order, and keeps the search and the add button', async () => {
  await render();
  expect(rows().length).toBeGreaterThan(5);
  expect(rows().length).toBeLessThanOrEqual(24);
  const alphabetical = [...SITES].sort((a, b) => a.name.localeCompare(b.name));
  expect(labels()[0]).toBe(`${alphabetical[0].name}, ${alphabetical[0].region}, ${alphabetical[0].country}`);
  expect(data()).toHaveLength(600);
  expect(root.root.findByType(TextInput).props.accessibilityLabel).toBe('Where did you dive?');
  expect(text()).toContain('Can’t find it? Add a dive site');
  // The list is windowed rather than a plain ScrollView of everything, and rows are keyed by site.
  const list = root.root.findByType(FlatList).props;
  expect(list.windowSize).toBeLessThan(21);
  expect(list.initialNumToRender).toBeLessThan(30);
  expect(list.keyExtractor(list.data[0])).toBe(list.data[0].key);
});

test('typing filters the whole list with the forgiving search, and finds nothing for nonsense', async () => {
  await render();
  await type('dahab');
  const expected = searchSites(SITES, 'dahab');
  expect(expected).toHaveLength(120);
  expect(data().map((r) => r.site.id)).toEqual(expected.map((s) => s.id));
  expect(labels().every((l) => l.includes('Dahab, Red Sea'))).toBe(true);
  // A typo still finds them, as it does on the rest of the app.
  await type('dahav');
  expect(data()).toHaveLength(120);
  // A name finds just that site, first.
  await type('Wreck 004');
  expect(labels()[0]).toBe('Wreck 004, Sipadan, Malaysia');
  // Nothing: a message, said politely, and the button is still there.
  await type('zzzqx');
  expect(rows()).toHaveLength(0);
  expect(text()).toContain('No site matches “zzzqx”.');
  expect(root.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite').length).toBeGreaterThan(0);
  expect(text()).toContain('Can’t find it? Add a dive site');
  // Clearing the search brings the whole list back.
  await type('');
  expect(data()).toHaveLength(600);
});

test('filtering 600 sites is quick', async () => {
  await render();
  const start = performance.now();
  for (const query of ['d', 'da', 'dah', 'daha', 'dahab']) searchSites(SITES, query);
  expect(performance.now() - start).toBeLessThan(1500);
  await type('raja ampat');
  expect(data()).toHaveLength(120);
});

test('recent sites come first, in the order given, under their own heading, and only while not searching', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // One of them is also somewhere in "All sites"; the one that no longer exists is skipped.
  await render({ recentSiteIds: ['gen-9', 'gen-3', 'gone'] });
  const list = data();
  expect(list.slice(0, 4).map((r) => r.key)).toEqual(['header:recent', 'recent:gen-9', 'recent:gen-3', 'header:all']);
  expect(list.slice(0, 4).map((r) => r.title ?? r.site.name)).toEqual(['Recent', 'Canyon 009', 'Coral Garden 003', 'All sites']);
  expect(new Set(list.map((r) => r.key)).size).toBe(list.length);
  expect(text()).toContain('Recent');
  expect(text()).toContain('All sites');
  const headers = root.root.findAll((n) => n.props.accessibilityRole === 'header' && n.props.type === 'label');
  expect(headers.map((h) => h.props.children)).toEqual(['Recent', 'All sites']);

  await type('canyon 009');
  expect(data().every((r) => r.kind === 'site' && !r.recent)).toBe(true);
  expect(text()).not.toContain('All sites');
  // No warning about two rows with the same key.
  expect(spy.mock.calls.flat().join(' ')).not.toMatch(/same key|unique "key"/);
  await type('');
  expect(data()[0].key).toBe('header:recent');
});

test('a recent site logged at a hidden copy is the listed site it stands for, once', async () => {
  // OpenStreetMap's own Cod Hole is hidden behind the seed; a diver may have logged there while it was listed.
  const codHole = SITES_BY_ID.get('cod-hole');
  await render({ sites: [codHole, ...SITES], recentSiteIds: ['osm-node-270802348', 'gen-3', 'cod-hole'] });
  expect(data().slice(0, 4).map((r) => r.key)).toEqual(['header:recent', 'recent:cod-hole', 'recent:gen-3', 'header:all']);
});

test('picking a row hands back its site, and the diver’s own sites say who added them', async () => {
  const mine = { ...generateSites(1, 'user-')[0], id: 'user-1', name: 'Aaa My Reef', source: 'user', createdBy: 'me' };
  const props = await render({ sites: [mine, ...SITES.slice(0, 20)] });
  const first = rows()[0];
  expect(first.props.accessibilityLabel).toBe('Aaa My Reef, Dahab, Red Sea, Egypt · added by you');
  await act(async () => first.props.onPress());
  expect(props.onPick).toHaveBeenCalledWith(mine);
});

test('a parent that makes a new onPick each render does not rebuild the rows', async () => {
  const first = jest.fn();
  await render({ onPick: first, recentSiteIds: ['gen-1'] });
  const drawn = siteAddedBy.mock.calls.length;
  expect(drawn).toBeGreaterThan(5);
  siteAddedBy.mockClear();
  const second = jest.fn();
  await act(async () => root.update(<SitePicker sites={SITES} recentSiteIds={['gen-1']} userId="me" onPick={second} />));
  expect(siteAddedBy).not.toHaveBeenCalled();
  // The row that was drawn before calls the newest onPick.
  await act(async () => rows()[0].props.onPress());
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen-1' }));
});

test('"Add a dive site" carries what was typed', async () => {
  await render();
  await type('  New Reef ');
  const [button] = root.root.findAllByType(OceanButton);
  expect(button.props.title).toBe('Can’t find it? Add a dive site');
  await act(async () => button.props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/add-site', params: { then: 'log', name: 'New Reef' } });
});

test('the OpenStreetMap credit is under the list only when imported sites are in it', async () => {
  const credits = () => root.root.findAllByType('extlink');
  await render({ sites: generateSites(30, 'osm-node-') });
  expect(credits()).toHaveLength(1);
  expect(credits()[0].props.href).toBe('https://www.openstreetmap.org/copyright');
  expect(credits()[0].props.children).toBe('Dive sites © OpenStreetMap contributors');
  await act(async () => root.unmount());
  await render({ sites: generateSites(30) });
  expect(credits()).toHaveLength(0);
});
