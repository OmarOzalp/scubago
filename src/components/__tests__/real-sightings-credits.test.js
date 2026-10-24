import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { openBrowserAsync } from 'expo-web-browser';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import CreditsScreen from '@/app/credits';
import { OBIS_CITATION, OBIS_CREDIT, INATURALIST_CREDIT } from '@/lib/external-sightings/attribution';

jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' },
}));

let root;
const textOf = () => root.root.findAll((n) => typeof n.children?.[0] === 'string' && typeof n.type === 'string').map((n) => n.children.join('')).join(' | ');
const link = (label) => root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);

beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; openBrowserAsync.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('credits: the ODbL line for OpenStreetMap, with its copyright page one tap away', async () => {
  await act(async () => { root = create(<CreditsScreen />); });
  const text = textOf();
  expect(text).toContain('Data & credits');
  expect(text).toContain('Dive site locations © OpenStreetMap contributors, available under the Open Database License (ODbL).');

  const [copyright] = link('OpenStreetMap copyright and licence');
  await act(async () => copyright.props.onPress());
  expect(openBrowserAsync).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright', expect.anything());
});

test('credits: iNaturalist and its observers, the CC0 / CC BY rule, and OBIS with its citation', async () => {
  await act(async () => { root = create(<CreditsScreen />); });
  const text = textOf();
  expect(text).toContain('iNaturalist and its observers');
  expect(text).toContain(INATURALIST_CREDIT.description);
  expect(text).toMatch(/licensed it CC0 or CC BY/);
  expect(text).toContain('Individual observations and photos: CC0 or CC BY only.');
  expect(text).toContain('OBIS and its data providers');
  expect(text).toContain(OBIS_CREDIT.description);
  expect(text).toContain(OBIS_CITATION);
  expect(link('CC0 1.0 Universal (public domain dedication)')).toHaveLength(1);
  expect(link('Creative Commons Attribution 4.0 International')).toHaveLength(1);
  expect(link('iNaturalist terms of use')).toHaveLength(1);
});

// What it says is held true by species-photos.test.ts: every photo is CC0, CC BY or CC BY-SA.
test('credits: species photographs are open to any use with credit, each credited and linked', async () => {
  await act(async () => { root = create(<CreditsScreen />); });
  const text = textOf();
  expect(text).toContain('Species photographs');
  expect(text).toMatch(/licences that allow any use with credit \(CC0, CC BY or CC BY-SA\)/);
  expect(text).toMatch(/credited to its photographer/);
  expect(text).toMatch(/opens the photo on iNaturalist, where its licence is stated/);
});

test('credits: every link opens a secure page, and each is a labelled link', async () => {
  await act(async () => { root = create(<CreditsScreen />); });
  const links = root.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function');
  expect(links.length).toBeGreaterThanOrEqual(10);
  for (const l of links) {
    expect(l.props.accessibilityLabel).toBeTruthy();
    await act(async () => l.props.onPress());
  }
  expect(openBrowserAsync.mock.calls.length).toBe(links.length);
  for (const [url] of openBrowserAsync.mock.calls) expect(url).toMatch(/^https:\/\//);
});
