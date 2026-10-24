import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { SITES } from '@/data/sites';
import { evaluateBadges } from '@/lib/rewards';
import { claimSeenBadges, parseSeen, seenKey } from '@/lib/badges-seen';
import { useNewBadges } from '../use-new-badges';

// The store, as the hook reads it: by default the diver's log has come down from the server.
let mockStore;
jest.mock('@/lib/store', () => ({
  LOCAL_USER_ID: 'local',
  useAppStore: (select) => select(mockStore),
}));

const sites = new Map(SITES.map((s) => [s.id, s]));
const seen = (speciesId, siteId, sightedOn) => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const badgesFor = (sightings, dives = []) => evaluateBadges({ sightings, dives, sites, catalog: CATALOG_BY_ID });
const shark = seen('grey-reef-shark', 'shark-yolanda', '2026-03-12');
// On the same site, so it earns nothing but the turtle.
const turtle = seen('green-turtle', 'shark-yolanda', '2026-04-02');
const earnedIds = (list) => ids(list.filter((b) => b.earned));
const ids = (list) => list.map((b) => b.id);

let latest;
const report = (value) => { latest = value; };
function Probe(props) {
  report(useNewBadges(props));
  return null;
}
const KEY = seenKey('me');
const stored = async () => JSON.parse(await AsyncStorage.getItem(KEY));
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
let root;
async function show(props) {
  await act(async () => { root = create(<Probe {...props} />); });
  await flush();
}
async function update(props) {
  await act(async () => root.update(<Probe {...props} />));
  await flush();
}

beforeEach(async () => { global.IS_REACT_ACT_ENVIRONMENT = true; mockStore = { pulledFor: 'me', syncing: false }; await AsyncStorage.clear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.restoreAllMocks(); });

test('the record is kept per diver, in a form that reads back', () => {
  expect(seenKey('uid-1')).toBe('scubago:badges-seen:v1:uid-1');
  expect(seenKey('local')).not.toBe(seenKey('uid-1'));
  expect(parseSeen(JSON.stringify({ v: 1, ids: ['a', 'b'] }))).toEqual(['a', 'b']);
  for (const bad of [null, '', 'nope', '{}', '{"ids":"a"}', '{"ids":[1]}']) expect(parseSeen(bad)).toBeNull();
});

test('the first time, what is already earned is taken as seen quietly and nothing is celebrated', async () => {
  const badges = badgesFor([shark, turtle]);
  await show({ owner: 'me', badges, ready: true });
  expect(latest.loaded).toBe(true);
  expect(latest.fresh).toEqual([]);
  expect((await stored()).ids).toEqual(ids(badges.filter((b) => b.earned)));
});

test('a badge earned afterwards is new until it is marked seen, and then stays seen', async () => {
  await show({ owner: 'me', badges: badgesFor([shark]), ready: true });
  expect(latest.fresh).toEqual([]);

  const after = badgesFor([shark, turtle]);
  await update({ owner: 'me', badges: after, ready: true });
  expect(ids(latest.fresh)).toEqual(['first-turtle']);
  // It is not written down as seen until the screen says so.
  expect((await stored()).ids).not.toContain('first-turtle');

  await act(async () => latest.markSeen());
  await flush();
  expect(latest.fresh).toEqual([]);
  expect((await stored()).ids).toContain('first-turtle');

  // Leaving and coming back does not celebrate it again.
  await act(async () => root.unmount());
  await show({ owner: 'me', badges: after, ready: true });
  expect(latest.fresh).toEqual([]);
});

test('with a record already, only what is not in it is celebrated, in the engine\'s order', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: ['first-sighting'] }));
  const badges = badgesFor([shark, turtle]);
  await show({ owner: 'me', badges, ready: true });
  expect(ids(latest.fresh)).toEqual(ids(badges.filter((b) => b.earned && b.id !== 'first-sighting')));
  expect(ids(latest.fresh)).toEqual(expect.arrayContaining(['first-shark', 'first-turtle']));
});

test('markSeen can be told which badges it has shown, and leaves the rest waiting', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: [] }));
  await show({ owner: 'me', badges: badgesFor([shark, turtle]), ready: true });
  expect(ids(latest.fresh)).toContain('first-turtle');
  await act(async () => latest.markSeen(['first-turtle']));
  await flush();
  expect(ids(latest.fresh)).not.toContain('first-turtle');
  expect(ids(latest.fresh)).toContain('first-shark');
});

test('a badge the diver has seen stays seen even if a later evaluation no longer earns it', async () => {
  const remembered = [...earnedIds(badgesFor([shark])), 'first-turtle'];
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: remembered }));
  await show({ owner: 'me', badges: badgesFor([shark]), ready: true });
  expect(latest.fresh).toEqual([]);
  await act(async () => latest.markSeen());
  await flush();
  expect((await stored()).ids).toEqual(remembered);
  // Earning it again is not news.
  await update({ owner: 'me', badges: badgesFor([shark, turtle]), ready: true });
  expect(latest.fresh).toEqual([]);
});

test('nothing is read or written until the log has loaded, so an empty log is never taken for the diver\'s', async () => {
  await show({ owner: 'me', badges: badgesFor([]), ready: false });
  expect(latest.loaded).toBe(false);
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
  // The log arrives: the record is made from what it holds.
  await update({ owner: 'me', badges: badgesFor([shark, turtle]), ready: true });
  expect(latest.fresh).toEqual([]);
  expect((await stored()).ids).toContain('first-turtle');
});

