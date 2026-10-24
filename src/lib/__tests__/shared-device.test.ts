/**
 * One device, several divers (a family iPad, a dive centre's tablet): signing out takes the diver's
 * log off it, and nobody else ever sees what they kept to themselves. On the app's real SQLite code
 * and store, against a fake Supabase that enforces the project's row-level security.
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
type Db = typeof import('@/lib/db');

const A = 'uid-a';
const B = 'uid-b';
const today = localIsoDate(new Date());
const site = SITES[0].id;

/** A device signed in as Alice, its app started. */
async function aliceOnTheIpad() {
  const server = new FakeServer();
  server.tables.profiles.push({ user_id: A, username: 'alice' }, { user_id: B, username: 'bob' });
  const ipad = server.device('family-ipad', A);
  (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase = ipad.client;
  let store!: Store;
  let db!: Db;
  jest.isolateModules(() => {
    store = require('@/lib/store');
    db = require('@/lib/db');
  });
  const app = store.useAppStore.getState;
  await app().init();
  expect(app().user?.id).toBe(A);
  const switchTo = async (id: string, username: string) => {
    await app().signOutUser();
    ipad.userId = id;
    await app().onSignedIn({ id, username });
  };
  return { server, ipad, db, app, switchTo };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('a device shared by several divers', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('signing out takes the diver’s synced log off it, and keeps what still has to sync out of sight', async () => {
    const { server, ipad, db, app, switchTo } = await aliceOnTheIpad();
    const { sighting: secret } = await app().addSighting({
      speciesId: 'reef-manta', siteId: site, sightedOn: today, notes: 'my secret spot', visibility: 'private',
    });
    const { sighting: shared } = await app().addSighting({
      speciesId: 'whale-shark', siteId: site, sightedOn: today, notes: 'the boat crew’s mooring', visibility: 'public', notesPrivate: true,
    });
    await app().requestSync();
    ipad.online = false;
    const { sighting: waitingSecret } = await app().addSighting({
      speciesId: 'grey-reef-shark', siteId: site, sightedOn: today, notes: 'offline secret', visibility: 'private',
    });
    const { sighting: waitingShared } = await app().addSighting({
      speciesId: 'green-turtle', siteId: site, sightedOn: today, notes: 'offline note', visibility: 'public', notesPrivate: true,
    });
    await app().requestSync();
    ipad.online = true;
    expect(app().sightings.filter((s) => s.userId === A && s.synced).map((s) => s.id).sort()).toEqual([secret.id, shared.id].sort());

    await app().signOutUser();
    ipad.userId = null;
    // On the device: only what hasn't reached the server yet.
    expect((await db.loadAll()).sightings.filter((s) => s.userId === A).map((s) => s.id).sort()).toEqual([waitingSecret.id, waitingShared.id].sort());
    // In every view: none of her private sightings, and her shared one without its private notes.
    const hers = () => app().sightings.filter((s) => s.userId === A);
    expect(hers().map((s) => s.id)).toEqual([waitingShared.id]);
    expect(hers()[0].notes).toBeUndefined();

    // Bob signs in on the same iPad and syncs.
    ipad.userId = B;
    await app().onSignedIn({ id: B, username: 'bob' });
    await app().requestSync();
    expect(hers().map((s) => s.id).sort()).toEqual([shared.id, waitingShared.id].sort());
    expect(hers().map((s) => s.notes)).toEqual([undefined, undefined]);
    // Bob's sync never sends Alice's changes.
    expect(server.sighting(waitingSecret.id)).toBeUndefined();

    // Alice signs back in: her waiting changes go up, and her whole log comes back.
    await switchTo(A, 'alice');
    await app().requestSync();
    expect(server.sighting(waitingSecret.id)).toMatchObject({ visibility: 'private' });
    expect(server.details(waitingShared.id)).toMatchObject({ notes: 'offline note' });
    const back = new Map(hers().map((s) => [s.id, s]));
    expect(back.get(secret.id)).toMatchObject({ synced: true, notes: 'my secret spot' });
    expect(back.get(shared.id)).toMatchObject({ synced: true, notes: 'the boat crew’s mooring' });
    expect(back.get(waitingSecret.id)).toMatchObject({ synced: true, notes: 'offline secret' });
    expect(back.get(waitingShared.id)).toMatchObject({ synced: true, notes: 'offline note' });
  });

  it('a page a waiting sighting is on stays on the device, unseen, so the sighting keeps it', async () => {
    const { server, ipad, db, app, switchTo } = await aliceOnTheIpad();
    const { dive, sightings } = await app().logDive({ dive: { number: 1, siteId: site, divedOn: today }, sightings: [{ speciesId: 'reef-manta' }] });
    const { dive: other } = await app().logDive({ dive: { number: 2, siteId: site, divedOn: today }, sightings: [] });
    await app().requestSync();
    ipad.online = false;
    await app().updateSighting(sightings[0].id, { speciesId: 'reef-manta', siteId: site, sightedOn: today, notes: 'written later' });
    await app().requestSync();
    ipad.online = true;

    await switchTo(B, 'bob');
    expect((await db.loadAll()).dives.map((d) => d.id)).toEqual([dive.id]);
    expect((await db.loadAll()).dives.map((d) => d.id)).not.toContain(other.id);
    expect(app().dives).toEqual([]);

    await switchTo(A, 'alice');
    await app().requestSync();
    expect(server.sighting(sightings[0].id)).toMatchObject({ dive_id: dive.id, notes: 'written later' });
    expect(app().dives.map((d) => d.id).sort()).toEqual([dive.id, other.id].sort());
  });
});
