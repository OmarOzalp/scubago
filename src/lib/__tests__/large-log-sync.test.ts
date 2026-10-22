/**
 * A log bigger than one reply from the server, end to end: PostgREST returns at most max_rows
 * (1000) rows, whatever limit a query asks for. Every one of the diver's sightings, private notes,
 * pages and signatures must still come back, and nothing may be taken for deleted because a reply
 * was cut short.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { describe, expect, it, jest } from '@jest/globals';

import { FakeServer } from '@/test-support/fake-supabase';
import { hasNodeSqlite } from '@/test-support/node-sqlite';
import { applyEdit } from '@/lib/sighting-edit';
import type { Sighting } from '@/lib/types';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());

type Db = typeof import('@/lib/db');
type SyncService = typeof import('@/lib/sync-service');

const A = 'uid-a';
const B = 'uid-b';
const COUNT = 1010;
const T0 = Date.parse('2024-01-01T00:00:00Z');

const at = (i: number) => new Date(T0 + i * 60_000).toISOString();

/** A server holding COUNT of the diver's sightings, each with notes only they can read. */
function serverWithSightings(): FakeServer {
  const server = new FakeServer();
  server.tables.profiles.push({ user_id: A, username: 'alice' }, { user_id: B, username: 'bob' });
  for (let i = 0; i < COUNT; i++) {
    server.seedSighting({ id: `s-${i}`, user_id: A, visibility: 'public', created_at: at(i) });
    server.tables.sighting_details.push({ sighting_id: `s-${i}`, user_id: A, notes: `note ${i}`, photo_path: null });
  }
  return server;
}

function phone(server: FakeServer, name: string, userId: string) {
  let db!: Db;
  let sync!: SyncService;
  jest.isolateModules(() => {
    db = require('@/lib/db');
    sync = require('@/lib/sync-service');
  });
  const device = server.device(name, userId);
  const all = () => db.loadAll();
  return {
    db,
    all,
    ready: () => db.initDb({ demo: false }),
    sync: () => sync.syncNow(device.client, userId, { discardLocalPhoto: () => {} }),
    mine: async () => (await all()).sightings.filter((s) => s.userId === userId),
  };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('a log bigger than one reply from the server', () => {
  it('a new phone restores every sighting, each with its private notes', async () => {
    const server = serverWithSightings();
    const tablet = phone(server, 'alice-tablet', A);
    await tablet.ready();
    await tablet.sync();

    const mine = await tablet.mine();
    expect(mine.length).toBe(COUNT);
    expect(mine.filter((s) => s.notes !== `note ${s.id.slice(2)}` || !s.notesPrivate)).toEqual([]);
  });

  it('a phone that has them all keeps them all, and an edit keeps the private notes on the server', async () => {
    const server = serverWithSightings();
    const p = phone(server, 'alice', A);
    await p.ready();
    // Pulled back when the log was smaller: every sighting is here, synced.
    const had: Sighting[] = Array.from({ length: COUNT }, (_, i) => ({
      id: `s-${i}`, userId: A, username: 'alice', speciesId: 'reef-manta', siteId: 'blue-corner', sightedOn: '2025-01-01',
      notes: `note ${i}`, notesPrivate: true, visibility: 'public', isDemo: false, synced: true, createdAt: at(i),
    }));
    await p.db.mergePulledSightings(had, { ownerId: A, ownComplete: false, communitySince: null });

    await p.sync();
    const mine = await p.mine();
    expect(mine.length).toBe(COUNT);
    expect(mine.filter((s) => !s.notes)).toEqual([]);

    // The diver corrects the species on the oldest and the newest; their notes stay theirs.
    for (const id of ['s-0', `s-${COUNT - 1}`]) {
      const before = mine.find((s) => s.id === id)!;
      await p.db.updateSighting(applyEdit(before, { ...before, speciesId: 'whale-shark' }, new Date().toISOString()));
    }
    expect((await p.sync()).failed).toBe(0);
    expect(server.details('s-0')).toMatchObject({ notes: 'note 0' });
    expect(server.details(`s-${COUNT - 1}`)).toMatchObject({ notes: `note ${COUNT - 1}` });
    expect(server.sighting('s-0')).toMatchObject({ species_id: 'whale-shark', notes: null });
  });

  it('a new phone restores every page, with every signature buddies sent', async () => {
    const server = new FakeServer();
    server.tables.profiles.push({ user_id: A, username: 'alice' }, { user_id: B, username: 'bob' });
    for (let i = 0; i < COUNT; i++) {
      server.tables.dives.push({ id: `d-${i}`, user_id: A, number: i + 1, site_id: 'blue-corner', dived_on: '2025-01-01', created_at: at(i) });
      server.tables.dive_signatures.push({
        id: `sig-${i}`, dive_id: `d-${i}`, signer_id: B, signer_name: 'Bob', role: 'buddy', signature_svg: null, created_at: at(i),
      });
    }
    const tablet = phone(server, 'alice-tablet', A);
    await tablet.ready();
    await tablet.sync();

    const { dives } = await tablet.all();
    expect(dives.length).toBe(COUNT);
    expect(dives.filter((d) => d.remoteSignatures?.[0]?.name !== 'Bob')).toEqual([]);
  });
});
