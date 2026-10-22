import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SITES } from '@/data/sites';
import { useRewards } from '../use-rewards';

// The store, as the hook reads it. Like the real ones, the list hooks return a new array on every call.
let mockReady = true;
let mockSightings = [];
let mockDives = [];
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: mockReady }),
  useMySightings: () => [...mockSightings],
  useMyDives: () => [...mockDives],
  useAllSites: () => [...require('@/data/sites').SITES],
}));

const seen = (speciesId, siteId, sightedOn) => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn, isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const dive = (number, siteId, divedOn) => ({ id: `dive-${number}`, userId: 'me', number, siteId, divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z` });

let latest;
let renders;
const report = (value) => { latest = value; renders++; };
function Probe() {
  report(useRewards());
  return null;
}
let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockReady = true; mockSightings = []; mockDives = []; renders = 0; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('the rewards are those of the diver\'s own log, on every site that can be named', async () => {
  mockSightings = [seen('whale-shark', 'richelieu-rock', '2026-03-02')];
  mockDives = [dive(1, 'richelieu-rock', '2026-03-02')];
  await act(async () => { root = create(<Probe />); });
  const earned = latest.badges.filter((b) => b.earned).map((b) => b.id);
  // The whale shark is a shark and, in the catalog's own rating, a legendary find (no observed rarity is passed yet).
  expect(earned).toEqual(expect.arrayContaining(['first-sighting', 'first-shark', 'first-rare', 'first-epic', 'first-legendary', 'dives-1']));
  expect(latest.passport.map((g) => [g.name, g.stamps.map((s) => s.siteId)])).toEqual([['Thailand', ['richelieu-rock']]]);
  expect(latest.passport[0].knownSites).toBe(SITES.filter((s) => s.country === 'Thailand').length);
  expect(latest.ready).toBe(true);
});

test('a log that has not loaded is not ready, and shows only what an empty log has earned', async () => {
  mockReady = false;
  await act(async () => { root = create(<Probe />); });
  expect(latest.ready).toBe(false);
  expect(latest.badges.some((b) => b.earned)).toBe(false);
  expect(latest.passport).toEqual([]);
});

test('the same log gives the same rewards object, however often the store hooks hand back new arrays', async () => {
  mockSightings = [seen('whale-shark', 'richelieu-rock', '2026-03-02')];
  await act(async () => { root = create(<Probe />); });
  const first = latest;
  await act(async () => root.update(<Probe />));
  await act(async () => root.update(<Probe />));
  expect(renders).toBeGreaterThan(1);
  expect(latest).toBe(first);
  // A new sighting is new rewards.
  mockSightings = [...mockSightings, seen('reef-manta', 'hin-daeng', '2026-03-04')];
  await act(async () => root.update(<Probe />));
  expect(latest).not.toBe(first);
  expect(latest.badges.find((b) => b.id === 'first-ray').earned).toBe(true);
});
