import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { openBrowserAsync } from 'expo-web-browser';
import { router } from 'expo-router';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import { agoText, daysSince } from '@/components/sightings/format';
import { SiteSightingsSection } from '@/components/sightings/site-sightings-section';
import { INATURALIST_CREDIT, OBIS_CREDIT } from '@/lib/external-sightings/attribution';

jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => false, default: { View: require('react-native').View } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' },
}));
jest.mock('expo-image', () => {
  const React = require('react');
  return { Image: (props) => React.createElement('ExpoImage', props) };
});
// The data layer is covered by its own tests: here the hook says what the screen should draw.
let mockHook = { summary: null, status: 'loading', refresh: jest.fn() };
jest.mock('@/hooks/use-site-sightings', () => ({ useSiteSightings: () => mockHook }));

const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const day = (days) => ago(days).slice(0, 10);
const EXPLORE = 'https://www.inaturalist.org/observations?lat=-19.3&lng=147.6&radius=3&quality_grade=research&verifiable=true';

const site = (notableSpecies = ['green-turtle']) => ({ id: 'reef', name: 'Test Reef', lat: -19.3, lng: 147.6, region: 'Nowhere', country: 'Testland', blurb: '', notableSpecies, source: 'seed' });
const source = (id, fetchedAt, extra = {}) => ({
  id,
  ok: true,
  fetchedAt,
  attribution: id === 'inaturalist' ? INATURALIST_CREDIT.attribution : OBIS_CREDIT.attribution,
  licenceNote: 'n',
  url: id === 'inaturalist' ? EXPLORE : 'https://obis.org',
  ...extra,
});
const observation = (id, speciesId, extra = {}) => ({
  source: 'inaturalist',
  observationId: id,
  speciesId,
  observedOn: day(5),
  observer: `Observer ${id}`,
  observerLogin: `obs${id}`,
  url: `https://www.inaturalist.org/observations/${id}`,
  licence: 'cc-by',
  credit: `© Observer ${id}, CC BY 4.0 (iNaturalist)`,
  ...extra,
});
const summary = (extra = {}) => ({
  siteId: 'reef',
  radiusKm: 3,
  fetchedAt: ago(0),
  sources: [source('inaturalist', ago(0)), source('obis', ago(0))],
  species: [
    { speciesId: 'reef-manta', inaturalist: { observations: 212, lastObservedOn: day(5) }, obis: { records: 38 } },
    { speciesId: 'green-turtle', inaturalist: { observations: 1 } },
    { speciesId: 'whale-shark', obis: { records: 1 } },
  ],
  recent: [
    observation(11, 'reef-manta', { distanceKm: 2, photo: { url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/11/medium.jpg', licence: 'cc-by', attribution: '(c) Observer 11, some rights reserved (CC BY)' } }),
    observation(12, 'green-turtle', { locationObscured: true, licence: 'cc0', credit: 'Observer 12, CC0 (iNaturalist)' }),
  ],
  unmatched: { inaturalist: 0, obis: 0 },
  ...extra,
});

let root;
const render = async (hook, notableSpecies) => {
  mockHook = { refresh: jest.fn(), ...hook };
  await act(async () => { root = create(<SiteSightingsSection site={site(notableSpecies)} />); });
};
const textOf = () => root.root.findAll((n) => typeof n.children?.[0] === 'string' && typeof n.type === 'string').map((n) => n.children.join('')).join(' | ');
// A pressable is found by its accessibility label, or by its own text when it has none (a button's title).
const labelOf = (n) => n.props.accessibilityLabel ?? n.findAll((c) => typeof c.children?.[0] === 'string' && typeof c.type === 'string').map((c) => c.children.join('')).join(' ');
const press = (label) => root.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.type !== 'string' && (typeof label === 'string' ? labelOf(n) === label : label.test(labelOf(n))));

beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; router.push.mockClear(); openBrowserAsync.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('ready: names the animals with their evidence, labels the records as public and not ScubaGo sightings, and credits both sources', async () => {
  await render({ summary: summary(), status: 'ready' });
  const text = textOf();

  expect(text).toContain('Marine life recorded here');
  expect(text).toMatch(/Not ScubaGo sightings, and not checked by ScubaGo/);
  expect(text).toContain('Reef Manta Ray');
  expect(text).toContain('212 iNaturalist observations');
  expect(text).toContain('38 records in OBIS datasets');
  // One record is "record", not "records", and an animal only one source knows names only that source.
  expect(text).toContain('1 iNaturalist observation |');
  expect(text).not.toContain('1 iNaturalist observations');
  expect(text).toContain('1 record in OBIS datasets');
  expect(text).toMatch(/Newest on file: .*20\d\d/);
  expect(text).toContain(INATURALIST_CREDIT.attribution);
  expect(text).toContain(OBIS_CREDIT.attribution);
  expect(text).toContain('Updated today');
  // No coordinate is part of what is drawn.
  expect(text).not.toMatch(/-?\d+\.\d{3,}/);
});

test('says how far the records reach: a circle for iNaturalist, a square for OBIS', async () => {
  await render({ summary: summary(), status: 'ready' });
  const text = textOf();
  // OBIS is asked for a box whose half-side is the radius (geo.ts), so its corners reach further than 3 km.
  expect(text).toContain('Records from iNaturalist observers within 3 km of this site, and from OBIS scientific datasets in a 6 km square around it.');
  expect(text).not.toContain('within about');
});

test('a species row opens that species page', async () => {
  await render({ summary: summary(), status: 'ready' });
  const [row] = press(/^Reef Manta Ray, 212 iNaturalist observations, 38 records in OBIS datasets/);
  await act(async () => row.props.onPress());
  expect(router.push).toHaveBeenCalledWith('/species/reef-manta');
});

test('recent observations: credit, date, "within N km", photo with its credit, and a link to iNaturalist', async () => {
  await render({ summary: summary(), status: 'ready' });
  const text = textOf();

  expect(text).toContain('© Observer 11, CC BY 4.0 (iNaturalist)');
  expect(text).toMatch(/Observed .*20\d\d · within 2 km/);
  expect(text).toContain('Photo: (c) Observer 11, some rights reserved (CC BY)');
  const photos = root.root.findAll((n) => n.type === 'ExpoImage');
  expect(photos).toHaveLength(1);
  expect(photos[0].props.source.uri).toContain('/photos/11/');

  // The obscured one carries its credit but no distance.
  expect(text).toContain('Observer 12, CC0 (iNaturalist)');
  const [obscured] = press(/^Green Sea Turtle, observed/);
  expect(obscured.props.accessibilityLabel).not.toMatch(/within/);
  expect(text.match(/· within \d+ km/g)).toHaveLength(1);

  const [first] = press(/^Reef Manta Ray, observed/);
  await act(async () => first.props.onPress());
  expect(openBrowserAsync).toHaveBeenCalledWith('https://www.inaturalist.org/observations/11', expect.anything());
});

test('a photo that is not served securely is not drawn, and takes no credit line with it', async () => {
  const bad = observation(21, 'reef-manta', { distanceKm: 1, photo: { url: 'http://example.test/p.jpg', licence: 'cc-by', attribution: '(c) Someone (CC BY)' } });
  await render({ summary: summary({ recent: [bad] }), status: 'ready' });
  expect(root.root.findAll((n) => n.type === 'ExpoImage')).toHaveLength(0);
  expect(textOf()).not.toContain('Photo:');
});

test('"See more on iNaturalist" opens the same area on iNaturalist, and the footer opens the credits screen', async () => {
  await render({ summary: summary(), status: 'ready' });
  const [more] = press('See more on iNaturalist');
  await act(async () => more.props.onPress());
  expect(openBrowserAsync).toHaveBeenCalledWith(EXPLORE, expect.anything());

  const [credits] = press(/Data and credits$/);
  await act(async () => credits.props.onPress());
  expect(router.push).toHaveBeenCalledWith('/credits');
});

test('only the first eight animals show until "Show all"', async () => {
  const ids = ['reef-manta', 'green-turtle', 'whale-shark', 'blacktip-reef-shark', 'whitetip-reef-shark', 'napoleon-wrasse', 'hawksbill-turtle', 'clownfish', 'clown-triggerfish', 'nurse-shark', 'tiger-shark'];
  const many = ids.map((speciesId, i) => ({ speciesId, inaturalist: { observations: 100 - i } }));
  await render({ summary: summary({ species: many, recent: [] }), status: 'ready' });
  expect(textOf()).toContain('Animals recorded nearby · 11');
  expect(textOf()).not.toContain('Tiger Shark');
  expect(textOf()).toContain('Show all 11');

  const [showAll] = press('Show all 11 species');
  await act(async () => showAll.props.onPress());
  expect(textOf()).toContain('Tiger Shark');
  expect(textOf()).toContain('Show fewer');
});

test('loading: a quiet placeholder, no records and no retry', async () => {
  await render({ summary: null, status: 'loading' });
  const text = textOf();
  expect(text).toContain('Looking up public records…');
  expect(text).not.toContain('Reef Manta Ray');
  expect(press('Try again')).toHaveLength(0);
  const busy = root.root.findAll((n) => n.props.accessibilityState?.busy === true);
  expect(busy.length).toBeGreaterThan(0);
});

test('stale: the old copy shows with how old it is, while a newer one loads', async () => {
  await render({ summary: summary({ fetchedAt: ago(9), sources: [source('inaturalist', ago(9)), source('obis', ago(9))] }), status: 'stale' });
  expect(textOf()).toContain('Updated 9 days ago · refreshing…');
  expect(textOf()).toContain('Reef Manta Ray');
});

test('offline with a saved copy: it is shown with a note, and "Try again" refreshes', async () => {
  const refresh = jest.fn();
  await render({ summary: summary({ fetchedAt: ago(3), sources: [source('inaturalist', ago(3)), source('obis', ago(3))] }), status: 'offline', refresh });
  const text = textOf();
  expect(text).toContain('You’re offline. Showing records saved 3 days ago.');
  expect(text).toContain('Reef Manta Ray');
  const [retry] = press('Try again');
  await act(async () => retry.props.onPress());
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('an error with a saved copy says the refresh failed, not that the diver is offline', async () => {
  await render({ summary: summary(), status: 'error' });
  expect(textOf()).toContain('Couldn’t refresh the public records. Showing records saved today.');
  expect(textOf()).not.toContain('offline');
});

test('offline with nothing saved: a friendly line, no records, and a way to try again', async () => {
  const refresh = jest.fn();
  await render({ summary: null, status: 'offline', refresh });
  const text = textOf();
  expect(text).toContain('Couldn’t reach the public records right now.');
  expect(text).toContain('You seem to be offline.');
  expect(text).not.toContain('Reef Manta Ray');
  // Nothing is on show, so nothing is credited or counted.
  expect(text).not.toContain(INATURALIST_CREDIT.attribution);
  expect(press('See more on iNaturalist')).toHaveLength(0);
  const [retry] = press('Try again');
  await act(async () => retry.props.onPress());
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('empty: says there are no records within the radius, and does not offer a retry', async () => {
  await render({ summary: summary({ species: [], recent: [] }), status: 'ready' });
  expect(textOf()).toContain('No public records of catalogue species within 3 km yet.');
  expect(press('Try again')).toHaveLength(0);
});

test('a site with no species list says so when there are no records either', async () => {
  await render({ summary: summary({ species: [], recent: [] }), status: 'ready' }, []);
  expect(textOf()).toContain('ScubaGo has no species list for this site yet either.');
});

test('a source that did not answer is named, never counted as "no records"', async () => {
  const partial = summary({
    sources: [source('inaturalist', ago(0)), source('obis', ago(0), { ok: false, error: 'timeout' })],
    species: [],
    recent: [],
  });
  await render({ summary: partial, status: 'ready' });
  const text = textOf();
  expect(text).toContain('OBIS couldn’t be reached, so its records aren’t included.');
  expect(text).toContain('No records of catalogue species from iNaturalist within 3 km yet.');
  expect(text).not.toContain('No public records of catalogue species');
  // Only the source that answered is credited.
  expect(text).toContain(INATURALIST_CREDIT.attribution);
  expect(text).not.toContain(OBIS_CREDIT.attribution);
});

test('a source that kept old data says how old, and a cut-off list says it may be missing animals', async () => {
  const old = summary({
    sources: [source('inaturalist', ago(0), { truncated: true }), source('obis', ago(6), { error: 'offline' })],
  });
  await render({ summary: old, status: 'ready' });
  const text = textOf();
  expect(text).toContain('OBIS couldn’t be refreshed just now. Its records are from 6 days ago.');
  expect(text).toContain('iNaturalist has more species here than ScubaGo reads at once');
  // The page is as old as its oldest source.
  expect(text).toContain('Updated 6 days ago');
});

test('"today" and "yesterday" are days on the diver\'s calendar, not 24-hour windows', () => {
  // Local times, so the test means the same in every time zone.
  const at = (date, hour) => new Date(2026, 9, date, hour).getTime();
  const iso = (date, hour) => new Date(at(date, hour)).toISOString();
  const now = at(22, 9);
  const said = (date, hour) => agoText(daysSince(iso(date, hour), now));
  expect(said(22, 1)).toBe('today');
  expect(said(21, 22)).toBe('yesterday');
  expect(said(21, 1)).toBe('yesterday');
  expect(said(20, 10)).toBe('2 days ago');
  // A clock a little ahead of this phone's is not "in the future".
  expect(said(22, 11)).toBe('today');
  expect(daysSince('never', now)).toBeUndefined();
});

test('open-licence recent observations missing: the counts stay and the gap is explained', async () => {
  await render({ summary: summary({ recent: [] }), status: 'ready' });
  expect(textOf()).toContain('none recent that are openly licensed for ScubaGo to show');
});

test('recent observations that could not be loaded are not said to be none openly licensed', async () => {
  const inat = source('inaturalist', ago(0), { error: 'Recent observations: iNaturalist is busy (HTTP 429). Try again later.', recentFailed: true });
  await render({ summary: summary({ recent: [], sources: [inat, source('obis', ago(0))] }), status: 'ready' });
  const text = textOf();
  expect(text).toContain('Recent observations couldn’t be loaded.');
  expect(text).not.toContain('openly licensed for ScubaGo to show');
  // The counts that did come are still there.
  expect(text).toContain('212 iNaturalist observations');
});

test('records that are not in the catalogue, or whose link is not iNaturalist, are never drawn', async () => {
  const odd = summary({
    species: [{ speciesId: 'not-a-real-animal', inaturalist: { observations: 99 } }, { speciesId: 'reef-manta', inaturalist: { observations: 5 } }],
    recent: [observation(31, 'not-a-real-animal'), observation(32, 'reef-manta', { url: 'https://example.test/phish' }), observation(33, 'reef-manta', { observedOn: 'yesterday' })],
  });
  await render({ summary: odd, status: 'ready' });
  const text = textOf();
  expect(text).not.toContain('not-a-real-animal');
  expect(text).not.toContain('99 iNaturalist');
  expect(text).not.toContain('Observer 31');
  expect(text).not.toContain('Observer 32');
  expect(text).not.toContain('Observer 33');
  expect(text).toContain('5 iNaturalist observations');
});

test('a site with no coordinates yet (hook idle) draws nothing', async () => {
  await render({ summary: null, status: 'idle' });
  expect(textOf()).toBe('');
});
