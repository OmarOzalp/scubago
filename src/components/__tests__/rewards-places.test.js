import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { CollectionCard, collectionLabel } from '@/components/rewards/collection-card';
import { CollectionDetailView } from '@/components/rewards/collection-detail';
import { CollectionsView } from '@/components/rewards/collections-view';
import { islandLabel } from '@/components/rewards/island-card';
import { IslandsView } from '@/components/rewards/islands-view';
import { NewBadgesBanner, NewBadgesCelebration, newBadgesSummary } from '@/components/rewards/new-badges';
import { PassportPage, PassportView, sitesLine } from '@/components/rewards/passport-view';
import { stampLabel, stampLook } from '@/components/rewards/site-stamp';
import { summarize, badgesLine, collectionsLine } from '@/components/rewards/summary';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { SITES } from '@/data/sites';
import { evaluateRewards } from '@/lib/rewards';

// These tests pin the rewards engine's own rules against the catalogue's hand-assigned tiers, so they must
// not move when src/data/encounter-rarity.json is regenerated: the generated tiers are switched off here.
jest.mock('@/data/encounter-rarity.json', () => ({ generatedAt: null, species: {} }));

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
// The engraved plates and the island pictures are drawn from code and take most of the time of a render
// (a collections page is a couple of hundred plates); their own tests cover them, so these tests only
// need a box where each one goes (a `plate` that says whose it is and whether it is painted).
jest.mock('@/components/species-art', () => ({ SpeciesArt: ({ species, found }) => require('react').createElement('plate', { id: species.id, found }) }));
jest.mock('@/components/home/island-art', () => ({ IslandArt: () => null }));
// Reduced motion: things appear in place. The ring and bar only need the hooks to exist.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => true,
  useSharedValue: (v) => ({ get: () => v, set: () => {} }),
  useAnimatedProps: () => ({}),
  withDelay: (_, v) => v,
  withTiming: (v) => v,
  default: { View: require('react-native').View, createAnimatedComponent: (C) => C },
}));

// A small hand-written log: real catalogue species and seed sites, nobody's real log.
const seen = (speciesId, siteId, sightedOn) => ({
  id: `${speciesId}@${sightedOn}@${siteId}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const dived = (number, siteId, divedOn) => ({ id: `dive-${number}`, userId: 'me', number, siteId, divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z` });
const sites = new Map(SITES.map((s) => [s.id, s]));
const logbook = {
  sightings: [
    seen('grey-reef-shark', 'shark-yolanda', '2026-03-12'), seen('whitetip-reef-shark', 'shark-yolanda', '2026-03-12'),
    seen('blacktip-reef-shark', 'yongala', '2026-04-02'), seen('green-turtle', 'yongala', '2026-04-02'), seen('reef-manta', 'manta-sandy', '2026-05-09'),
  ],
  dives: [dived(1, 'shark-yolanda', '2026-03-12'), dived(2, 'yongala', '2026-04-02'), dived(3, 'yongala', '2026-06-01'), dived(4, 'manta-sandy', '2026-05-09')],
  sites, catalog: CATALOG_BY_ID,
};
const rewards = evaluateRewards(logbook);
const empty = evaluateRewards({ sightings: [], dives: [], sites, catalog: CATALOG_BY_ID });
const flat = (n) => (typeof n === 'string' ? n : n.children.map(flat).join(''));
const textOf = (r) => r.root.findAll((n) => n.type === 'Text').map(flat).join(' | ');
const labelsOf = (r) => r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel);

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('the passport has a page for each place, a stamp for each site visited, and "3 of 41 sites" for how many are left', async () => {
  const onOpenSite = jest.fn();
  await act(async () => { root = create(<PassportView groups={rewards.passport} onOpenSite={onOpenSite} />); });
  const text = textOf(root);
  // The place visited most recently is the first page.
  expect(rewards.passport.map((g) => g.name)).toEqual(['Great Barrier Reef', 'Indonesia', 'Red Sea']);
  for (const name of ['Great Barrier Reef', 'Red Sea', 'Indonesia']) expect(text).toContain(name);
  expect(text).toContain('PASSPORT · PAGE 1');
  expect(text).toContain('PASSPORT · PAGE 3');
  const yongala = rewards.passport[0].stamps.find((s) => s.siteId === 'yongala');
  expect(yongala.visits).toBe(2);
  expect(labelsOf(root)).toContain('SS Yongala. First visited 2 April 2026, 2 visits.');
  expect(text).toContain('SS YONGALA');
  expect(text).toContain('02 APR 2026');
  expect(text).toContain('2 VISITS');
  // The number of sites in the place comes from the lookup, not from what was visited.
  const reef = rewards.passport[0];
  expect(sitesLine(reef)).toBe(`1 of ${reef.knownSites} sites`);
  expect(reef.knownSites).toBeGreaterThan(1);
  expect(text).toContain(`1 of ${reef.knownSites} sites`);
  // A stamp opens its site.
  const stamp = root.root.find((n) => n.props.accessibilityLabel === 'Manta Sandy. First visited 9 May 2026, 1 visit.' && typeof n.props.onPress === 'function');
  expect(stamp.props.accessibilityRole).toBe('link');
  await act(async () => stamp.props.onPress());
  expect(onOpenSite).toHaveBeenCalledWith('manta-sandy');
});

