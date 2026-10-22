/**
 * What the record of seen badges needs from the store, on the app's real SQLite code and a fake
 * Supabase: when a signed-in diver's log has come down from the server.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { SITES } from '@/data/sites';
import { localIsoDate } from '@/lib/sighting-edit';
import { FakeServer } from '@/test-support/fake-supabase';
import { hasNodeSqlite } from '@/test-support/node-sqlite';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase ?? null,
}));

type Store = typeof import('@/lib/store');

const A = 'uid-a';
const today = localIsoDate(new Date());
const site = SITES[0].id;

async function openApp(client: unknown = null): Promise<Store> {
  (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase = client ?? undefined;
  let store!: Store;
  jest.isolateModules(() => {
    store = require('@/lib/store');
  });
  await store.useAppStore.getState().init();
  return store;
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
});
