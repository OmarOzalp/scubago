import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { act, useEffect } from 'react';
import { create } from 'react-test-renderer';

import { evidencePhrases, recordedNearText, SITES_SHOWN, SpeciesRecords, SpeciesRecordsSection } from '@/components/sightings/species-records';
import { joinSiteRecords, recordsFromSummaries, useSpeciesRecords } from '@/hooks/use-species-records';
import { INATURALIST_CREDIT, OBIS_CREDIT } from '@/lib/external-sightings/attribution';
import { CACHE_INDEX_KEY, listCachedSiteIds, writeCachedSightings } from '@/lib/external-sightings/cache';

// EVERY site, summary and count in this file is HAND-WRITTEN to exercise the code. None of it is
// iNaturalist or OBIS data, and none of it is a real record of any animal anywhere.

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));

// ── Hand-written fixtures ────────────────────────────────────────────────────

const REEF = { id: 'reef', name: 'Test Reef', region: 'Nowhere Sea', country: 'Testland' };
const WALL = { id: 'wall', name: 'Test Wall', region: 'Elsewhere Sea', country: 'Fakeland' };
const SANDS = { id: 'sands', name: 'Test Sands', region: 'Nowhere Sea', country: 'Testland' };
const KNOWN_SITES = [REEF, WALL, SANDS];

const source = (id, ok = true) => ({
  id,
  ok,
  fetchedAt: '2026-10-20T08:00:00.000Z',
  attribution: id === 'inaturalist' ? INATURALIST_CREDIT.attribution : OBIS_CREDIT.attribution,
  licenceNote: 'n',
  url: id === 'inaturalist' ? 'https://www.inaturalist.org/observations?lat=1&lng=2' : 'https://obis.org',
});
const summary = (siteId, species = [], extra = {}) => ({
  siteId,
  radiusKm: 3,
  fetchedAt: '2026-10-20T08:00:00.000Z',
  sources: [source('inaturalist'), source('obis')],
  species,
  recent: [],
  unmatched: { inaturalist: 0, obis: 0 },
  ...extra,
});
const manta = (inatCount, obisRecords, lastObservedOn) => ({
  speciesId: 'reef-manta',
  ...(inatCount === undefined ? {} : { inaturalist: { observations: inatCount, ...(lastObservedOn ? { lastObservedOn } : {}) } }),
  ...(obisRecords === undefined ? {} : { obis: { records: obisRecords } }),
});
const turtle = { speciesId: 'green-turtle', inaturalist: { observations: 5 } };
const observation = (id, speciesId, observedOn) => ({
  source: 'inaturalist',
  observationId: id,
  speciesId,
  observedOn,
  observer: 'Test Observer',
  observerLogin: 'testobserver',
  url: `https://www.inaturalist.org/observations/${id}`,
  licence: 'cc-by',
  credit: '© Test Observer, CC BY 4.0 (iNaturalist)',
});

/** A row for the component, as the hook would give it. */
const row = (id, name, extra = {}) => ({ siteId: id, name, region: 'Nowhere Sea', country: 'Testland', radiusKm: 3, observations: 38, records: 12, ...extra });

// ── Helpers ──────────────────────────────────────────────────────────────────

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  router.push.mockClear();
  await AsyncStorage.clear();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

const textNodes = () => root.root.findAll((n) => typeof n.type === 'string' && n.children.some((c) => typeof c === 'string'));
const textOf = () => textNodes().map((n) => n.children.filter((c) => typeof c === 'string').join('')).join(' | ');
const labelOf = (n) => n.props.accessibilityLabel ?? n.findAll((c) => typeof c.children?.[0] === 'string' && typeof c.type === 'string').map((c) => c.children.join('')).join(' ');
const pressables = () => root.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string');
const press = (label) => pressables().filter((n) => (typeof label === 'string' ? labelOf(n) === label : label.test(labelOf(n))));
const headings = () => root.root.findAll((n) => n.props.accessibilityRole === 'header' && typeof n.type !== 'string').map((n) => textOfNode(n));
const textOfNode = (node) => node.findAll((c) => typeof c.type === 'string' && c.children.some((x) => typeof x === 'string')).map((c) => c.children.filter((x) => typeof x === 'string').join('')).join('');

const noop = () => {};
const view = (props) =>
  create(
    <SpeciesRecords status="ready" sites={[]} checked={0} speciesName="Reef Manta Ray" onOpenSite={noop} onOpenCredits={noop} {...props} />,
  );
