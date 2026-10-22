import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { act } from 'react';
import { Modal } from 'react-native';
import { create } from 'react-test-renderer';

import SpeciesDetailScreen from '@/app/species/[id]';
import { DiscoveryCard } from '@/components/share/discovery-card';
import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { writeCachedSightings } from '@/lib/external-sightings/cache';

// The species page's rarity line, the "Recorded near dive sites" section and the discovery card's
// note. EVERY count and record below is HAND-WRITTEN to exercise the code: none of it is iNaturalist
// or OBIS data, and it is passed in through a stand-in for realRarityEntry, never written to
// src/data/real-rarity.json (which is empty, because the live services have not been reached).

let mockSpeciesId = 'reef-manta';
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: mockSpeciesId }),
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
  Stack: { Screen: () => null },
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
let mockSightings = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ sightings: mockSightings, user: null, deleteSpeciesLog: jest.fn() }),
  useAllSites: () => require('@/data/sites').SITES,
  useMyUserId: () => 'local',
}));
// Stand-in "real data": only reef-manta has a tier worked out from counts, and only when a test sets it.
let mockEntry;
jest.mock('@/lib/real-rarity', () => ({
  ...jest.requireActual('@/lib/real-rarity'),
  realRarityEntry: (id) => (id === 'reef-manta' ? mockEntry : undefined),
}));

const HAND_WRITTEN_ENTRY = {
  inaturalist: { observations: 2314, observers: 1102 },
  obis: { records: 845 },
  score: 2.1,
  tier: 'rare',
};
const OWN_ESTIMATE = 'Rarity is ScubaGo’s own estimate for now.';
const RANKED = 'Rare, ranked from 2,314 iNaturalist observations by 1,102 observers and 845 OBIS records worldwide';
const NOTE = 'Ranked Rare from 2,314 iNaturalist observations worldwide';

const sighting = (id, over = {}) => ({
  id, userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: SITES[0].id, sightedOn: '2026-03-01', isDemo: false, synced: true, createdAt: '2026-03-01T10:00:00Z', ...over,
});
const summaryFor = (siteId, species) => ({
  siteId,
  radiusKm: 3,
  fetchedAt: '2026-10-20T08:00:00.000Z',
  sources: [
    { id: 'inaturalist', ok: true, fetchedAt: '2026-10-20T08:00:00.000Z', attribution: 'Observations by iNaturalist observers (inaturalist.org)', licenceNote: 'n', url: 'https://www.inaturalist.org/observations?lat=1&lng=2' },
    { id: 'obis', ok: true, fetchedAt: '2026-10-20T08:00:00.000Z', attribution: 'OBIS and its data providers (obis.org)', licenceNote: 'n', url: 'https://obis.org' },
  ],
  species,
  recent: [],
  unmatched: { inaturalist: 0, obis: 0 },
});

let root;
let fetchSpy;
const originalFetch = global.fetch;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockSpeciesId = 'reef-manta';
  mockEntry = undefined;
  mockSightings = [];
  router.push.mockClear();
  await AsyncStorage.clear();
  fetchSpy = jest.fn(async () => {
    throw new Error('the species page must not use the network');
  });
  global.fetch = fetchSpy;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  global.fetch = originalFetch;
});

const render = async () => {
  await act(async () => {
    root = create(<SpeciesDetailScreen />);
  });
};
const textOf = () => root.root.findAll((n) => typeof n.type === 'string' && n.children.some((c) => typeof c === 'string')).map((n) => n.children.filter((c) => typeof c === 'string').join('')).join(' | ');
const press = (label) => root.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && (typeof label === 'string' ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel ?? '')));
const shareButton = () => root.root.findAll((n) => n.props.accessibilityHint === 'Shows a picture of this discovery to share' && typeof n.props.onPress === 'function');
const openShare = async () => {
  await act(async () => shareButton()[0].props.onPress());
  expect(root.root.findAllByType(Modal)).toHaveLength(1);
  return root.root.findAllByType(DiscoveryCard);
};

