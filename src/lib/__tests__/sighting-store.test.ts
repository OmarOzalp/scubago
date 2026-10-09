/**
 * The store actions behind the sighting screens (log, edit, delete), on the app's real SQLite code
 * and, when signed in, a fake Supabase that enforces the project's ownership rules.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { deriveHome } from '@/lib/home';
import { localIsoDate, shiftIsoDate } from '@/lib/sighting-edit';
import { FakeServer } from '@/test-support/fake-supabase';
import { hasNodeSqlite } from '@/test-support/node-sqlite';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase ?? null,
}));

type Store = typeof import('@/lib/store');
type Db = typeof import('@/lib/db');

const A = 'uid-a';
const today = localIsoDate(new Date());
const site = SITES[0].id;

async function openApp(client: unknown = null): Promise<{ store: Store; db: Db }> {
  (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase = client ?? undefined;
  let store!: Store;
  let db!: Db;
  jest.isolateModules(() => {
    store = require('@/lib/store');
    db = require('@/lib/db');
  });
  await store.useAppStore.getState().init();
  return { store, db };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('logging, editing and deleting sightings', () => {
  beforeEach(() => {
    // Retry timers never fire on their own here; everything else (promises) runs normally.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('without an account, the diver edits and deletes their own sightings on the device', async () => {
    const { store, db } = await openApp();
    const app = store.useAppStore.getState;
    const { sighting } = await app().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: today });

    const { sighting: edited } = await app().updateSighting(sighting.id, {
      speciesId: 'reef-manta', siteId: site, sightedOn: today, notes: 'three of them',
    });
    expect(edited.notes).toBe('three of them');
    expect(app().sightings.find((s) => s.id === sighting.id)?.notes).toBe('three of them');
    expect((await db.loadAll()).sightings.find((s) => s.id === sighting.id)?.notes).toBe('three of them');

    await app().deleteSighting(sighting.id);
    expect(app().sightings.find((s) => s.id === sighting.id)).toBeUndefined();
    const local = await db.loadAll();
    expect(local.sightings.find((s) => s.id === sighting.id)).toBeUndefined();
    expect(local.deletions).toEqual([]); // nothing to tell a server
  });

  it("no one can edit or delete a sighting that isn't theirs", async () => {
    const { store } = await openApp(); // a local-only build shows example data from "other divers"
    const app = store.useAppStore.getState;
    const example = app().sightings.find((s) => s.isDemo)!;
    expect(example).toBeDefined();
    await expect(
      app().updateSighting(example.id, { speciesId: example.speciesId, siteId: example.siteId, sightedOn: example.sightedOn, notes: 'x' }),
    ).rejects.toThrow('You can only edit your own sightings.');
    await expect(app().deleteSighting(example.id)).rejects.toThrow('You can only delete your own sightings.');
    expect(app().sightings.find((s) => s.id === example.id)).toEqual(example);
  });

  it('signed in, a deletion waits as a tombstone until the server confirms it', async () => {
    const server = new FakeServer();
    server.tables.profiles.push({ user_id: A, username: 'alice' });
    const phone = server.device('phone', A);
    const { store, db } = await openApp(phone.client);
    const app = store.useAppStore.getState;
    expect(app().user?.id).toBe(A);

    const { sighting } = await app().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: today });
    await app().requestSync();
    expect(server.sighting(sighting.id)).toBeDefined();
    expect(app().sightings.find((s) => s.id === sighting.id)?.synced).toBe(true);

    phone.online = false;
    await app().deleteSighting(sighting.id);
    expect(app().sightings.find((s) => s.id === sighting.id)).toBeUndefined();
    expect(store.pendingChanges(app().sightings, app().deletions, A)).toEqual({ count: 1, failing: 0 });
    await app().requestSync();
    expect(app().syncProblem).toMatch(/network/i);
    expect(server.sighting(sighting.id)).toBeDefined();
    expect(store.pendingChanges(app().sightings, app().deletions, A)).toEqual({ count: 1, failing: 1 });

    phone.online = true;
    await app().requestSync();
    expect(server.sighting(sighting.id)).toBeUndefined();
    expect(app().deletions).toEqual([]);
    expect(app().syncProblem).toBeNull();
    expect((await db.loadAll()).sightings.find((s) => s.id === sighting.id)).toBeUndefined();
  });

  it('the collection and island follow deletions: a species stays while another sighting qualifies it', async () => {
    const { store } = await openApp();
    const app = store.useAppStore.getState;
    const mine = () => app().sightings.filter((s) => s.userId === store.LOCAL_USER_ID);
    const collection = () => deriveDex(mine(), CATALOG_BY_ID).map((d) => d.species.id).sort();

    const manta1 = (await app().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: today })).sighting;
    const manta2 = (await app().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: today })).sighting;
    const shark = (await app().addSighting({ speciesId: 'whale-shark', siteId: site, sightedOn: today })).sighting;
    const turtle = (await app().addSighting({ speciesId: 'green-turtle', siteId: site, sightedOn: today })).sighting;
    expect(collection()).toEqual(['green-turtle', 'reef-manta', 'whale-shark']);
    expect(deriveHome(mine(), CATALOG_BY_ID).level).toBe(2); // 3 species: level 2

    await app().deleteSighting(manta1.id);
    expect(collection()).toEqual(['green-turtle', 'reef-manta', 'whale-shark']); // manta2 still counts
    await app().deleteSighting(shark.id);
    expect(collection()).toEqual(['green-turtle', 'reef-manta']);
    expect(deriveHome(mine(), CATALOG_BY_ID).level).toBe(1);
    await app().deleteSighting(manta2.id);
    await app().deleteSighting(turtle.id);
    expect(collection()).toEqual([]);
  });

  it('an edit that changes the species can bring a new species; a verification does not survive it', async () => {
    const server = new FakeServer();
    server.tables.profiles.push({ user_id: A, username: 'alice' });
    const { store, db } = await openApp(server.device('phone', A).client);
    const app = store.useAppStore.getState;
    const { sighting } = await app().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: today });
    await app().requestSync();
    // The server reports that a buddy confirmed it.
    await db.mergePulledSightings([{ ...app().sightings.find((s) => s.id === sighting.id)!, status: 'confirmed' }], {
      ownerId: A, ownComplete: false, communitySince: '9999',
    });
    store.useAppStore.setState(await db.loadAll());

    const notesOnly = await app().updateSighting(sighting.id, { speciesId: 'reef-manta', siteId: site, sightedOn: today, notes: 'n' });
    expect(notesOnly).toMatchObject({ isNewSpecies: false, sighting: { status: 'confirmed' } });
    const changed = await app().updateSighting(sighting.id, { speciesId: 'whale-shark', siteId: site, sightedOn: today });
    expect(changed).toMatchObject({ isNewSpecies: true, sighting: { status: 'unverified', speciesId: 'whale-shark' } });
  });

  it('new and edited sightings pass the same checks', async () => {
    const { store } = await openApp();
    const app = store.useAppStore.getState;
    const tomorrow = shiftIsoDate(today, 1);
    await expect(app().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: tomorrow })).rejects.toThrow(/future/);
    await expect(app().addSighting({ speciesId: 'nessie', siteId: site, sightedOn: today })).rejects.toThrow(/species/);
    const { sighting } = await app().addSighting({ speciesId: 'reef-manta', siteId: site, sightedOn: today });
    await expect(app().updateSighting(sighting.id, { speciesId: 'reef-manta', siteId: 'atlantis', sightedOn: today })).rejects.toThrow(/site/);
    await expect(app().updateSighting(sighting.id, { speciesId: 'reef-manta', siteId: site, sightedOn: tomorrow })).rejects.toThrow(/future/);
    expect(app().sightings.find((s) => s.id === sighting.id)).toMatchObject({ siteId: site, sightedOn: today });
  });
});
