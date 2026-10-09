/**
 * Editing and deleting sightings offline, end to end: the app's real SQLite code (on Node's
 * built-in SQLite) and real sync, against an in-memory server that enforces the same ownership
 * rules as the project's row-level security. Each "phone" has its own local database.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { describe, expect, it, jest } from '@jest/globals';

import { FakeServer, type FakeDevice } from '@/test-support/fake-supabase';
import { hasNodeSqlite, sqliteHooks } from '@/test-support/node-sqlite';
import { applyEdit, canEditSighting } from '@/lib/sighting-edit';
import { photoObjectPath, PHOTO_BUCKET, ownPhotoPath } from '@/lib/sync';
import type { Sighting } from '@/lib/types';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());

type Db = typeof import('@/lib/db');
type SyncService = typeof import('@/lib/sync-service');

const A = 'uid-a';
const B = 'uid-b';
const OWNER_COLUMNS = ['species_id', 'site_id', 'sighted_on', 'notes', 'photo_url'];

function newServer(): FakeServer {
  const server = new FakeServer();
  server.tables.profiles.push({ user_id: A, username: 'alice' }, { user_id: B, username: 'bob' });
  return server;
}

let counter = 0;

/** A phone: its own local database, signed in as `userId` against `server`. */
function phone(server: FakeServer, name: string, userId: string) {
  let db!: Db;
  let sync!: SyncService;
  jest.isolateModules(() => {
    db = require('@/lib/db');
    sync = require('@/lib/sync-service');
  });
  const device: FakeDevice = server.device(name, userId);
  const discarded: string[] = [];
  const overrides = {
    // The real uploader reads the file from disk; this one only checks it "exists".
    uploadPhoto: async (client: any, uid: string, sightingId: string, uri: string) => {
      if (uri.includes('missing')) throw new sync.MissingPhotoError();
      const path = photoObjectPath(uid, sightingId, uri);
      const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, new Uint8Array([1]), { upsert: true });
      if (error) throw error;
      return client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
    },
    discardLocalPhoto: (uri: string) => {
      discarded.push(uri);
    },
  };
  return {
    db,
    device,
    discarded,
    ready: () => db.initDb({ demo: false }),
    sync: (extra: Partial<import('@/lib/sync-service').SyncDeps> = {}) =>
      sync.syncNow(device.client, userId, { ...overrides, ...extra }),
    /** Sync, expecting the pull to fail (offline): the outbox is kept either way. */
    syncOffline: async () => {
      await expect(sync.syncNow(device.client, userId, overrides)).rejects.toBeTruthy();
    },
    log: async (overrides: Partial<Sighting> = {}): Promise<Sighting> => {
      const s: Sighting = {
        id: `s-${++counter}`, userId, username: name, speciesId: 'reef-manta', siteId: 'blue-corner',
        sightedOn: '2026-09-01', isDemo: false, synced: false, createdAt: new Date(Date.now() + counter).toISOString(),
        ...overrides,
      };
      await db.insertSighting(s);
      return s;
    },
    get: async (id: string) => (await db.loadAll()).sightings.find((s) => s.id === id),
    edit: async (id: string, change: Partial<Sighting>) => {
      const before = (await db.loadAll()).sightings.find((s) => s.id === id)!;
      const after = applyEdit(before, { ...before, ...change }, new Date().toISOString());
      await db.updateSighting(after);
      return after;
    },
    remove: (id: string) => db.deleteSighting(id, { pendingSync: true }),
  };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('editing and deleting sightings offline', () => {
  it('a sighting logged offline reaches the server when the connection returns', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log();

    p.device.online = false;
    await p.syncOffline();
    expect(server.sighting(s.id)).toBeUndefined();
    expect((await p.get(s.id))?.synced).toBe(false);
    expect((await p.get(s.id))?.syncError).toMatch(/network/i);

    p.device.online = true;
    await p.sync();
    expect(server.sighting(s.id)).toMatchObject({ user_id: A, species_id: 'reef-manta' });
    expect(await p.get(s.id)).toMatchObject({ synced: true, syncError: undefined });
  });

  it('an edit made offline syncs later, changing only what an owner may change', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ notes: 'first' });
    await p.sync();
    // The column privileges planned for verification (owners can't touch id, owner or created_at).
    server.sightingUpdateColumns = OWNER_COLUMNS;

    p.device.online = false;
    await p.edit(s.id, { speciesId: 'whale-shark', notes: 'actually a whale shark' });
    await p.syncOffline();
    // Optimistic: the app shows the edit at once, and keeps it queued.
    expect(await p.get(s.id)).toMatchObject({ speciesId: 'whale-shark', synced: false });
    expect(server.sighting(s.id)?.species_id).toBe('reef-manta');

    p.device.online = true;
    const result = await p.sync();
    expect(result.failed).toBe(0);
    expect(server.sighting(s.id)).toMatchObject({ species_id: 'whale-shark', notes: 'actually a whale shark', user_id: A });
    const update = server.calls.filter((c) => c.op === 'update' && c.ids.includes(s.id));
    expect(update).toHaveLength(1);
    expect(update[0].columns!.every((c) => OWNER_COLUMNS.includes(c))).toBe(true);
    expect((await p.get(s.id))?.synced).toBe(true);
  });

  it('a pull never overwrites an edit that has not synced yet', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ notes: 'original' });
    await p.sync();

    await p.edit(s.id, { notes: 'edited here' });
    const serverCopy = { ...s, notes: 'original', synced: true };
    await p.db.mergePulledSightings([serverCopy], { ownerId: A, ownComplete: true, communitySince: null });
    expect((await p.get(s.id))?.notes).toBe('edited here');

    await p.sync();
    expect(server.sighting(s.id)?.notes).toBe('edited here');
  });

  it('a deletion made offline syncs, removes the photo, and the sighting never comes back', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ photoUri: 'file:///kept/photo-1.jpg' });
    await p.sync();
    const photoPath = ownPhotoPath(server.sighting(s.id)!.photo_url, A)!;
    expect(server.files.has(photoPath)).toBe(true);
    const serverCopy = { ...(await p.get(s.id))! };

    p.device.online = false;
    await p.remove(s.id);
    let local = await p.db.loadAll();
    expect(local.sightings.find((x) => x.id === s.id)).toBeUndefined();
    expect(local.deletions).toEqual([{ id: s.id, userId: A, syncError: undefined }]);

    await p.syncOffline();
    // A stale copy from a pull can't resurrect it while the deletion waits.
    await p.db.mergePulledSightings([serverCopy], { ownerId: A, ownComplete: true, communitySince: null });
    local = await p.db.loadAll();
    expect(local.sightings.find((x) => x.id === s.id)).toBeUndefined();
    expect(local.deletions[0]).toMatchObject({ id: s.id });
    expect(local.deletions[0].syncError).toMatch(/network/i);

    p.device.online = true;
    const result = await p.sync();
    expect(result.deletedSightings).toBe(1);
    expect(server.sighting(s.id)).toBeUndefined();
    expect(server.files.has(photoPath)).toBe(false);
    local = await p.db.loadAll();
    expect(local.sightings.find((x) => x.id === s.id)).toBeUndefined();
    expect(local.deletions).toEqual([]);

    await p.sync();
    expect((await p.db.loadAll()).sightings.find((x) => x.id === s.id)).toBeUndefined();
  });

  it('edit then delete while offline sends only the deletion', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log();
    await p.sync();
    const before = server.calls.length;

    p.device.online = false;
    await p.edit(s.id, { speciesId: 'whale-shark' });
    await p.remove(s.id);
    p.device.online = true;
    await p.sync();

    const sent = server.calls.slice(before).filter((c) => c.table === 'sightings' && c.ids.includes(s.id));
    expect(sent.map((c) => c.op)).toEqual(['delete']);
    expect(server.sighting(s.id)).toBeUndefined();
  });

  it('a sighting that reappears on the server after its deletion is deleted again', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log();
    await p.sync();
    await p.remove(s.id);
    await p.sync();
    expect(server.sighting(s.id)).toBeUndefined();

    // Say a stale device re-inserts it.
    server.seedSighting({ id: s.id, user_id: A, created_at: s.createdAt });
    await p.sync(); // notices it and queues the deletion again
    expect((await p.db.loadAll()).sightings.find((x) => x.id === s.id)).toBeUndefined();
    await p.sync();
    expect(server.sighting(s.id)).toBeUndefined();
  });

  it('a push the server applied but never acknowledged is updated, not duplicated', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ notes: 'v1' });

    server.loseNextReply = true;
    const first = await p.sync();
    expect(first.failed).toBe(1);
    expect(server.sighting(s.id)).toBeDefined(); // it did land
    expect((await p.get(s.id))?.synced).toBe(false);

    await p.edit(s.id, { notes: 'v2' });
    await p.sync();
    expect(server.tables.sightings.filter((r) => r.id === s.id)).toHaveLength(1);
    expect(server.sighting(s.id)?.notes).toBe('v2');
    expect((await p.get(s.id))?.synced).toBe(true);
  });

  it('deleting a sighting whose first upload was never acknowledged still removes it and its photo', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ photoUri: 'file:///kept/photo-2.jpg' });
    server.loseNextReply = true;
    await p.sync();
    expect(server.sighting(s.id)).toBeDefined();
    const photoPath = photoObjectPath(A, s.id, 'file:///kept/photo-2.jpg');
    expect(server.files.has(photoPath)).toBe(true);

    await p.remove(s.id);
    await p.sync();
    expect(server.sighting(s.id)).toBeUndefined();
    expect(server.files.has(photoPath)).toBe(false);
  });

  it('a sighting deleted on one of the diver\'s devices disappears from the other', async () => {
    const server = newServer();
    const phoneA = phone(server, 'alice-phone', A);
    const tabletA = phone(server, 'alice-tablet', A);
    await phoneA.ready();
    await tabletA.ready();
    const s = await phoneA.log();
    await phoneA.sync();
    await tabletA.sync();
    expect(await tabletA.get(s.id)).toBeDefined();

    await phoneA.remove(s.id);
    await phoneA.sync();
    await tabletA.sync();
    expect(await tabletA.get(s.id)).toBeUndefined();
  });

  it('a deletion on another device wins over an offline edit here', async () => {
    const server = newServer();
    const phoneA = phone(server, 'alice-phone', A);
    const tabletA = phone(server, 'alice-tablet', A);
    await phoneA.ready();
    await tabletA.ready();
    const s = await phoneA.log({ photoUri: 'file:///kept/photo-3.jpg' });
    await phoneA.sync();
    await tabletA.sync();

    tabletA.device.online = false;
    await tabletA.edit(s.id, { notes: 'edited on the tablet', photoUri: 'file:///kept/photo-4.jpg' });
    await phoneA.remove(s.id);
    await phoneA.sync();

    tabletA.device.online = true;
    const result = await tabletA.sync();
    expect(result.droppedSightings).toBe(1);
    expect(server.sighting(s.id)).toBeUndefined(); // not brought back
    expect(await tabletA.get(s.id)).toBeUndefined();
    expect([...server.files.keys()].filter((f) => f.includes(s.id))).toEqual([]); // no orphaned photo
  });

  it('a community sighting its owner deleted disappears from other divers\' feeds', async () => {
    const server = newServer();
    const alice = phone(server, 'alice', A);
    const bob = phone(server, 'bob', B);
    await alice.ready();
    await bob.ready();
    const s = await alice.log();
    await alice.sync();
    await bob.sync();
    expect(await bob.get(s.id)).toMatchObject({ userId: A, username: 'alice' });

    await alice.remove(s.id);
    await alice.sync();
    await bob.sync();
    expect(await bob.get(s.id)).toBeUndefined();
  });

  it('another diver cannot edit or delete a sighting, in the app or through the server', async () => {
    const server = newServer();
    const alice = phone(server, 'alice', A);
    const bob = phone(server, 'bob', B);
    await alice.ready();
    await bob.ready();
    const s = await alice.log({ notes: 'alice wrote this' });
    await alice.sync();
    await bob.sync();

    const seenByBob = (await bob.get(s.id))!;
    expect(canEditSighting(seenByBob, B)).toBe(false);
    expect(canEditSighting(seenByBob, A)).toBe(true);

    // Even a tampered local copy never leaves Bob's phone: his outbox holds only his own rows.
    await bob.db.updateSighting({ ...seenByBob, notes: 'bob was here', status: undefined });
    await bob.db.deleteSighting(s.id, { pendingSync: true });
    await bob.sync();
    expect(server.sighting(s.id)).toMatchObject({ notes: 'alice wrote this', user_id: A });

    // And the server refuses Bob's direct attempts (row-level security: 0 rows reached).
    const client = bob.device.client;
    const { data: updated } = await client.from('sightings').update({ notes: 'x' }).eq('id', s.id).select('id');
    const { data: deleted } = await client.from('sightings').delete().eq('id', s.id).select('id');
    const { error } = await client.from('sightings').upsert({ id: s.id, user_id: A, notes: 'x' });
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
    expect(error?.code).toBe('42501');
    expect(server.sighting(s.id)?.notes).toBe('alice wrote this');
  });

  it('an edit made while a push is on its way stays queued and goes next time', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ notes: 'v1', photoUri: 'file:///kept/photo-5.jpg' });

    let edited = false;
    const upload = async (client: any, uid: string, id: string, uri: string) => {
      if (!edited) {
        edited = true;
        await p.edit(s.id, { notes: 'v2 (typed while syncing)' });
      }
      const path = photoObjectPath(uid, id, uri);
      await client.storage.from(PHOTO_BUCKET).upload(path, new Uint8Array([1]), { upsert: true });
      return client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
    };
    await p.sync({ uploadPhoto: upload });
    expect(server.sighting(s.id)?.notes).toBe('v1');
    expect(await p.get(s.id)).toMatchObject({ notes: 'v2 (typed while syncing)', synced: false });
    // Its photo file is still needed by the queued edit, so it wasn't discarded.
    expect(p.discarded).toEqual([]);

    await p.sync({ uploadPhoto: upload });
    expect(server.sighting(s.id)?.notes).toBe('v2 (typed while syncing)');
    expect((await p.get(s.id))?.synced).toBe(true);
    expect(server.tables.sightings).toHaveLength(1);
  });

  it('replacing or removing a photo deletes the old file from storage', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ photoUri: 'file:///kept/one.jpg' });
    await p.sync();
    const first = server.sighting(s.id)!.photo_url as string;
    expect((await p.get(s.id))?.photoUri).toBe(first);
    expect(p.discarded).toEqual(['file:///kept/one.jpg']);

    await p.edit(s.id, { photoUri: 'file:///kept/two.png' });
    await p.sync();
    const second = server.sighting(s.id)!.photo_url as string;
    expect(second).not.toBe(first);
    expect(second.endsWith('.png')).toBe(true);
    expect(server.files.has(ownPhotoPath(first, A)!)).toBe(false);
    expect(server.files.has(ownPhotoPath(second, A)!)).toBe(true);

    await p.edit(s.id, { photoUri: undefined });
    await p.sync();
    expect(server.sighting(s.id)?.photo_url).toBeNull();
    expect(server.files.size).toBe(0);
  });

  it('a photo that vanished from the device does not hold the sighting back', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ photoUri: 'file:///cache/missing.jpg' });
    const result = await p.sync();
    expect(result.failed).toBe(0);
    expect(server.sighting(s.id)).toMatchObject({ photo_url: null });
    expect(await p.get(s.id)).toMatchObject({ synced: true, photoUri: undefined });
  });

  it('a confirmed verification is dropped locally when the facts change, not when notes do', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log();
    await p.sync();
    // The server says a buddy confirmed it.
    await p.db.mergePulledSightings([{ ...s, synced: true, status: 'confirmed' }], { ownerId: A, ownComplete: false, communitySince: '9999' });
    expect((await p.get(s.id))?.status).toBe('confirmed');

    await p.edit(s.id, { notes: 'more detail' });
    expect((await p.get(s.id))?.status).toBe('confirmed');
    await p.edit(s.id, { sightedOn: '2026-08-31' });
    expect((await p.get(s.id))?.status).toBe('unverified');
  });
});

