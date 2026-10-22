/**
 * The dive log offline and across phones, end to end: the app's real SQLite code (on Node's built-in
 * SQLite) and real sync, against an in-memory server that enforces the same rules as migration 0009
 * (a diver's pages are theirs alone; a sighting may only point at its owner's page).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { describe, expect, it, jest } from '@jest/globals';

import { FakeServer, type FakeDevice } from '@/test-support/fake-supabase';
import { hasNodeSqlite } from '@/test-support/node-sqlite';
import type { Dive, Sighting } from '@/lib/types';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());

type Db = typeof import('@/lib/db');
type SyncService = typeof import('@/lib/sync-service');

const A = 'uid-a';
const B = 'uid-b';

function newServer(): FakeServer {
  const server = new FakeServer();
  server.tables.profiles.push({ user_id: A, username: 'alice' }, { user_id: B, username: 'bob' });
  return server;
}

let counter = 0;

function phone(server: FakeServer, name: string, userId: string) {
  let db!: Db;
  let sync!: SyncService;
  jest.isolateModules(() => {
    db = require('@/lib/db');
    sync = require('@/lib/sync-service');
  });
  const device: FakeDevice = server.device(name, userId);
  const all = () => db.loadAll();
  return {
    db,
    device,
    ready: () => db.initDb({ demo: false }),
    sync: () => sync.syncNow(device.client, userId, { discardLocalPhoto: () => {} }),
    /** Write a page and its sightings, as the store does. */
    write: async (over: Partial<Dive> = {}, species: string[] = ['reef-manta']) => {
      const id = `d-${++counter}`;
      const dive: Dive = {
        id, userId, number: counter, siteId: 'blue-corner', divedOn: '2026-10-01', synced: false,
        createdAt: new Date(Date.now() + counter).toISOString(), maxDepthM: 24, bottomTimeMin: 48, ...over,
      };
      const sightings: Sighting[] = species.map((speciesId, i) => ({
        id: `s-${counter}-${i}`, userId, username: name, speciesId, siteId: dive.siteId, sightedOn: dive.divedOn,
        diveId: dive.id, isDemo: false, synced: false, createdAt: new Date(Date.now() + counter + i).toISOString(),
      }));
      await db.insertDive(dive, sightings);
      return { dive, sightings };
    },
    /** Add an animal to a page, as the store does. */
    addTo: async (dive: Dive, speciesId = 'whale-shark') => {
      const s: Sighting = {
        id: `s-${++counter}-x`, userId, username: name, speciesId, siteId: dive.siteId, sightedOn: dive.divedOn,
        diveId: dive.id, isDemo: false, synced: false, createdAt: new Date(Date.now() + counter).toISOString(),
      };
      await db.insertSighting(s);
      return s;
    },
    dive: async (id: string) => (await all()).dives.find((d) => d.id === id),
    sighting: async (id: string) => (await all()).sightings.find((s) => s.id === id),
    all,
  };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('the dive log, offline and across phones', () => {
  it('a page written offline reaches the server before the sightings that point at it', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const { dive, sightings } = await p.write({ number: 49, buddyName: 'Maya', kinds: ['drift', 'wall'] }, ['reef-manta', 'grey-reef-shark']);

    p.device.online = false;
    await expect(p.sync()).rejects.toBeTruthy();
    expect(server.dive(dive.id)).toBeUndefined();

    p.device.online = true;
    const result = await p.sync();
    expect(result).toMatchObject({ failed: 0, pushedDives: 1, pushedSightings: 2 });
    expect(server.dive(dive.id)).toMatchObject({ user_id: A, number: 49, buddy_name: 'Maya', kinds: ['drift', 'wall'], max_depth_m: 24 });
    for (const s of sightings) expect(server.sighting(s.id)).toMatchObject({ dive_id: dive.id });
    const order = server.calls.map((c) => `${c.table}:${c.op}`);
    expect(order.indexOf('dives:upsert')).toBeLessThan(order.indexOf('sightings:upsert'));
    expect(await p.dive(dive.id)).toMatchObject({ synced: true });
  });

  it('a page edited offline syncs its changes; a new site or day moves its sightings with it', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const { dive, sightings } = await p.write();
    await p.sync();

    p.device.online = false;
    const edited: Dive = { ...dive, siteId: 'german-channel', divedOn: '2026-10-02', notes: 'strong current', updatedAt: new Date().toISOString() };
    const moved: Sighting[] = sightings.map((s) => ({ ...s, siteId: 'german-channel', sightedOn: '2026-10-02' }));
    await p.db.updateDive(edited, moved);
    await expect(p.sync()).rejects.toBeTruthy();
    expect(server.dive(dive.id)?.notes ?? null).toBeNull();

    p.device.online = true;
    await p.sync();
    expect(server.dive(dive.id)).toMatchObject({ site_id: 'german-channel', dived_on: '2026-10-02', notes: 'strong current' });
    expect(server.sighting(sightings[0].id)).toMatchObject({ site_id: 'german-channel', sighted_on: '2026-10-02', dive_id: dive.id });
  });

  it('deleting a page deletes its sightings, then the page, on the server', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const { dive, sightings } = await p.write({}, ['reef-manta', 'whale-shark']);
    await p.sync();

    await p.db.deleteDive(dive.id, sightings.map((s) => s.id), { pendingSync: true });
    expect(await p.dive(dive.id)).toBeUndefined();
    expect((await p.all()).diveDeletions.map((d) => d.id)).toEqual([dive.id]);
    await p.sync();
    expect(server.dive(dive.id)).toBeUndefined();
    for (const s of sightings) expect(server.sighting(s.id)).toBeUndefined();
    const order = server.calls.filter((c) => c.op === 'delete').map((c) => c.table);
    expect(order.lastIndexOf('sightings')).toBeLessThan(order.indexOf('dives'));
    expect((await p.all()).diveDeletions).toEqual([]);
  });

  it('a project without the dive log keeps syncing sightings; the pages follow once it is updated', async () => {
    const server = newServer();
    server.diveLog = false;
    const p = phone(server, 'alice', A);
    await p.ready();
    const { dive, sightings } = await p.write();

    const before = await p.sync();
    expect(before.failed).toBe(1);
    expect(server.sighting(sightings[0].id)).toMatchObject({ species_id: 'reef-manta' });
    expect(server.sighting(sightings[0].id)).not.toHaveProperty('dive_id');
    expect(await p.dive(dive.id)).toMatchObject({ synced: false, syncError: expect.stringMatching(/dive log/) });
    // The sighting keeps its page here.
    expect(await p.sighting(sightings[0].id)).toMatchObject({ diveId: dive.id, synced: true });

    // The migration is applied: the page goes up, and the sighting is sent again with it.
    server.diveLog = true;
    await p.sync();
    expect(server.dive(dive.id)).toMatchObject({ number: dive.number });
    await p.sync();
    expect(server.sighting(sightings[0].id)).toMatchObject({ dive_id: dive.id });
    expect(await p.sighting(sightings[0].id)).toMatchObject({ diveId: dive.id, synced: true });
    expect(await p.dive(dive.id)).toMatchObject({ synced: true, syncError: undefined });
  });

  it('a page at a site the server doesn’t have yet waits with a plain reason, and goes up once the site is seeded', async () => {
    const server = newServer();
    server.seededSites = new Set(['blue-corner']);
    const p = phone(server, 'alice', A);
    await p.ready();
    // A catalogue site newer than the project's last seed (an OpenStreetMap import, say).
    const { dive, sightings } = await p.write({ siteId: 'osm-node-1234' });

    const before = await p.sync();
    expect(before.failed).toBe(2);
    expect(server.dive(dive.id)).toBeUndefined();
    const waiting = await p.dive(dive.id);
    expect(waiting).toMatchObject({ synced: false, syncError: expect.stringMatching(/doesn’t have this dive site yet, so the page is waiting/) });
    expect(waiting?.syncError).not.toMatch(/foreign key/);
    expect(await p.sighting(sightings[0].id)).toMatchObject({ synced: false, syncError: 'Waiting for its dive to sync.' });

    // The project's owner runs the seed: the page and its sighting go up on the next sync.
    server.seededSites.add('osm-node-1234');
    const after = await p.sync();
    expect(after).toMatchObject({ failed: 0, pushedDives: 1, pushedSightings: 1 });
    expect(server.dive(dive.id)).toMatchObject({ site_id: 'osm-node-1234' });
    expect(server.sighting(sightings[0].id)).toMatchObject({ site_id: 'osm-node-1234', dive_id: dive.id });
    expect(await p.dive(dive.id)).toMatchObject({ synced: true, syncError: undefined });

    // Moving a synced page to a site the server lacks waits the same way, and keeps the old one there.
    const current = (await p.dive(dive.id))!;
    await p.db.updateDive({ ...current, siteId: 'osm-node-5678', updatedAt: new Date().toISOString() });
    await p.sync();
    expect(server.dive(dive.id)).toMatchObject({ site_id: 'osm-node-1234' });
    expect(await p.dive(dive.id)).toMatchObject({ synced: false, syncError: expect.stringMatching(/doesn’t have this dive site yet/) });
  });

  it('without the dive log, a sighting at a site the server doesn’t have yet says so too', async () => {
    const server = newServer();
    server.diveLog = false;
    server.seededSites = new Set(['blue-corner']);
    const p = phone(server, 'alice', A);
    await p.ready();
    const { sightings } = await p.write({ siteId: 'osm-node-1234' });

    await p.sync();
    expect(server.sighting(sightings[0].id)).toBeUndefined();
    expect(await p.sighting(sightings[0].id)).toMatchObject({
      synced: false,
      syncError: expect.stringMatching(/doesn’t have this dive site yet, so the sighting is waiting/),
    });
  });

  it('a new phone restores every page, with the signatures buddies sent for them', async () => {
    const server = newServer();
    const first = phone(server, 'alice', A);
    await first.ready();
    const { dive, sightings } = await first.write({ number: 121, signature: { name: 'Maya', svg: 'M1,1L20,20', at: '2026-10-01T12:00:00.000Z', role: 'buddy' } });
    await first.sync();
    server.tables.dive_signatures.push(
      { dive_id: dive.id, signer_id: B, signer_name: 'Bob Guide', role: 'guide', signature_svg: 'M5,5L50,40', created_at: '2026-10-02T08:00:00+00:00' },
      // Something no app would draw is dropped, not shown.
      { dive_id: dive.id, signer_id: 'uid-c', signer_name: 'Mallory', role: 'buddy', signature_svg: '<svg onload=x>', created_at: '2026-10-03T08:00:00+00:00' },
    );

    const second = phone(server, 'alice-tablet', A);
    await second.ready();
    await second.sync();
    const restored = await second.dive(dive.id);
    expect(restored).toMatchObject({ number: 121, maxDepthM: 24, signature: { name: 'Maya', svg: 'M1,1L20,20', role: 'buddy' } });
    expect(restored?.remoteSignatures).toEqual([
      { name: 'Bob Guide', svg: 'M5,5L50,40', role: 'guide', at: '2026-10-02T08:00:00.000Z' },
      { name: 'Mallory', role: 'buddy', at: '2026-10-03T08:00:00.000Z' },
    ]);
    expect(await second.sighting(sightings[0].id)).toMatchObject({ diveId: dive.id });
  });

  it('a signed page moved to another day loses its signatures here and on the server', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const { dive } = await p.write({ signature: { name: 'Maya', svg: 'M1,1L20,20', at: '2026-10-01T12:00:00.000Z' } });
    await p.sync();
    server.tables.dive_signatures.push({ dive_id: dive.id, signer_id: B, signer_name: 'Bob', role: 'buddy', signature_svg: null, created_at: '2026-10-02T08:00:00+00:00' });
    await p.sync();
    expect((await p.dive(dive.id))?.remoteSignatures).toHaveLength(1);

    // Renumbered: the same dive, still signed.
    await p.db.setDivesBefore(A, 10, 10);
    await p.sync();
    expect(server.dive(dive.id)).toMatchObject({ number: dive.number + 10, signature_name: 'Maya' });
    expect(server.tables.dive_signatures).toHaveLength(1);

    // Moved to another day (as the store saves it): the signatures were for the old one.
    const current = (await p.dive(dive.id))!;
    await p.db.updateDive({ ...current, divedOn: '2026-10-02', signature: undefined, remoteSignatures: undefined, updatedAt: new Date().toISOString() });
    expect((await p.dive(dive.id))?.remoteSignatures).toBeUndefined();
    await p.sync();
    expect(server.dive(dive.id)).toMatchObject({ dived_on: '2026-10-02', signature_name: null });
    expect(server.tables.dive_signatures).toEqual([]);
    const after = await p.dive(dive.id);
    expect(after?.synced).toBe(true);
    expect(after?.signature).toBeUndefined();
    expect(after?.remoteSignatures).toBeUndefined();
  });

  it('nobody else sees a diver’s pages, and a sighting can’t be put on someone else’s', async () => {
    const server = newServer();
    const alice = phone(server, 'alice', A);
    await alice.ready();
    const { dive } = await alice.write();
    await alice.sync();

    const bob = phone(server, 'bob', B);
    await bob.ready();
    await bob.sync();
    expect((await bob.all()).dives).toEqual([]);
    const hijack = await bob.device.client.from('sightings').insert({
      id: 's-bob', user_id: B, species_id: 'reef-manta', site_id: 'blue-corner', sighted_on: '2026-10-01', dive_id: dive.id,
    });
    expect(hijack.error?.code).toBe('42501');
  });

  it('a page deleted on another phone disappears here too', async () => {
    const server = newServer();
    const one = phone(server, 'alice', A);
    const two = phone(server, 'alice-tablet', A);
    await one.ready();
    await two.ready();
    const { dive, sightings } = await one.write();
    await one.sync();
    await two.sync();
    expect(await two.dive(dive.id)).toBeDefined();

    await one.db.deleteDive(dive.id, sightings.map((s) => s.id), { pendingSync: true });
    await one.sync();
    await two.sync();
    expect(await two.dive(dive.id)).toBeUndefined();
    expect(await two.sighting(sightings[0].id)).toBeUndefined();
  });

  it('an animal added offline to a page deleted on another phone goes up without the page', async () => {
    const server = newServer();
    const one = phone(server, 'alice', A);
    const two = phone(server, 'alice-tablet', A);
    await one.ready();
    await two.ready();
    const { dive, sightings } = await one.write();
    await one.sync();
    await two.sync();

    one.device.online = false;
    const extra = await one.addTo(dive);
    await two.db.deleteDive(dive.id, sightings.map((s) => s.id), { pendingSync: true });
    await two.sync();
    expect(server.dive(dive.id)).toBeUndefined();

    one.device.online = true;
    // The first sync still has the page here and learns it is gone; the next sends the animal without it.
    await one.sync();
    expect((await one.sync()).failed).toBe(0);
    expect(server.sighting(extra.id)).toMatchObject({ species_id: 'whale-shark' });
    expect(server.sighting(extra.id)?.dive_id ?? null).toBeNull();
    expect(await one.sighting(extra.id)).toMatchObject({ synced: true, diveId: undefined });
    expect(await one.dive(dive.id)).toBeUndefined();
  });

  it('an edit to a page deleted on another phone gives way to the deletion, sightings and all', async () => {
    const server = newServer();
    const one = phone(server, 'alice', A);
    const two = phone(server, 'alice-tablet', A);
    await one.ready();
    await two.ready();
    const { dive, sightings } = await one.write();
    await one.sync();
    await two.sync();

    one.device.online = false;
    await one.db.updateDive({ ...dive, divedOn: '2026-10-02', updatedAt: new Date().toISOString() }, [{ ...sightings[0], sightedOn: '2026-10-02' }]);
    await two.db.deleteDive(dive.id, sightings.map((s) => s.id), { pendingSync: true });
    await two.sync();

    one.device.online = true;
    const result = await one.sync();
    expect(result).toMatchObject({ failed: 0, droppedSightings: 1 });
    expect(await one.dive(dive.id)).toBeUndefined();
    expect(await one.sighting(sightings[0].id)).toBeUndefined();
    expect(server.dive(dive.id)).toBeUndefined();
    expect(server.sighting(sightings[0].id)).toBeUndefined();
  });

  it('renumbering after setting the dives logged before ScubaGo syncs every page', async () => {
    const server = newServer();
    const p = phone(server, 'alice', A);
    await p.ready();
    const a = await p.write({ number: 1 });
    const b = await p.write({ number: 2 });
    await p.sync();

    await p.db.setDivesBefore(A, 120, 120);
    expect((await p.all()).divesBefore[A]).toBe(120);
    await p.sync();
    expect(server.dive(a.dive.id)?.number).toBe(121);
    expect(server.dive(b.dive.id)?.number).toBe(122);
  });
});