describe('the rarity line', () => {
  test('without real data it says the tier is ScubaGo’s own estimate, with no numbers and no link', async () => {
    await render();
    const text = textOf();
    expect(text).toContain(OWN_ESTIMATE);
    expect(text).not.toMatch(/ranked from/i);
    // The line itself holds no digits.
    expect(OWN_ESTIMATE).not.toMatch(/\d/);
    // The chip still shows the hand-assigned tier, as before.
    expect(text).toContain(CATALOG_BY_ID.get('reef-manta').rarity.replace(/^./, (c) => c.toUpperCase()));
    expect(press(/Data and credits$/).filter((n) => n.props.accessibilityLabel.includes('ranked'))).toHaveLength(0);
  });

  test('with real data it gives the tier, the counts with thousands separators, and a link to Data & credits', async () => {
    mockEntry = HAND_WRITTEN_ENTRY;
    await render();
    const text = textOf();
    expect(text).toContain(RANKED);
    expect(text).not.toContain(OWN_ESTIMATE);
    expect(text).toContain('A ranking among ScubaGo’s animals, not a promise of seeing one.');

    const [link] = press(/^Rare, ranked from 2,314/);
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityLabel).toContain('Data and credits');
    await act(async () => link.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/credits');
  });

  test('sits under the names and the rarity chip, before the description', async () => {
    mockEntry = HAND_WRITTEN_ENTRY;
    await render();
    const text = textOf();
    const species = CATALOG_BY_ID.get('reef-manta');
    expect(text.indexOf(species.scientificName)).toBeGreaterThan(-1);
    expect(text.indexOf(RANKED)).toBeGreaterThan(text.indexOf(species.scientificName));
    expect(text.indexOf(RANKED)).toBeLessThan(text.indexOf(species.blurb));
  });

  test('another species with no data still says its tier is an estimate', async () => {
    mockEntry = HAND_WRITTEN_ENTRY;
    mockSpeciesId = 'whale-shark';
    await render();
    expect(textOf()).toContain(OWN_ESTIMATE);
    expect(textOf()).not.toContain(RANKED);
  });
});

describe('the discovery card’s note', () => {
  test('is passed when the species has a real tier, and shown on the card', async () => {
    mockEntry = HAND_WRITTEN_ENTRY;
    mockSightings = [sighting('a')];
    await render();
    const [card] = await openShare();
    expect(card.props.observedNote).toBe(NOTE);
    expect(NOTE.length).toBeLessThanOrEqual(60);
    expect(textOf()).toContain(NOTE);
  });

  test('is not passed without data', async () => {
    mockSightings = [sighting('a')];
    await render();
    const [card] = await openShare();
    expect(card).toBeDefined();
    expect(card.props.observedNote).toBeUndefined();
    expect(textOf()).not.toMatch(/Ranked .* from/);
  });

  test('is not passed for a species that has no data of its own', async () => {
    mockEntry = HAND_WRITTEN_ENTRY;
    mockSpeciesId = 'whale-shark';
    mockSightings = [sighting('a', { speciesId: 'whale-shark' })];
    await render();
    const [card] = await openShare();
    expect(card.props.observedNote).toBeUndefined();
  });
});

describe('"Recorded near dive sites" on the page', () => {
  test('with nothing saved on the phone it invites opening a dive site, and credits nothing', async () => {
    await render();
    const text = textOf();
    expect(text).toContain('Recorded near dive sites');
    expect(text).toContain('Not your sightings, and not checked by ScubaGo');
    expect(text).toContain('Open a dive site’s page to see what’s been recorded there.');
    expect(text).not.toContain('Data & credits');
  });

  test('lists the saved sites that record this animal, and opens one', async () => {
    const [first, second] = SITES;
    await writeCachedSightings(summaryFor(first.id, [{ speciesId: 'reef-manta', inaturalist: { observations: 38, lastObservedOn: '2026-09-30' }, obis: { records: 12 } }]));
    await writeCachedSightings(summaryFor(second.id, [{ speciesId: 'whale-shark', inaturalist: { observations: 9 } }]));
    await render();
    const text = textOf();
    expect(text).toContain('Recorded near 1 of the 2 sites you’ve opened');
    expect(text).toContain(first.name);
    expect(text).toContain('38 iNaturalist observations | 12 OBIS records');
    expect(text).toMatch(/Newest on file: .*2026/);
    expect(text).toContain('Data & credits');

    await act(async () => press(new RegExp(`^${first.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`))[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith(`/site/${first.id}`);
  });

  test('comes after the diver’s own sightings of it, and keeps them apart', async () => {
    mockSightings = [sighting('a')];
    await writeCachedSightings(summaryFor(SITES[1].id, [{ speciesId: 'reef-manta', inaturalist: { observations: 3 } }]));
    await render();
    const text = textOf();
    expect(text.indexOf('Where it’s been seen')).toBeGreaterThan(-1);
    expect(text.indexOf('Recorded near dive sites')).toBeGreaterThan(text.indexOf('Where it’s been seen'));
    expect(text.indexOf('Delete my Reef Manta Ray log')).toBeGreaterThan(text.indexOf('Recorded near dive sites'));
  });

  test('never uses the network, with or without saved records', async () => {
    await render();
    await act(async () => root.unmount());
    root = null;
    await writeCachedSightings(summaryFor(SITES[0].id, [{ speciesId: 'reef-manta', inaturalist: { observations: 1 } }]));
    mockEntry = HAND_WRITTEN_ENTRY;
    await render();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
