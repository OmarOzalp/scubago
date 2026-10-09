import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { MOMENT_TIMING, useDiscoveryMoments } from '../use-discovery-moments';

// My Home is focused for as long as the probe is mounted.
jest.mock('expo-router', () => ({ useFocusEffect: (callback) => require('react').useEffect(callback, [callback]) }));

const OWNER = 'uid-1';
const KEY = `scubago:discoveries:v1:${OWNER}`;
let n = 0;
const sighting = (speciesId, createdAt) => ({
  id: `s-${++n}`, userId: OWNER, username: 'alice', speciesId, siteId: 'yongala', sightedOn: createdAt.slice(0, 10),
  isDemo: false, synced: true, createdAt,
});
const entry = (id) => ({ species: CATALOG_BY_ID.get(id), count: 1, firstSeenOn: '2026-09-01', firstSeenSiteId: 'yongala', lastSeenOn: '2026-09-01' });
const levelFor = (count) => (count >= 3 ? 2 : 1);

let moments;
function Probe({ report, ...options }) {
  report(useDiscoveryMoments(options));
  return null;
}
const props = (sightings) => {
  const ids = [...new Set(sightings.map((s) => s.speciesId))];
  return {
    owner: OWNER, ready: true, sightings, residents: ids.map(entry), level: levelFor(ids.length), animate: true,
    report: (value) => { moments = value; },
  };
};
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function wait(ms) { await act(async () => { jest.advanceTimersByTime(ms); }); await flush(); }
/** Open My Home with this log; a diver's first record is written straight after. */
async function open(log) {
  await act(async () => { root = create(<Probe {...props(log)} />); });
  await flush();
  await wait(0);
}
const stored = async () => JSON.parse(await AsyncStorage.getItem(KEY));

let root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  await AsyncStorage.clear();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});

test('the first time, what the diver already has is taken as read: nothing plays', async () => {
  const log = [sighting('reef-manta', '2026-08-01T10:00:00.000Z')];
  await open(log);
  await wait(MOMENT_TIMING.settle + 100);
  expect(moments).toMatchObject({ now: null, banner: null, busy: false, level: 1, featured: [], waiting: [] });
  expect((await stored()).introduced).toEqual(['reef-manta']);
});

test('a new species arrives once, with its "New" tag, then is never replayed', async () => {
  const old = [sighting('reef-manta', '2026-08-01T10:00:00.000Z')];
  await open(old);
  // Logged after this device started keeping track.
  const log = [...old, sighting('whale-shark', new Date(Date.now() + 1000).toISOString())];
  await act(async () => root.update(<Probe {...props(log)} />));
  expect(moments.waiting).toEqual(['whale-shark']); // out of sight until its turn
  expect(moments.featured).toEqual(['whale-shark']); // a place on the island, whatever the page
  await wait(MOMENT_TIMING.settle + 50);
  expect(moments.now).toBe('whale-shark');
  expect(moments.tag).toEqual({ speciesId: 'whale-shark', label: 'Whale Shark' });
  expect(moments.busy).toBe(true);
  // The scene reports it has swum in; the tag stays a few seconds, then goes.
  await act(async () => moments.onArrived('whale-shark'));
  await wait(MOMENT_TIMING.tag - 100);
  expect(moments.tag).not.toBeNull();
  await wait(200);
  expect(moments.tag).toBeNull();
  expect((await stored()).introduced).toEqual(['reef-manta', 'whale-shark']);
  await wait(MOMENT_TIMING.gap + 50);
  expect(moments.busy).toBe(false);
  expect(moments.featured).toEqual(['whale-shark']); // kept for the rest of the visit, so the scene doesn't restart

  // Reopening My Home: nothing is owed any more.
  await act(async () => root.unmount());
  await open(log);
  await wait(MOMENT_TIMING.settle + 100);
  expect(moments).toMatchObject({ now: null, banner: null, busy: false, featured: [], waiting: [] });
});

test('a discovery that levels up the island plays the banner and the growth first, then the arrival', async () => {
  const old = [sighting('reef-manta', '2026-08-01T10:00:00.000Z'), sighting('whale-shark', '2026-08-02T10:00:00.000Z')];
  await open(old);
  const log = [...old, sighting('green-turtle', new Date(Date.now() + 1000).toISOString())];
  await act(async () => root.update(<Probe {...props(log)} />));
  // Until the level-up plays, the island stays as it was.
  expect(moments.level).toBe(1);
  await wait(MOMENT_TIMING.settle + 50);
  expect(moments.banner).toEqual({ level: 2, reward: 'A coral garden', visible: true });
  expect(moments.level).toBe(1);
  expect(moments.now).toBeNull(); // one thing at a time
  await wait(MOMENT_TIMING.banner);
  expect(moments.level).toBe(2); // the island grows, the banner still up
  expect(moments.banner.visible).toBe(true);
  await wait(MOMENT_TIMING.grow);
  expect(moments.banner.visible).toBe(false);
  expect((await stored()).level).toBe(2);
  await wait(MOMENT_TIMING.gap + 50);
  expect(moments.now).toBe('green-turtle');
});

test('deleting the discovering sighting before My Home was seen cancels the arrival', async () => {
  const old = [sighting('reef-manta', '2026-08-01T10:00:00.000Z')];
  await open(old);
  const added = [...old, sighting('whale-shark', new Date(Date.now() + 1000).toISOString())];
  await act(async () => root.update(<Probe {...props(added)} />));
  expect(moments.waiting).toEqual(['whale-shark']);
  await act(async () => root.update(<Probe {...props(old)} />));
  await wait(MOMENT_TIMING.settle + 100);
  expect(moments).toMatchObject({ now: null, busy: false, featured: [], waiting: [] });
});
