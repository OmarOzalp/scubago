/**
 * What the record of seen badges needs from the store, on the app's real SQLite code and a fake
 * Supabase: when a signed-in diver's log has come down from the server, and the device's record
 * going with its log when the diver signs in.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { SITES } from '@/data/sites';
import { parseSeen, seenKey } from '@/lib/badges-seen';
import { localIsoDate } from '@/lib/sighting-edit';
import { FakeServer } from '@/test-support/fake-supabase';
import { hasNodeSqlite } from '@/test-support/node-sqlite';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase ?? null,
}));

type Store = typeof import('@/lib/store');
type Storage = typeof import('@react-native-async-storage/async-storage').default;

const A = 'uid-a';
const today = localIsoDate(new Date());
const site = SITES[0].id;

/** One phone: its own store, and the AsyncStorage that store's modules see. */
async function openApp(client: unknown = null): Promise<Store & { storage: Storage }> {
  (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase = client ?? undefined;
  let store!: Store;
  let storage!: Storage;
  jest.isolateModules(() => {
    store = require('@/lib/store');
    const module = require('@react-native-async-storage/async-storage');
    storage = module.default ?? module;
  });
  await store.useAppStore.getState().init();
  return { ...store, storage };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('the seen badges and the store', () => {
  beforeEach(() => {
    // Retry timers never fire on their own here; everything else (promises) runs normally.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('a sync says whose log it has brought down, and its rows are in once it has finished', async () => {
    const server = new FakeServer();
    server.tables.profiles.push({ user_id: A, username: 'alice' });
    // Logged on the old phone.
    const old = (await openApp(server.device('old', A).client)).useAppStore.getState;
    await old().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: today });
    await old().requestSync();

    // A new phone, offline at first: its log has not come down yet.
    const phone = server.device('new', A);
    phone.online = false;
    const app = (await openApp(phone.client)).useAppStore.getState;
    await app().requestSync();
    expect(app().user?.id).toBe(A);
    expect(app().pulledFor).toBeUndefined();

    phone.online = true;
    await app().requestSync();
    expect(app().pulledFor).toBe(A);
    expect(app().syncing).toBe(false);
    expect(app().sightings.some((s) => s.userId === A && s.speciesId === 'reef-manta')).toBe(true);
  });

  it('signing in takes along the badges celebrated before, so they are not celebrated again', async () => {
    const server = new FakeServer();
    server.tables.profiles.push({ user_id: A, username: 'alice' });
    const { useAppStore, storage } = await openApp(server.device('phone', null).client);
    const app = useAppStore.getState;
    // The account has a record on this phone; signed out, the diver logged a turtle and saw it celebrated.
    await storage.setItem(seenKey(A), JSON.stringify({ v: 1, ids: ['first-sighting', 'first-shark'] }));
    await storage.setItem(seenKey('local'), JSON.stringify({ v: 1, ids: ['first-sighting', 'first-turtle'] }));
    await app().addSighting({ speciesId: 'green-turtle', siteId: site, sightedOn: today });

    await app().onSignedIn({ id: A, username: 'alice' });
    expect(app().sightings.find((s) => s.speciesId === 'green-turtle')?.userId).toBe(A);
    expect(parseSeen(await storage.getItem(seenKey(A)))?.sort()).toEqual(['first-shark', 'first-sighting', 'first-turtle']);
    // Like the log, the record has moved: the device starts afresh when the diver signs out.
    expect(await storage.getItem(seenKey('local'))).toBeNull();
  });

  it('an account with no record on this phone yet is left to make its first one', async () => {
    const server = new FakeServer();
    server.tables.profiles.push({ user_id: A, username: 'alice' });
    const { useAppStore, storage } = await openApp(server.device('phone', null).client);
    await storage.setItem(seenKey('local'), JSON.stringify({ v: 1, ids: ['first-turtle'] }));
    await useAppStore.getState().onSignedIn({ id: A, username: 'alice' });
    // A record from the device alone would stand in for the account's history, and that would be celebrated as it came down.
    expect(await storage.getItem(seenKey(A))).toBeNull();
    expect(await storage.getItem(seenKey('local'))).toBeNull();
  });
});