describeSqlite('the local database upgrade', () => {
  it('keeps existing sightings and remembers which ones the server already has', async () => {
    sqliteHooks.onOpen = (raw) => {
      raw.exec(`
        CREATE TABLE sightings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
          species_id TEXT NOT NULL, site_id TEXT NOT NULL, sighted_on TEXT NOT NULL, notes TEXT, photo_uri TEXT,
          is_demo INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE user_sites (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
          region TEXT NOT NULL, country TEXT NOT NULL, blurb TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL);
        INSERT INTO sightings VALUES
          ('old-synced', '${A}', 'alice', 'reef-manta', 'blue-corner', '2026-01-01', NULL,
           'https://x.supabase.co/storage/v1/object/public/sighting-photos/${A}/old-synced.jpg', 0, 1, '2026-01-01T00:00:00.000Z'),
          ('old-pending', '${A}', 'alice', 'whale-shark', 'blue-corner', '2026-01-02', 'n', NULL, 0, 0, '2026-01-02T00:00:00.000Z');
        PRAGMA user_version = 2;
      `);
    };
    let db!: Db;
    jest.isolateModules(() => {
      db = require('@/lib/db');
    });
    try {
      const { sightings } = await db.initDb({ demo: false });
      expect(sightings.map((s) => s.id).sort()).toEqual(['old-pending', 'old-synced']);
      const raw = sqliteHooks.last;
      expect({ ...raw.prepare('PRAGMA user_version').get() }).toEqual({ user_version: 3 });
      const rows = raw.prepare('SELECT id, remote, synced_photo_url, deleted, version FROM sightings ORDER BY id').all();
      expect(rows.map((r: object) => ({ ...r }))).toEqual([
        { id: 'old-pending', remote: 0, synced_photo_url: null, deleted: 0, version: 0 },
        {
          id: 'old-synced', remote: 1, deleted: 0, version: 0,
          synced_photo_url: `https://x.supabase.co/storage/v1/object/public/sighting-photos/${A}/old-synced.jpg`,
        },
      ]);
      expect((await db.getSightingOutbox(A)).map((s) => s.id)).toEqual(['old-pending']);
    } finally {
      sqliteHooks.onOpen = null;
    }
  });

  it('forgets confirmed deletions after 30 days, never pending ones', async () => {
    let db!: Db;
    jest.isolateModules(() => {
      db = require('@/lib/db');
    });
    await db.initDb({ demo: false });
    const base: Sighting = {
      id: '', userId: A, username: 'alice', speciesId: 'reef-manta', siteId: 'blue-corner', sightedOn: '2026-01-01',
      isDemo: false, synced: true, createdAt: '2026-01-01T00:00:00.000Z',
    };
    await db.insertSighting({ ...base, id: 'confirmed-old' });
    await db.insertSighting({ ...base, id: 'pending-old' });
    await db.deleteSighting('confirmed-old', { pendingSync: true });
    await db.deleteSighting('pending-old', { pendingSync: true });
    await db.markDeletionSynced('confirmed-old');
    sqliteHooks.last.exec(`UPDATE sightings SET updated_at = '2020-01-01T00:00:00.000Z'`);

    await db.initDb({ demo: false });
    const ids = sqliteHooks.last.prepare('SELECT id FROM sightings ORDER BY id').all().map((r: any) => r.id);
    expect(ids).toEqual(['pending-old']);
  });
});