test('a stamp is the same every time for the same site, and only says what the engine told it', () => {
  expect(stampLook('yongala')).toEqual(stampLook('yongala'));
  const look = stampLook('yongala');
  expect(Math.abs(look.rotate)).toBeLessThanOrEqual(9);
  expect(stampLabel({ siteName: 'Cod Hole', firstVisitedOn: '2026-03-14', visits: 1 })).toBe('Cod Hole. First visited 14 March 2026, 1 visit.');
});

test('a blank passport says so and offers to log a dive; a page with every site stamped says that too', async () => {
  const onLog = jest.fn();
  await act(async () => { root = create(<PassportView groups={empty.passport} onLog={onLog} />); });
  expect(textOf(root)).toContain('Your passport is blank');
  await act(async () => root.root.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').props.onPress());
  expect(onLog).toHaveBeenCalled();
  await act(async () => root.unmount());
  const full = { ...rewards.passport[0], knownSites: rewards.passport[0].stamps.length };
  await act(async () => { root = create(<PassportPage group={full} page={1} />); });
  expect(textOf(root)).toContain('Every site here is stamped.');
});

test('each island says whether it has risen, how many residents are found, and who to look for; a locked one says what raises it', async () => {
  const onOpenSpecies = jest.fn();
  await act(async () => { root = create(<IslandsView islands={rewards.islands} onOpenSpecies={onOpenSpecies} />); });
  const text = textOf(root);
  const labels = labelsOf(root);
  const kelp = rewards.islands.find((i) => i.id === 'kelp-forest');
  expect(kelp.unlocked).toBe(false);
  expect(islandLabel(kelp)).toMatch(/^Kelp Forest, locked\. Log any Kelp Forest animal, such as a Lingcod\. 0 of 14 residents found\.$/);
  expect(labels).toContain(islandLabel(kelp));
  expect(text).toContain('Locked');
  expect(text).toContain('Log any Kelp Forest animal, such as a Lingcod.');
  expect(text).toContain('Look for');
  const reef = rewards.islands.find((i) => i.id === 'coral-reef');
  expect(islandLabel(reef)).toContain('your home island');
  expect(text).toContain('Your home island');
  expect(text).toContain(`${reef.residentsFound} of ${reef.residentsTotal} residents found`);
  const mangroves = rewards.islands.find((i) => i.id === 'mangroves');
  expect(mangroves.unlocked).toBe(true);
  expect(text).toContain('Raised 02 APR 2026');
  // The raised islands come first; a plate to look for opens its species.
  const names = rewards.islands.filter((i) => i.unlocked).map((i) => i.name);
  expect(text.indexOf(names[names.length - 1])).toBeLessThan(text.indexOf('Kelp Forest'));
  const look = root.root.find((n) => n.props.accessibilityLabel === `${kelp.next[0].name}, ${kelp.next[0].rarity}, not seen yet` && typeof n.props.onPress === 'function');
  await act(async () => look.props.onPress());
  expect(onOpenSpecies).toHaveBeenCalledWith(kelp.next[0].speciesId);
});

test('a collection card shows how many are found and what is left, and its animals in the collection\'s own order', async () => {
  const sharks = rewards.collections.find((c) => c.id === 'family-shark');
  const onPress = jest.fn();
  await act(async () => { root = create(<CollectionCard collection={sharks} onPress={onPress} />); });
  expect(sharks.found).toBe(3);
  expect(collectionLabel(sharks)).toBe(`Sharks, 3 of ${sharks.total} found. ${sharks.hint}`);
  expect(labelsOf(root)).toContain(collectionLabel(sharks));
  expect(textOf(root)).toContain(`of ${sharks.total} found`);
  await act(async () => root.root.find((n) => n.props.accessibilityLabel === collectionLabel(sharks) && typeof n.props.onPress === 'function').props.onPress());
  expect(onPress).toHaveBeenCalled();
});

test('a card lays its animals out in the collection\'s order, the found ones painted and the missing ones in pencil', async () => {
  // Only the great hammerhead, the second of the pair, is logged: it stays second, painted, after the pencil scalloped.
  const hammerheads = evaluateRewards({ ...logbook, sightings: [...logbook.sightings, seen('great-hammerhead', 'yongala', '2026-06-02')] }).collections.find((c) => c.id === 'set-hammerheads');
  expect(hammerheads.memberIds).toEqual(['scalloped-hammerhead', 'great-hammerhead']);
  await act(async () => { root = create(<CollectionCard collection={hammerheads} />); });
  const plates = (r) => r.root.findAll((n) => n.type === 'plate').map((n) => [n.props.id, n.props.found]);
  expect(plates(root)).toEqual([['scalloped-hammerhead', false], ['great-hammerhead', true]]);
  await act(async () => root.unmount());

  // A set with its first animal found and the rest not: the order is the set's, not "found first".
  const mantas = rewards.collections.find((c) => c.id === 'set-mantas-and-devils');
  await act(async () => { root = create(<CollectionCard collection={mantas} />); });
  expect(plates(root)).toEqual(mantas.memberIds.map((id) => [id, id === 'reef-manta']));
  await act(async () => root.unmount());

  // A big collection shows the first of its members, in order, and says how many more.
  const reef = rewards.collections.find((c) => c.id === 'area-coral-reef');
  await act(async () => { root = create(<CollectionCard collection={reef} />); });
  expect(plates(root).map(([id]) => id)).toEqual(reef.memberIds.slice(0, 11));
  expect(textOf(root)).toContain(`+${reef.total - 11}`);
});

test('a finished collection says so with its day, a stamp and no "to go"', async () => {
  const done = evaluateRewards({
    ...logbook,
    sightings: [...logbook.sightings, seen('scalloped-hammerhead', 'shark-yolanda', '2026-06-02'), seen('great-hammerhead', 'yongala', '2026-06-03')],
  }).collections.find((c) => c.id === 'set-hammerheads');
  expect(done.completed).toBe(true);
  await act(async () => { root = create(<CollectionCard collection={done} />); });
  expect(textOf(root)).toContain('COMPLETE · 03 JUN 2026');
  expect(collectionLabel(done)).toBe('Hammerheads, complete, 3 June 2026');
});

test('the collections page groups the sets by kind; one in full lists what is found and what is still to find, each opening its species', async () => {
  await act(async () => { root = create(<CollectionsView collections={rewards.collections} />); });
  for (const title of ['Habitats', 'Families', 'Special sets']) expect(textOf(root)).toContain(title);
  await act(async () => root.unmount());

  const onOpenSpecies = jest.fn();
  const reefSharks = rewards.collections.find((c) => c.id === 'set-reef-sharks');
  await act(async () => { root = create(<CollectionDetailView collection={reefSharks} counts={new Map([['grey-reef-shark', 2]])} onOpenSpecies={onOpenSpecies} />); });
  const text = textOf(root);
  expect(text).toContain('Reef sharks');
  expect(text).toContain('3 of 3 found');
  expect(text).toContain('Completed 2 April 2026.');
  expect(labelsOf(root)).toContain('Grey Reef Shark, uncommon, seen 2 times');
  expect(text).not.toContain('Still to find');
  await act(async () => root.root.find((n) => n.props.accessibilityLabel === 'Grey Reef Shark, uncommon, seen 2 times' && typeof n.props.onPress === 'function').props.onPress());
  expect(onOpenSpecies).toHaveBeenCalledWith('grey-reef-shark');
  await act(async () => root.unmount());

  const mantas = rewards.collections.find((c) => c.id === 'set-mantas-and-devils');
  await act(async () => { root = create(<CollectionDetailView collection={mantas} counts={new Map()} />); });
  expect(textOf(root)).toContain('Still to find');
  expect(labelsOf(root).some((l) => /^Oceanic Manta Ray, .*not seen yet$/.test(l))).toBe(true);
  // The animals still to find keep the collection's order too.
  const toFind = [...new Set(labelsOf(root).filter((l) => /not seen yet$/.test(l)).map((l) => l.split(',')[0]))];
  expect(toFind).toEqual(['Oceanic Manta Ray', 'Munk’s Devil Ray']);
});

test('the entry points quote the real numbers, and nothing before there is a log to count', () => {
  const s = summarize(rewards);
  expect(s.earned).toBe(rewards.badges.filter((b) => b.earned).length);
  expect(badgesLine(s)).toBe(`${s.earned} of ${s.badges} badges · ${s.stamps} site stamps`);
  expect(badgesLine(summarize(empty))).toBe('Badges and site stamps start with your first dive');
  // Seven habitats, five families and four hand-picked sets (the Shipwreck's residents are one collection, not two).
  expect(empty.collections).toHaveLength(16);
  expect(collectionsLine(summarize(empty))).toMatch(/^16 collections to fill/);
  expect(collectionsLine({ ...s, complete: 2, collections: 16 })).toBe('2 of 16 complete');
});

test('new badges are celebrated by name and day, with a way to the rest, and nothing at all when there are none', async () => {
  const badge = (id) => rewards.badges.find((b) => b.id === id);
  const onOpenAll = jest.fn();
  await act(async () => { root = create(<NewBadgesBanner badges={[badge('first-shark')]} onOpenAll={onOpenAll} />); });
  expect(newBadgesSummary([badge('first-shark')])).toBe('New badge: First shark. Earned 12 March 2026.');
  expect(textOf(root)).toContain('First shark');
  expect(textOf(root)).toContain('EARNED 12 MAR 2026');
  await act(async () => root.root.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').props.onPress());
  expect(onOpenAll).toHaveBeenCalled();
  await act(async () => root.unmount());

  const many = ['first-sighting', 'first-shark', 'first-turtle', 'dives-1', 'region-red-sea'].map(badge);
  await act(async () => { root = create(<NewBadgesBanner badges={many} />); });
  expect(textOf(root)).toContain('5 new badges');
  for (const title of ['First sighting', 'First shark', 'First turtle', 'First dive', 'Red Sea']) expect(textOf(root)).toContain(title);
  await act(async () => root.unmount());

  await act(async () => { root = create(<NewBadgesBanner badges={[]} />); });
  expect(root.toJSON()).toBeNull();
});

test('the celebration reports what it showed as seen once, and keeps showing it after that', async () => {
  const badge = (id) => rewards.badges.find((b) => b.id === id);
  const onSeen = jest.fn();
  await act(async () => { root = create(<NewBadgesCelebration fresh={[badge('first-shark')]} onSeen={onSeen} />); });
  expect(onSeen).toHaveBeenCalledTimes(1);
  expect(onSeen).toHaveBeenCalledWith(['first-shark']);
  // Once the badge is marked seen the diver's list of new ones empties: it stays on the page.
  await act(async () => root.update(<NewBadgesCelebration fresh={[]} onSeen={onSeen} />));
  expect(textOf(root)).toContain('First shark');
  expect(onSeen).toHaveBeenCalledTimes(1);
  // One that arrives later joins it.
  await act(async () => root.update(<NewBadgesCelebration fresh={[badge('first-turtle')]} onSeen={onSeen} />));
  expect(textOf(root)).toContain('2 new badges');
  expect(onSeen).toHaveBeenLastCalledWith(['first-turtle']);
});