const render = async (props) => {
  await act(async () => {
    root = view(props);
  });
};

// ── What each saved summary says ─────────────────────────────────────────────

describe('reading saved summaries for one species', () => {
  test('takes the counts of that species only, from both sources', () => {
    const [record] = recordsFromSummaries('reef-manta', [summary('reef', [turtle, manta(212, 38, '2026-09-30')])]);
    expect(record).toEqual({ siteId: 'reef', radiusKm: 3, answered: true, observations: 212, records: 38, newestOn: '2026-09-30' });
  });

  test('a species one source does not know has only the other source’s count', () => {
    const [onlyInat, onlyObis] = recordsFromSummaries('reef-manta', [summary('a', [manta(4)]), summary('b', [manta(undefined, 9)])]);
    expect(onlyInat.observations).toBe(4);
    expect(onlyInat.records).toBeUndefined();
    expect(onlyObis.records).toBe(9);
    expect(onlyObis.observations).toBeUndefined();
  });

  test('the newest day is the later of the evidence’s own and the recent observations of this animal; unreadable days are ignored', () => {
    const recent = [observation(1, 'reef-manta', '2026-10-02'), observation(2, 'green-turtle', '2026-10-19'), observation(3, 'reef-manta', 'last tuesday')];
    expect(recordsFromSummaries('reef-manta', [summary('a', [manta(3, undefined, '2026-09-01')], { recent })])[0].newestOn).toBe('2026-10-02');
    expect(recordsFromSummaries('reef-manta', [summary('a', [manta(3, undefined, '2026-11-01')], { recent })])[0].newestOn).toBe('2026-11-01');
    expect(recordsFromSummaries('reef-manta', [summary('a', [manta(3, 4)], { recent: [observation(3, 'reef-manta', 'last tuesday')] })])[0].newestOn).toBeUndefined();
  });

  test('a recent observation without counts for the animal does not make it recorded there', () => {
    const [record] = recordsFromSummaries('reef-manta', [summary('a', [turtle], { recent: [observation(1, 'reef-manta', '2026-10-02')] })]);
    expect(record.observations).toBeUndefined();
    expect(record.records).toBeUndefined();
    expect(record.newestOn).toBeUndefined();
  });

  test('zero, negative and non-numeric counts are not records', () => {
    const odd = { speciesId: 'reef-manta', inaturalist: { observations: 0 }, obis: { records: -2 } };
    const [record] = recordsFromSummaries('reef-manta', [summary('a', [odd])]);
    expect(record.observations).toBeUndefined();
    expect(record.records).toBeUndefined();
  });

  test('a summary no source answered for is not counted as having been looked through', () => {
    const failed = summary('a', [], { sources: [source('inaturalist', false), source('obis', false)] });
    expect(recordsFromSummaries('reef-manta', [failed])[0].answered).toBe(false);
    expect(recordsFromSummaries('reef-manta', [summary('a', [])])[0].answered).toBe(true);
  });
});

describe('matching summaries to dive sites', () => {
  test('keeps the sites that record the animal, most observations first, then most OBIS records, then name', () => {
    const records = recordsFromSummaries('reef-manta', [
      summary('sands', [manta(7, 1)]),
      summary('reef', [manta(7, 20)]),
      summary('wall', [manta(100)]),
    ]);
    const { sites, checked } = joinSiteRecords(records, KNOWN_SITES);
    expect(sites.map((s) => s.name)).toEqual(['Test Wall', 'Test Reef', 'Test Sands']);
    expect(checked).toBe(3);
    expect(sites[1]).toMatchObject({ siteId: 'reef', region: 'Nowhere Sea', country: 'Testland', radiusKm: 3, observations: 7, records: 20 });
  });

  test('counts the sites that were looked through, not only those that record the animal', () => {
    const records = recordsFromSummaries('reef-manta', [summary('reef', [manta(2)]), summary('wall', [turtle]), summary('sands', [])]);
    const { sites, checked } = joinSiteRecords(records, KNOWN_SITES);
    expect(sites.map((s) => s.siteId)).toEqual(['reef']);
    expect(checked).toBe(3);
  });

  test('leaves out a summary of a site that is no longer known: it can be neither named nor opened', () => {
    const records = recordsFromSummaries('reef-manta', [summary('gone', [manta(50, 50)]), summary('reef', [manta(1)])]);
    const { sites, checked } = joinSiteRecords(records, KNOWN_SITES);
    expect(sites.map((s) => s.siteId)).toEqual(['reef']);
    expect(checked).toBe(1);
  });
});

