/**
 * Private sightings, notes and photos, end to end: the app's real SQLite code and real sync (photo
 * upload, copy and removal included) against an in-memory server that enforces migration 0008's
 * rules. What a diver keeps private must never reach the public row or the public bucket, on a
 * project with 0008 or without it.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { describe, expect, it, jest } from '@jest/globals';

import { FakeServer, PRIVATE_BUCKET } from '@/test-support/fake-supabase';
import { hasNodeSqlite } from '@/test-support/node-sqlite';
import { applyEdit } from '@/lib/sighting-edit';
import { photoObjectPath } from '@/lib/sync';
import type { Sighting } from '@/lib/types';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());
// Photos "on the device": every file exists, except ones named missing.
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    get exists() {
      return !this.uri.includes('missing');
    }
    async bytes() {
      return new Uint8Array([1]);
    }
  },
  Directory: class {},
  Paths: {},
}));

type Db = typeof import('@/lib/db');
type SyncService = typeof import('@/lib/sync-service');

const A = 'uid-a';
const B = 'uid-b';
const PUBLIC_PHOTO = /\/storage\/v1\/object\/public\/sighting-photos\//;

function newServer(): FakeServer {
  const server = new FakeServer();
  server.tables.profiles.push({ user_id: A, username: 'alice' }, { user_id: B, username: 'bob' });
  return server;
}

let counter = 0;

/** A phone with its own local database, signed in as `userId`. */
function phone(server: FakeServer, name: string, userId: string) {
  let db!: Db;
  let sync!: SyncService;
  jest.isolateModules(() => {
    db = require('@/lib/db');
    sync = require('@/lib/sync-service');
  });
  const device = server.device(name, userId);
  const get = async (id: string) => (await db.loadAll()).sightings.find((s) => s.id === id);
  return {
    db,
    device,
    get,
    ready: () => db.initDb({ demo: false }),
    sync: (extra: Partial<import('@/lib/sync-service').SyncDeps> = {}) =>
      sync.syncNow(device.client, userId, { discardLocalPhoto: () => {}, ...extra }),
    log: async (overrides: Partial<Sighting> = {}): Promise<Sighting> => {
      const s: Sighting = {
        id: `p-${++counter}`, userId, username: name, speciesId: 'reef-manta', siteId: 'blue-corner',
        sightedOn: '2026-09-01', isDemo: false, synced: false, createdAt: new Date(Date.now() + counter).toISOString(),
        ...overrides,
      };
      await db.insertSighting(s);
      return s;
    },
    edit: async (id: string, change: Partial<Sighting>) => {
      const before = (await get(id))!;
      await db.updateSighting(applyEdit(before, { ...before, ...change }, new Date().toISOString()));
    },
  };
}