test('each diver has their own record', async () => {
  await show({ owner: 'me', badges: badgesFor([shark]), ready: true });
  expect(await AsyncStorage.getItem(seenKey('someone'))).toBeNull();
  mockStore = { pulledFor: 'someone', syncing: false };
  await update({ owner: 'someone', badges: badgesFor([shark]), ready: true });
  expect(await AsyncStorage.getItem(seenKey('someone'))).not.toBeNull();
});

test('on a new phone, a signed-in diver\'s history coming down from the server is not celebrated', async () => {
  // The log on this phone has loaded (empty), and the first sync is still bringing the diver's down.
  mockStore = { syncing: true };
  await show({ owner: 'me', badges: badgesFor([]), ready: true });
  expect(latest.loaded).toBe(false);
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
  // The pull has landed, but its rows are in the store only once the sync has finished.
  mockStore = { pulledFor: 'me', syncing: true };
  await update({ owner: 'me', badges: badgesFor([]), ready: true });
  expect(latest.loaded).toBe(false);
  mockStore = { pulledFor: 'me', syncing: false };
  await update({ owner: 'me', badges: badgesFor([shark, turtle]), ready: true });
  expect(latest.loaded).toBe(true);
  expect(latest.fresh).toEqual([]);
  expect((await stored()).ids).toEqual(earnedIds(badgesFor([shark, turtle])));
});

test('a record already on the phone is used before any sync, and the device\'s own log never waits for one', async () => {
  mockStore = { syncing: true };
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: earnedIds(badgesFor([shark])) }));
  await show({ owner: 'me', badges: badgesFor([shark, turtle]), ready: true });
  expect(ids(latest.fresh)).toEqual(['first-turtle']);
  await update({ owner: 'local', badges: badgesFor([shark]), ready: true });
  expect(latest.loaded).toBe(true);
  expect(latest.fresh).toEqual([]);
});

test('signing in with a screen open: the badges celebrated before signing in are seen on it at once', async () => {
  const A = seenKey('uid-a');
  mockStore = { pulledFor: 'uid-a', syncing: false };
  await AsyncStorage.setItem(A, JSON.stringify({ v: 1, ids: earnedIds(badgesFor([shark])) }));
  await AsyncStorage.setItem(seenKey('local'), JSON.stringify({ v: 1, ids: ['first-turtle'] }));
  // The screen has switched to the account; its log has not taken in the device's turtle yet.
  await show({ owner: 'uid-a', badges: badgesFor([shark]), ready: true });
  await act(async () => claimSeenBadges('local', 'uid-a'));
  await update({ owner: 'uid-a', badges: badgesFor([shark, turtle]), ready: true });
  expect(latest.fresh).toEqual([]);
  expect(parseSeen(await AsyncStorage.getItem(A))).toContain('first-turtle');
});

// Two screens open at once, as the Rewards screen stays mounted under the log screen.
const screens = {};
const reportScreen = (name, value) => { screens[name] = value; };
function Screen({ name, ...props }) {
  reportScreen(name, useNewBadges(props));
  return null;
}
async function showScreens(list) {
  const els = list.map(([name, badges]) => <Screen key={name} name={name} owner="me" badges={badges} ready />);
  await act(async () => (root ? root.update(<>{els}</>) : (root = create(<>{els}</>))));
  await flush();
}

test('a badge celebrated on one screen is not new on another that is still open', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: earnedIds(badgesFor([shark])) }));
  await showScreens([['rewards', badgesFor([shark])], ['log', badgesFor([shark])]]);
  const after = badgesFor([shark, turtle]);
  await showScreens([['rewards', after], ['log', after]]);
  expect(ids(screens.log.fresh)).toEqual(['first-turtle']);
  await act(async () => screens.log.markSeen(['first-turtle']));
  await flush();
  // The log screen closes: the Rewards screen under it knows the turtle has been celebrated.
  await showScreens([['rewards', after]]);
  expect(screens.rewards.fresh).toEqual([]);
});

test('a screen that was open all along does not write over what another has seen', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: earnedIds(badgesFor([shark])) }));
  await showScreens([['rewards', badgesFor([shark])], ['log', badgesFor([shark])]]);
  await showScreens([['rewards', badgesFor([shark, turtle])], ['log', badgesFor([shark, turtle])]]);
  await act(async () => screens.log.markSeen(['first-turtle']));
  await flush();
  // The turtle's sighting is deleted and a manta logged; the Rewards screen is left and marks what it showed.
  const manta = seen('reef-manta', 'shark-yolanda', '2026-05-01');
  await showScreens([['rewards', badgesFor([shark, manta])]]);
  await act(async () => screens.rewards.markSeen());
  await flush();
  expect((await stored()).ids).toEqual(expect.arrayContaining(['first-turtle', 'first-ray']));
});

test('marking a badge seen keeps what is stored already', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: [] }));
  await show({ owner: 'me', badges: badgesFor([shark]), ready: true });
  // Something else writes to the record meanwhile (another copy of the app on the web, say).
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: ['first-turtle'] }));
  await act(async () => latest.markSeen());
  await flush();
  expect((await stored()).ids).toEqual(expect.arrayContaining(['first-turtle', ...earnedIds(badgesFor([shark]))]));
});

test('when storage cannot be read, what is earned counts as seen and what comes after is celebrated', async () => {
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('no storage'));
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('no storage'));
  await show({ owner: 'me', badges: badgesFor([shark]), ready: true });
  expect(latest.fresh).toEqual([]);
  await update({ owner: 'me', badges: badgesFor([shark, turtle]), ready: true });
  expect(ids(latest.fresh)).toEqual(['first-turtle']);
  await act(async () => latest.markSeen());
  await flush();
  expect(latest.fresh).toEqual([]);
});
