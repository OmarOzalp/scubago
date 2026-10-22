import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { FlatList } from 'react-native';
import { create } from 'react-test-renderer';
import { SiteList } from '../site-list';
import { SiteMap } from '../site-map.web';
import { PaperButton } from '@/components/journal/paper';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));

/** Generated here, never added to the app's data. */
const generateSites = (count, prefix) =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`, name: `Site ${String(i).padStart(3, '0')}`, region: i % 2 ? 'Dahab, Red Sea' : 'Cairns, Great Barrier Reef', country: i % 2 ? 'Egypt' : 'Australia',
    lat: i / 10, lng: i / 5, blurb: '', notableSpecies: [], source: 'seed',
  }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const rows = () => root.root.findAllByType(PaperButton);
const text = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join('')).join(' | ');

test('a list of 600 sites builds only the rows near the top, and says how many there are', async () => {
  const sites = generateSites(600, 'gen-');
  await act(async () => { root = create(<SiteList sites={sites} highlightedSiteIds={null} onSelectSite={() => {}} />); });
  expect(rows().length).toBeGreaterThan(5);
  expect(rows().length).toBeLessThanOrEqual(24);
  expect(text()).toContain('600 sites');
  const list = root.root.findByType(FlatList).props;
  expect(list.data).toHaveLength(600);
  expect(list.windowSize).toBeLessThan(21);
  expect(list.keyExtractor(sites[5])).toBe('gen-5');
});

test('a species filter shows only the sites where it is seen, and a row opens its site', async () => {
  const sites = generateSites(600, 'gen-');
  const onSelectSite = jest.fn();
  const seen = new Set(['gen-4', 'gen-7', 'gen-598']);
  await act(async () => { root = create(<SiteList sites={sites} highlightedSiteIds={seen} onSelectSite={onSelectSite} />); });
  expect(rows().map((r) => r.props.accessibilityLabel)).toEqual([
    'Site 004, Cairns, Great Barrier Reef, Australia', 'Site 007, Dahab, Red Sea, Egypt', 'Site 598, Cairns, Great Barrier Reef, Australia',
  ]);
  await act(async () => rows()[1].props.onPress());
  expect(onSelectSite).toHaveBeenCalledWith('gen-7');
  await act(async () => root.update(<SiteList sites={sites} highlightedSiteIds={new Set()} onSelectSite={onSelectSite} />));
  expect(text()).toContain('No dive sites to show for this species yet.');
});

test('on the web the map is this list, with its note', async () => {
  const sites = generateSites(40, 'gen-');
  await act(async () => { root = create(<SiteMap sites={sites} highlightedSiteIds={null} onSelectSite={() => {}} onLongPress={() => {}} />); });
  expect(text()).toContain('The dive map is available in the iOS and Android apps');
  expect(rows().length).toBeGreaterThan(5);
});

test('the OpenStreetMap credit sits under the list, as a link, only when imported sites are in it', async () => {
  const credits = () => root.root.findAllByType('extlink');
  await act(async () => { root = create(<SiteList sites={generateSites(30, 'osm-way-')} highlightedSiteIds={null} onSelectSite={() => {}} />); });
  expect(credits()).toHaveLength(1);
  expect(credits()[0].props.href).toBe('https://www.openstreetmap.org/copyright');
  expect(credits()[0].props.children).toBe('Dive sites © OpenStreetMap contributors');
  await act(async () => root.unmount());
  await act(async () => { root = create(<SiteList sites={generateSites(30, 'gen-')} highlightedSiteIds={null} onSelectSite={() => {}} />); });
  expect(credits()).toHaveLength(0);
});