/** Everything another signed-in diver, and an anonymous visitor, can read of a sighting. */
async function seenByOthers(server: FakeServer, id: string) {
  const bob = server.device('bob', B).client;
  const anon = server.device('anon', null).client;
  const { data: bobRows } = await bob.from('sightings').select('*').eq('id', id);
  const { data: anonRows } = await anon.from('sightings').select('*').eq('id', id);
  const { data: bobDetails } = await bob.from('sighting_details').select('*').eq('sighting_id', id);
  return { bob: bobRows[0], anon: anonRows[0], bobDetails };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('private sightings, notes and photos', () => {
  it('a private sighting is the diver\'s alone, and comes back whole on their other phone', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ visibility: 'private', notes: 'secret pinnacle', photoUri: 'file:///kept/manta.jpg' });
    const result = await p.sync();
    expect(result.failed).toBe(0);

    const row = server.sighting(s.id)!;
    expect(row).toMatchObject({ visibility: 'private', notes: null, photo_url: null });
    const path = photoObjectPath(A, s.id, 'file:///kept/manta.jpg');
    expect(server.details(s.id)).toMatchObject({ user_id: A, notes: 'secret pinnacle', photo_path: path });
    expect([...server.privateFiles.keys()]).toEqual([path]);
    expect(server.files.size).toBe(0);
    expect(await seenByOthers(server, s.id)).toEqual({ bob: undefined, anon: undefined, bobDetails: [] });
    expect(await p.get(s.id)).toMatchObject({ synced: true, photoUri: `private:${path}`, notes: 'secret pinnacle' });

    // Another diver's feed never holds it.
    const bob = phone(server, 'bob', B);
    await bob.ready();
    await bob.sync();
    expect(await bob.get(s.id)).toBeUndefined();

    // The diver's own tablet restores it, notes and photo included.
    const tablet = phone(server, 'alice-tablet', A);
    await tablet.ready();
    await tablet.sync();
    expect(await tablet.get(s.id)).toMatchObject({
      visibility: 'private', notes: 'secret pinnacle', photoUri: `private:${path}`, notesPrivate: true, photoPrivate: true,
    });
  });

  it('a shared sighting can keep its notes and photo private', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ visibility: 'public', notes: 'the boat crew\'s spot', notesPrivate: true, photoUri: 'file:///kept/me.jpg', photoPrivate: true });
    await p.sync();

    const others = await seenByOthers(server, s.id);
    expect(others.bob).toMatchObject({ species_id: 'reef-manta', notes: null, photo_url: null, visibility: 'public' });
    expect(others.anon).toMatchObject({ notes: null, photo_url: null });
    expect(others.bobDetails).toEqual([]);
    expect(server.files.size).toBe(0);
    expect(server.details(s.id)).toMatchObject({ notes: 'the boat crew\'s spot' });

    const tablet = phone(server, 'alice-tablet', A);
    await tablet.ready();
    await tablet.sync();
    expect(await tablet.get(s.id)).toMatchObject({ visibility: 'public', notes: 'the boat crew\'s spot', notesPrivate: true, photoPrivate: true });
  });

  it('shared notes and photo go on the public row, as before', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ visibility: 'public', notes: 'huge', photoUri: 'file:///kept/shared.jpg' });
    await p.sync();
    expect(server.sighting(s.id)).toMatchObject({ notes: 'huge', photo_url: expect.stringMatching(PUBLIC_PHOTO) });
    expect(server.details(s.id)).toBeUndefined();
    expect(server.privateFiles.size).toBe(0);
  });

  it('changing your mind moves the photo and notes, and leaves nothing behind in public', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ visibility: 'public', notes: 'first dive', photoUri: 'file:///kept/move.jpg' });
    await p.sync();
    const path = photoObjectPath(A, s.id, 'file:///kept/move.jpg');
    expect(server.files.has(path)).toBe(true);

    // Keep the photo and notes private.
    await p.edit(s.id, { notesPrivate: true, photoPrivate: true });
    expect((await p.sync()).failed).toBe(0);
    expect(server.sighting(s.id)).toMatchObject({ notes: null, photo_url: null });
    expect(server.files.has(path)).toBe(false);
    expect(server.privateFiles.has(path)).toBe(true);
    expect(server.details(s.id)).toMatchObject({ notes: 'first dive', photo_path: path });
    expect((await p.get(s.id))?.photoUri).toBe(`private:${path}`);

    // Then the whole sighting.
    await p.edit(s.id, { visibility: 'private' });
    await p.sync();
    expect((await seenByOthers(server, s.id)).bob).toBeUndefined();

    // And share it all again.
    await p.edit(s.id, { visibility: 'public', notesPrivate: false, photoPrivate: false });
    expect((await p.sync()).failed).toBe(0);
    expect((await seenByOthers(server, s.id)).bob).toMatchObject({ notes: 'first dive', photo_url: expect.stringMatching(PUBLIC_PHOTO) });
    expect(server.files.has(path)).toBe(true);
    expect(server.privateFiles.has(path)).toBe(false);
    expect(server.details(s.id)).toBeUndefined();
  });

  it('a move interrupted after the public copy was removed finishes on the next sync', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ photoUri: 'file:///kept/retry.jpg' });
    await p.sync();
    const path = photoObjectPath(A, s.id, 'file:///kept/retry.jpg');

    await p.edit(s.id, { photoPrivate: true });
    // Everything reaches the server, but the app is closed before it hears back.
    const lost = await p.sync({ markPushed: async () => { throw new Error('app closed'); } });
    expect(lost.failed).toBe(1);
    expect(server.files.has(path)).toBe(false);

    expect((await p.sync()).failed).toBe(0);
    expect(server.privateFiles.has(path)).toBe(true);
    expect(server.sighting(s.id)?.photo_url).toBeNull();
    expect(await p.get(s.id)).toMatchObject({ synced: true, photoUri: `private:${path}` });
  });

  it('deleting a private sighting removes its private photo and notes', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ visibility: 'private', notes: 'n', photoUri: 'file:///kept/gone.jpg' });
    await p.sync();
    expect(server.privateFiles.size).toBe(1);

    await p.db.deleteSighting(s.id, { pendingSync: true });
    expect((await p.sync()).deletedSightings).toBe(1);
    expect(server.sighting(s.id)).toBeUndefined();
    expect(server.details(s.id)).toBeUndefined();
    expect(server.privateFiles.size).toBe(0);
  });

  describe('on a project without migration 0008', () => {
    it('public sightings keep syncing', async () => {
      const server = newServer();
      server.privacy = false;
      const p = phone(server, 'alice', A);
      await p.ready();
      const s = await p.log({ visibility: 'public', notes: 'ok', photoUri: 'file:///kept/old.jpg' });
      const result = await p.sync();
      expect(result.failed).toBe(0);
      expect(server.sighting(s.id)).toMatchObject({ notes: 'ok', photo_url: expect.stringMatching(PUBLIC_PHOTO) });
      expect(server.sighting(s.id)).not.toHaveProperty('visibility');
      expect(await p.get(s.id)).toMatchObject({ synced: true });
    });

    it('nothing private is sent: it waits on the phone, then goes once the server is ready', async () => {
      const server = newServer();
      server.privacy = false;
      const p = phone(server, 'alice', A);
      await p.ready();
      const hidden = await p.log({ visibility: 'private', notes: 'hidden', photoUri: 'file:///kept/h.jpg' });
      const notes = await p.log({ visibility: 'public', notes: 'only mine', notesPrivate: true });
      const photo = await p.log({ visibility: 'public', photoUri: 'file:///kept/p.jpg', photoPrivate: true });

      const result = await p.sync();
      expect(result.failed).toBe(3);
      expect(server.sighting(hidden.id)).toBeUndefined();
      expect(server.sighting(photo.id)).toBeUndefined();
      // The sighting itself is shared, so its row may go, but never with the private notes.
      expect(server.sighting(notes.id)?.notes ?? null).toBeNull();
      expect(server.files.size).toBe(0);
      for (const id of [hidden.id, notes.id, photo.id]) {
        expect(await p.get(id)).toMatchObject({ synced: false, syncError: expect.stringMatching(/migration 0008/) });
      }

      server.privacy = true;
      expect((await p.sync()).failed).toBe(0);
      expect(server.sighting(hidden.id)).toMatchObject({ visibility: 'private', notes: null });
      expect(server.details(notes.id)).toMatchObject({ notes: 'only mine' });
      expect(server.sighting(photo.id)?.photo_url).toBeNull();
      expect(server.privateFiles.size).toBe(2);
      expect(server.files.size).toBe(0);
    });

    it('a shared sighting made private there keeps its old public copy until the server is ready', async () => {
      const server = newServer();
      server.privacy = false;
      const p = phone(server, 'alice', A);
      await p.ready();
      const s = await p.log({ notes: 'was shared' });
      await p.sync();
      await p.edit(s.id, { visibility: 'private' });
      expect((await p.sync()).failed).toBe(1);
      // Unchanged: nothing new was sent, and the phone says why.
      expect(server.sighting(s.id)).toMatchObject({ notes: 'was shared' });
      expect((await p.get(s.id))?.syncError).toMatch(/migration 0008/);
    });
  });

  it('a pull that says nothing about visibility never makes a private sighting look shared', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ visibility: 'private' });
    await p.sync();
    const copy = { ...(await p.get(s.id))!, visibility: undefined, synced: true };
    await p.db.mergePulledSightings([copy], { ownerId: A, ownComplete: true, communitySince: null });
    expect((await p.get(s.id))?.visibility).toBe('private');
  });

  it('the private bucket answers only its owner', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const s = await p.log({ visibility: 'private', photoUri: 'file:///kept/x.jpg' });
    await p.sync();
    const path = photoObjectPath(A, s.id, 'file:///kept/x.jpg');
    const mine = await p.device.client.storage.from(PRIVATE_BUCKET).createSignedUrl(path, 60);
    expect(mine.error).toBeNull();
    const bobs = await server.device('bob', B).client.storage.from(PRIVATE_BUCKET).createSignedUrl(path, 60);
    expect(bobs.data).toBeNull();
  });
});