describe('listCachedSiteIds', () => {
  test('lists the sites that have a saved summary, and is empty for an empty cache', async () => {
    expect(await listCachedSiteIds()).toEqual([]);
    await writeCachedSightings(summary('reef', []));
    await writeCachedSightings(summary('wall', []));
    expect(await listCachedSiteIds()).toEqual(['reef', 'wall']);
  });

  test('rebuilds the list from the stored keys when the index is lost, and does not touch the network', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      throw new Error('no network here');
    });
    try {
      await writeCachedSightings(summary('wall', []));
      await writeCachedSightings(summary('reef', []));
      await AsyncStorage.removeItem(CACHE_INDEX_KEY);
      expect(await listCachedSiteIds()).toEqual(['reef', 'wall']);
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ── The hook ─────────────────────────────────────────────────────────────────

describe('useSpeciesRecords', () => {
  let latest;
  const seen = [];
  function Harness({ speciesId = 'reef-manta', sites = KNOWN_SITES, read }) {
    const value = useSpeciesRecords(speciesId, sites, read ? { read } : {});
    useEffect(() => {
      latest = value;
      seen.push(value.status);
    });
    return null;
  }
  const mount = async (props) => {
    seen.length = 0;
    await act(async () => {
      root = create(<Harness {...props} />);
    });
  };
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  test('is loading until the saved summaries are read, then ready with the sites that record the animal', async () => {
    const gate = deferred();
    await mount({ read: () => gate.promise });
    expect(latest).toEqual({ status: 'loading', sites: [], checked: 0 });

    await act(async () => gate.resolve([summary('reef', [manta(38, 12, '2026-09-30')]), summary('wall', [turtle])]));
    expect(latest.status).toBe('ready');
    expect(latest.sites).toHaveLength(1);
    expect(latest.sites[0]).toMatchObject({ siteId: 'reef', name: 'Test Reef', observations: 38, records: 12, newestOn: '2026-09-30' });
    expect(latest.checked).toBe(2);
  });

  test('is empty, having looked at nothing, when no site page has been opened', async () => {
    await mount({ read: async () => [] });
    expect(latest).toEqual({ status: 'empty', sites: [], checked: 0 });
  });

  test('is empty, having looked at the sites that were opened, when none records the animal', async () => {
    await mount({ read: async () => [summary('reef', [turtle]), summary('wall', [])] });
    expect(latest).toEqual({ status: 'empty', sites: [], checked: 2 });
  });

  test.each([
    ['rejects', () => Promise.reject(new Error('disk gone'))],
    ['throws', () => {
      throw new Error('disk gone');
    }],
    ['returns something that is not a list of summaries', async () => 'nonsense'],
    ['returns a damaged summary', async () => [{ siteId: 'reef' }]],
  ])('reports an error, and does not throw, when the cache read %s', async (_name, read) => {
    await mount({ read });
    expect(latest).toEqual({ status: 'error', sites: [], checked: 0 });
  });

  test('reads the real cache: the sites whose pages were opened, and nothing from the network', async () => {
    const fetchSpy = jest.fn(async () => {
      throw new Error('the species page must not use the network');
    });
    const originalFetch = global.fetch;
    global.fetch = fetchSpy;
    try {
      await writeCachedSightings(summary('reef', [manta(38, 12, '2026-09-30')]));
      await writeCachedSightings(summary('wall', [turtle]));
      await writeCachedSightings(summary('sands', [manta(2)]));
      await mount({});
      expect(latest.status).toBe('ready');
      expect(latest.sites.map((s) => s.siteId)).toEqual(['reef', 'sands']);
      expect(latest.checked).toBe(3);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('is empty with a real, empty cache', async () => {
    await mount({});
    expect(latest).toEqual({ status: 'empty', sites: [], checked: 0 });
  });

  test('does not throw when the phone’s storage cannot be read: it reports nothing saved', async () => {
    // The AsyncStorage stand-in is made of mock functions: put each one's own behaviour back afterwards.
    const originals = { getItem: AsyncStorage.getItem.getMockImplementation(), getAllKeys: AsyncStorage.getAllKeys.getMockImplementation() };
    AsyncStorage.getItem.mockImplementation(async () => {
      throw new Error('storage unavailable');
    });
    AsyncStorage.getAllKeys.mockImplementation(async () => {
      throw new Error('storage unavailable');
    });
    try {
      await mount({});
      expect(latest).toEqual({ status: 'empty', sites: [], checked: 0 });
    } finally {
      AsyncStorage.getItem.mockImplementation(originals.getItem);
      AsyncStorage.getAllKeys.mockImplementation(originals.getAllKeys);
    }
  });

  test('a read that finishes after the screen has gone is dropped', async () => {
    const gate = deferred();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await mount({ read: () => gate.promise });
    const rendersBefore = seen.length;
    await act(async () => root.unmount());
    root = null;
    await act(async () => gate.resolve([summary('reef', [manta(1)])]));
    expect(seen).toHaveLength(rendersBefore);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  test('a late answer for the previous animal never replaces the current animal’s', async () => {
    const first = deferred();
    const second = deferred();
    const reads = [first, second];
    let call = 0;
    const read = () => reads[call++].promise;
    await mount({ speciesId: 'reef-manta', read });
    await act(async () => {
      root.update(<Harness speciesId="green-turtle" read={read} />);
    });
    expect(latest.status).toBe('loading');

    await act(async () => second.resolve([summary('wall', [turtle])]));
    expect(latest.status).toBe('ready');
    expect(latest.sites.map((s) => s.siteId)).toEqual(['wall']);

    // The first read was cancelled: its answer, whenever it comes, changes nothing.
    await act(async () => first.resolve([summary('reef', [manta(99)])]));
    expect(latest.sites.map((s) => s.siteId)).toEqual(['wall']);
  });

  test('keeps showing what it had while it reads again', async () => {
    const readTwice = deferred();
    await mount({ read: async () => [summary('reef', [manta(5)])] });
    expect(latest.status).toBe('ready');
    seen.length = 0;
    await act(async () => {
      root.update(<Harness read={() => readTwice.promise} />);
    });
    expect(latest.status).toBe('ready');
    expect(seen).not.toContain('loading');

    await act(async () => readTwice.resolve([summary('reef', [manta(5)]), summary('wall', [manta(9)])]));
    expect(latest.sites.map((s) => s.siteId)).toEqual(['wall', 'reef']);
  });

  test('picks up a site that becomes known after the cache was read', async () => {
    await mount({ sites: [REEF], read: async () => [summary('reef', [manta(5)]), summary('wall', [manta(9)])] });
    expect(latest.sites.map((s) => s.siteId)).toEqual(['reef']);
    await act(async () => {
      root.update(<Harness sites={[REEF, WALL]} read={root.root.findByType(Harness).props.read} />);
    });
    expect(latest.sites.map((s) => s.siteId)).toEqual(['wall', 'reef']);
  });

  test('without an animal it has nothing to look for', async () => {
    await mount({ speciesId: '', read: async () => [summary('reef', [manta(5)])] });
    expect(latest).toEqual({ status: 'empty', sites: [], checked: 0 });
  });
});

// ── The section ──────────────────────────────────────────────────────────────

describe('SpeciesRecords, ready', () => {
  const sites = [
    row('reef', 'Test Reef', { newestOn: '2026-09-30' }),
    row('wall', 'Test Wall', { region: 'Elsewhere Sea', country: 'Fakeland', observations: 1, records: undefined, radiusKm: 5 }),
    row('sands', 'Test Sands', { observations: undefined, records: 1 }),
  ];

  test('says what these are before it shows any, and names the sources', async () => {
    await render({ sites, checked: 5 });
    const text = textOf();
    expect(text).toContain('Public records');
    expect(text).toContain('Recorded near dive sites');
    expect(text).toContain('saved on this phone');
    expect(text).toContain('dive sites you’ve already opened');
    expect(text).toContain('Opening more site pages adds more');
    expect(text).toContain('Not your sightings, and not checked by ScubaGo');
    expect(text).toContain('Records of Reef Manta Ray');
  });

  test('shows each site with its place, evidence per source, search radius and newest date', async () => {
    await render({ sites, checked: 5 });
    const text = textOf();
    expect(text).toContain('Test Reef');
    expect(text).toContain('Nowhere Sea, Testland');
    // One line per source, so a count never breaks across two lines.
    // (These fixtures were searched with different radii, so each row says its own.)
    expect(text).toContain('38 iNaturalist observations | 12 OBIS records | Within 3 km (OBIS: 6 km square) | Newest on file:');
    expect(text).toContain('| Within 5 km (OBIS: 10 km square) |');
    expect(text).toMatch(/Newest on file: .*2026/);
    // One is "observation" and "record", and a site one source does not record names only the other.
    expect(text).toContain('| 1 iNaturalist observation |');
    expect(text).not.toContain('1 iNaturalist observations');
    expect(text).toContain('| 1 OBIS record |');
    expect(text).not.toContain('1 OBIS records');
    expect(text).toContain('Elsewhere Sea, Fakeland');
    // A site without a date says nothing about one.
    expect(text.match(/Newest on file/g)).toHaveLength(1);
  });

  test('says the search radius once when every site used the same one, and on each row when they differ', async () => {
    await render({ sites: [row('a', 'Site A'), row('b', 'Site B')], checked: 2 });
    expect(textOf()).toContain('Counts are iNaturalist records within 3 km of each site, and OBIS records in a 6 km square around it.');
    expect(textOf()).not.toMatch(/\| Within \d/);
    await act(async () => root.unmount());
    root = null;

    await render({ sites: [row('a', 'Site A'), row('b', 'Site B', { radiusKm: 5 }), row('c', 'Site C', { radiusKm: 0.5 })], checked: 3 });
    const text = textOf();
    expect(text).not.toContain('Counts are iNaturalist records within');
    expect(text).toContain('| Within 3 km (OBIS: 6 km square) |');
    expect(text).toContain('| Within 5 km (OBIS: 10 km square) |');
    expect(text).toContain('| Within 0.5 km (OBIS: 1 km square) |');
  });

  test('says how many of the sites that were opened record it', async () => {
    await render({ sites, checked: 5 });
    expect(textOf()).toContain('Recorded near 3 of the 5 sites you’ve opened');
    expect(headings()).toEqual(expect.arrayContaining(['Recorded near dive sites', 'Recorded near 3 of the 5 sites you’ve opened']));
  });

  test('credits the sources that appear, linking to Data & credits', async () => {
    const onOpenCredits = jest.fn();
    await render({ sites, checked: 5, onOpenCredits });
    const text = textOf();
    expect(text).toContain(INATURALIST_CREDIT.attribution);
    expect(text).toContain(OBIS_CREDIT.attribution);
    expect(text).toContain('Data & credits');
    const [link] = press(/Data and credits$/);
    expect(link.props.accessibilityRole).toBe('link');
    await act(async () => link.props.onPress());
    expect(onOpenCredits).toHaveBeenCalledTimes(1);
  });

  test('credits only the source that appears', async () => {
    await render({ sites: [row('wall', 'Test Wall', { records: undefined })], checked: 1 });
    expect(textOf()).toContain(INATURALIST_CREDIT.attribution);
    expect(textOf()).not.toContain(OBIS_CREDIT.attribution);
  });

  test('a row opens that dive site', async () => {
    const onOpenSite = jest.fn();
    await render({ sites, checked: 5, onOpenSite });
    const [open] = press(/^Test Reef, Nowhere Sea, Testland, 38 iNaturalist observations, 12 OBIS records, within 3 km, OBIS in a 6 km square, newest on file .*2026/);
    expect(open.props.accessibilityRole).toBe('button');
    expect(open.props.accessibilityHint).toBe('Opens the dive site page');
    await act(async () => open.props.onPress());
    expect(onOpenSite).toHaveBeenCalledWith('reef');
  });

  test('every control has a role and a label, and is at least 44 points tall', async () => {
    await render({ sites: Array.from({ length: 8 }, (_, i) => row(`s${i}`, `Site ${i}`)), checked: 8 });
    const flat = (style) => (Array.isArray(style) ? style.flat(Infinity) : [style]).reduce((acc, s) => ({ ...acc, ...(s || {}) }), {});
    const controls = pressables();
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.props.accessibilityLabel).toBeTruthy();
      const style = flat(typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  test('a single site that was opened reads naturally', () => {
    expect(recordedNearText(1, 1)).toBe('Recorded near the 1 site you’ve opened');
    expect(recordedNearText(4, 4)).toBe('Recorded near all 4 sites you’ve opened');
    expect(recordedNearText(2, 9)).toBe('Recorded near 2 of the 9 sites you’ve opened');
  });
});

describe('SpeciesRecords, many sites', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => row(`s${i}`, `Site ${String(i).padStart(2, '0')}`));
  const shownNames = () => textOf().match(/Site \d\d/g) ?? [];

  test(`shows ${SITES_SHOWN} and "Show all N", and all of them once asked`, async () => {
    expect(SITES_SHOWN).toBe(6);
    await render({ sites: many(9), checked: 9 });
    expect(shownNames()).toEqual(['Site 00', 'Site 01', 'Site 02', 'Site 03', 'Site 04', 'Site 05']);
    const [more] = press('Show all 9 dive sites');
    expect(more.props.accessibilityState).toEqual({ expanded: false });
    await act(async () => more.props.onPress());
    expect(shownNames()).toHaveLength(9);
    const [fewer] = press('Show fewer dive sites');
    expect(fewer.props.accessibilityState).toEqual({ expanded: true });
    await act(async () => fewer.props.onPress());
    expect(shownNames()).toHaveLength(6);
  });

  test('has no "Show all" for six or fewer', async () => {
    await render({ sites: many(6), checked: 6 });
    expect(shownNames()).toHaveLength(6);
    expect(press(/^Show all/)).toHaveLength(0);
  });
});

describe('SpeciesRecords, no records to show', () => {
  test('nothing saved yet: invites opening a dive site, and credits and counts nothing', async () => {
    await render({ status: 'empty', sites: [], checked: 0 });
    const text = textOf();
    expect(text).toContain('Open a dive site’s page to see what’s been recorded there.');
    expect(text).toContain('Recorded near dive sites');
    expect(text).toContain('Not your sightings, and not checked by ScubaGo');
    expect(text).not.toContain('Data & credits');
    expect(text).not.toMatch(/Recorded near (all|the|\d)/);
    expect(text).not.toMatch(/iNaturalist observation/);
    expect(pressables()).toHaveLength(0);
  });

  test('sites were opened but none records it: says so without claiming it is not there', async () => {
    await render({ status: 'empty', sites: [], checked: 3 });
    const text = textOf();
    expect(text).toContain('No public records of Reef Manta Ray at the 3 dive sites you’ve opened.');
    expect(text).toContain('Not finding one here doesn’t mean it isn’t there.');
    expect(text).not.toContain('Open a dive site’s page');
    await act(async () => root.unmount());
    root = null;
    await render({ status: 'empty', sites: [], checked: 1 });
    expect(textOf()).toContain('at the 1 dive site you’ve opened.');
  });

  test('the saved records could not be read: says so, shows no list and no credit', async () => {
    await render({ status: 'error', sites: [], checked: 0 });
    const text = textOf();
    expect(text).toContain('Couldn’t read the public records saved on this phone just now.');
    expect(text).not.toContain('Data & credits');
    expect(text).not.toContain('Open a dive site’s page');
  });

  test('loading: a quiet busy placeholder, and nothing counted', async () => {
    await render({ status: 'loading', sites: [], checked: 0 });
    const busy = root.root.findAll((n) => n.props.accessibilityLabel === 'Checking the public records saved on this phone' && typeof n.type === 'string');
    expect(busy.length).toBeGreaterThan(0);
    const text = textOf();
    expect(text).toContain('Checking the records saved on this phone…');
    expect(text).not.toContain('Data & credits');
    expect(text).not.toMatch(/Recorded near (all|the|\d)/);
  });
});

describe('evidencePhrases', () => {
  test('one phrase per source that has records', () => {
    expect(evidencePhrases({ observations: 38, records: 12 })).toEqual(['38 iNaturalist observations', '12 OBIS records']);
    expect(evidencePhrases({ observations: 1_234 })).toEqual(['1,234 iNaturalist observations']);
    expect(evidencePhrases({ records: 1 })).toEqual(['1 OBIS record']);
    expect(evidencePhrases({})).toEqual([]);
  });
});

describe('SpeciesRecordsSection (the connected one)', () => {
  const species = { id: 'reef-manta', commonName: 'Reef Manta Ray' };

  test('reads the saved summaries and opens a site and the credits page', async () => {
    await writeCachedSightings(summary('reef', [manta(38, 12, '2026-09-30')]));
    await writeCachedSightings(summary('wall', [turtle]));
    await act(async () => {
      root = create(<SpeciesRecordsSection species={species} sites={KNOWN_SITES} />);
    });
    const text = textOf();
    expect(text).toContain('Test Reef');
    expect(text).not.toContain('Test Wall');
    expect(text).toContain('Recorded near 1 of the 2 sites you’ve opened');

    await act(async () => press(/^Test Reef,/)[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/site/reef');
    await act(async () => press(/Data and credits$/)[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/credits');
  });

  test('with an empty cache it invites opening a dive site', async () => {
    await act(async () => {
      root = create(<SpeciesRecordsSection species={species} sites={KNOWN_SITES} />);
    });
    expect(textOf()).toContain('Open a dive site’s page to see what’s been recorded there.');
  });
});
