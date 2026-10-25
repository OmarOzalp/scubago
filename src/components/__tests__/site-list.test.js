import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SiteList, siteWhere } from '../site-list';
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
beforeEach(async () => { global.IS_REACT_ACT_ENVIRONMENT = true; await AsyncStorage.clear(); });
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

test('on the web the map is this list, with a short note that closes for good', async () => {
  const sites = generateSites(40, 'gen-');
  const render = async () => { await act(async () => { root = create(<SiteMap sites={sites} highlightedSiteIds={null} onSelectSite={() => {}} onLongPress={() => {}} />); }); };
  await render();
  expect(text()).toContain('The map is in the iOS and Android apps.');
  expect(rows().length).toBeGreaterThan(5);
  const close = root.root.findAll((n) => n.props.accessibilityLabel === 'Close this note' && typeof n.props.onPress === 'function')[0];
  expect(StyleSheet.flatten(close.props.style({ pressed: false })).height).toBeGreaterThanOrEqual(44);
  await act(async () => close.props.onPress());
  expect(text()).not.toContain('iOS and Android');
  // Never again: a page that opens later finds it closed.
  await act(async () => root.unmount());
  await render();
  expect(text()).not.toContain('iOS and Android');
  expect(rows().length).toBeGreaterThan(5);
});

test('a row says the broad region and the country, and the whole region only where two sites share a name', async () => {
  expect(siteWhere('Marsa Alam & the south, Red Sea', 'Egypt')).toBe('Red Sea, Egypt');
  expect(siteWhere('Marsa Alam & the south, Red Sea', 'Egypt', true)).toBe('Marsa Alam & the south, Red Sea, Egypt');
  expect(siteWhere('Andaman Sea', 'Thailand')).toBe('Andaman Sea, Thailand');
  expect(siteWhere('Egypt', 'Egypt')).toBe('Egypt');
  const site = (id, name, region, country) => ({ id, name, region, country, lat: 0, lng: 0, blurb: '', notableSpecies: [], source: 'seed' });
  const sites = [
    site('a', 'Abu Dabab', 'Marsa Alam & the south, Red Sea', 'Egypt'),
    site('b', 'Cod Hole', 'Cairns/Cooktown, Great Barrier Reef', 'Australia'),
    site('c', 'Cod Hole', 'Sinai, Red Sea', 'Egypt'),
  ];
  await act(async () => { root = create(<SiteList sites={sites} highlightedSiteIds={null} onSelectSite={() => {}} />); });
  const shown = text();
  expect(shown).toContain('Abu Dabab | Red Sea, Egypt');
  expect(shown).toContain('Cod Hole | Cairns/Cooktown, Great Barrier Reef, Australia');
  expect(shown).toContain('Cod Hole | Sinai, Red Sea, Egypt');
  // A screen reader always hears the whole of it.
  expect(rows().map((r) => r.props.accessibilityLabel)[0]).toBe('Abu Dabab, Marsa Alam & the south, Red Sea, Egypt');
});

test('the OpenStreetMap credit is a link 44 points tall under the list, with its wording as the licence has it', async () => {
  await act(async () => { root = create(<SiteList sites={generateSites(30, 'osm-way-')} highlightedSiteIds={null} onSelectSite={() => {}} />); });
  const link = root.root.findAllByType('extlink')[0];
  const box = StyleSheet.flatten(link.props.style);
  expect(box.lineHeight + 2 * box.paddingVertical).toBeGreaterThanOrEqual(44);
  expect(link.props.children).toBe('Dive sites © OpenStreetMap contributors');
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
