/**
 * The store actions behind the dive log's screens (write a page, add to it, edit, sign, delete,
 * renumber), on the app's real SQLite code, and the old log turned into pages on first launch.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and per-phone module copies need require() */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { SITES } from '@/data/sites';
import { localIsoDate, shiftIsoDate } from '@/lib/sighting-edit';
import { FakeServer } from '@/test-support/fake-supabase';
import { hasNodeSqlite, sqliteHooks } from '@/test-support/node-sqlite';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase ?? null,
}));

type Store = typeof import('@/lib/store');
type Db = typeof import('@/lib/db');

const A = 'uid-a';
const today = localIsoDate(new Date());
const yesterday = shiftIsoDate(today, -1);
const reef = SITES[0].id;
const wall = SITES[1].id;

async function openApp(client: unknown = null): Promise<{ store: Store; db: Db; app: () => ReturnType<Store['useAppStore']['getState']> }> {
  (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase = client ?? undefined;
  let store!: Store;
  let db!: Db;
  jest.isolateModules(() => {
    store = require('@/lib/store');
    db = require('@/lib/db');
  });
  await store.useAppStore.getState().init();
  return { store, db, app: store.useAppStore.getState };
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('the dive log in the app', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    sqliteHooks.onOpen = null;
  });

  it('writes a page with what was seen on it; the sightings take the page’s site and date', async () => {
    const { db, app } = await openApp();
    const { dive, sightings, newSpeciesIds } = await app().logDive({
      dive: { number: 1, siteId: reef, divedOn: yesterday, maxDepthM: 18.25, bottomTimeMin: 45, buddyName: '  Maya  ', kinds: ['reef', 'reef'] },
      sightings: [{ speciesId: 'reef-manta' }, { speciesId: 'whale-shark', notes: ' huge ' }],
    });
    // Tidied as it's kept: depth to a tenth, names trimmed, a kind once.
    expect(dive).toMatchObject({ number: 1, maxDepthM: 18.3, buddyName: 'Maya', kinds: ['reef'], synced: false });
    expect(sightings.map((s) => [s.speciesId, s.siteId, s.sightedOn, s.diveId, s.notes])).toEqual([
      ['reef-manta', reef, yesterday, dive.id, undefined],
      ['whale-shark', reef, yesterday, dive.id, 'huge'],
    ]);
    expect(newSpeciesIds).toEqual(['reef-manta', 'whale-shark']);
    const saved = await db.loadAll();
    expect(saved.dives.map((d) => d.id)).toEqual([dive.id]);
    expect(saved.sightings.filter((s) => s.diveId === dive.id)).toHaveLength(2);
  });

  it('a page can have no animals; the next page is numbered after it', async () => {
    const { app, store } = await openApp();
    await app().logDive({ dive: { number: 1, siteId: reef, divedOn: today }, sightings: [] });
    expect(app().dives).toHaveLength(1);
    const { nextDiveNumber } = require('@/lib/dives') as typeof import('@/lib/dives');
    expect(nextDiveNumber(app().dives, app().divesBefore[store.LOCAL_USER_ID] ?? 0)).toBe(2);
  });

  it('refuses a page that can’t be right, and saves nothing of it', async () => {
    const { app } = await openApp();
    await expect(app().logDive({ dive: { number: 1, siteId: reef, divedOn: shiftIsoDate(today, 2) }, sightings: [{ speciesId: 'reef-manta' }] })).rejects.toThrow(/future/);
    await expect(app().logDive({ dive: { number: 1, siteId: reef, divedOn: today, maxDepthM: 400 }, sightings: [] })).rejects.toThrow(/between 0 and 350/);
    await expect(app().logDive({ dive: { number: 1, siteId: 'nowhere', divedOn: today }, sightings: [] })).rejects.toThrow(/site/);
    expect(app().dives).toEqual([]);
    expect(app().sightings.filter((s) => !s.isDemo)).toEqual([]);
  });

  it('animals added to a page later go on it, at its site and date', async () => {
    const { app } = await openApp();
    const { dive } = await app().logDive({ dive: { number: 7, siteId: reef, divedOn: yesterday }, sightings: [] });
    const { sightings } = await app().addSightings([{ speciesId: 'green-turtle', siteId: wall, sightedOn: today, diveId: dive.id }]);
    expect(sightings[0]).toMatchObject({ siteId: reef, sightedOn: yesterday, diveId: dive.id });
  });

  it('moving a page to another site moves its sightings, and their confirmations no longer apply', async () => {
    const { app, store } = await openApp();
    const { dive, sightings } = await app().logDive({ dive: { number: 3, siteId: reef, divedOn: yesterday }, sightings: [{ speciesId: 'reef-manta' }] });
    // As if a buddy had confirmed it.
    store.useAppStore.setState({ sightings: app().sightings.map((s) => (s.id === sightings[0].id ? { ...s, status: 'confirmed' as const } : s)) });

    const { id: _id, userId: _u, synced: _s, createdAt: _c, ...fields } = dive;
    await app().updateDive(dive.id, { ...fields, notes: 'just notes' });
    expect(app().sightings.find((s) => s.id === sightings[0].id)?.status).toBe('confirmed');

    const moved = await app().updateDive(dive.id, { ...fields, siteId: wall });
    expect(moved.siteId).toBe(wall);
    expect(moved.notes).toBeUndefined(); // the fields given are the page: the notes were left out
    expect(app().sightings.find((s) => s.id === sightings[0].id)).toMatchObject({ siteId: wall, status: 'unverified', synced: false });
  });

  it('signs a page on the phone, and takes the signature off again', async () => {
    const { app, db } = await openApp();
    const { dive } = await app().logDive({ dive: { number: 50, siteId: reef, divedOn: today, notes: 'kept' }, sightings: [] });
    const signature = { name: 'Maya', svg: 'M1,1L20,20', role: 'buddy' as const, at: new Date().toISOString() };
    await app().signDive(dive.id, signature);
    expect(app().dives[0]).toMatchObject({ signature, notes: 'kept' });
    expect((await db.loadAll()).dives[0].signature).toEqual(signature);
    await app().signDive(dive.id, null);
    expect(app().dives[0].signature).toBeUndefined();
    expect(app().dives[0].notes).toBe('kept');
  });

  it('a page moved to another day loses its signatures; new notes or a new number keep them', async () => {
    const { app, db } = await openApp();
    const { dive } = await app().logDive({ dive: { number: 5, siteId: reef, divedOn: yesterday }, sightings: [] });
    const signature = { name: 'Maya', svg: 'M1,1L20,20', at: new Date().toISOString() };
    const signed = await app().signDive(dive.id, signature);
    const { id: _id, userId: _u, synced: _s, createdAt: _c, updatedAt: _up, ...fields } = signed;
    expect((await app().updateDive(dive.id, { ...fields, number: 6, notes: 'calm' })).signature).toEqual(signature);
    const moved = await app().updateDive(dive.id, { ...fields, number: 6, divedOn: today });
    expect(moved.signature).toBeUndefined();
    expect((await db.loadAll()).dives[0].signature).toBeUndefined();
  });

  it('deleting a page deletes the sightings on it', async () => {
    const { app, db } = await openApp();
    const { dive } = await app().logDive({ dive: { number: 1, siteId: reef, divedOn: today }, sightings: [{ speciesId: 'reef-manta' }] });
    await app().deleteDive(dive.id);
    expect(app().dives).toEqual([]);
    expect(app().sightings.filter((s) => !s.isDemo)).toEqual([]);
    const saved = await db.loadAll();
    expect(saved.dives).toEqual([]);
    expect(saved.diveDeletions).toEqual([]); // a log that never left the phone has no server to tell
  });

  it('dives logged before ScubaGo renumber every page, never below No. 1', async () => {
    const { app, store } = await openApp();
    await app().logDive({ dive: { number: 1, siteId: reef, divedOn: yesterday }, sightings: [] });
    await app().logDive({ dive: { number: 2, siteId: reef, divedOn: today }, sightings: [] });
    await app().setDivesBefore(120);
    expect(app().dives.map((d) => d.number).sort()).toEqual([121, 122]);
    expect(app().divesBefore[store.LOCAL_USER_ID]).toBe(120);
    await app().setDivesBefore(100);
    expect(app().dives.map((d) => d.number).sort()).toEqual([101, 102]);
    await expect(app().setDivesBefore(-5)).resolves.toBeUndefined(); // read as 0
    expect(app().dives.map((d) => d.number).sort()).toEqual([1, 2]);
  });

  it('a page belongs to its diver: nobody else’s can be changed', async () => {
    const { app } = await openApp();
    await expect(app().updateDive('d-not-mine', { number: 1, siteId: reef, divedOn: today })).rejects.toThrow('This dive isn’t in your log.');
    await expect(app().deleteDive('d-not-mine')).rejects.toThrow('This dive isn’t in your log.');
  });

  it('on first launch with the dive log, earlier sightings become pages: one per site and day, oldest first', async () => {
    sqliteHooks.onOpen = (raw) => {
      raw.exec(`
        CREATE TABLE sightings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
          species_id TEXT NOT NULL, site_id TEXT NOT NULL, sighted_on TEXT NOT NULL, notes TEXT, photo_uri TEXT,
          is_demo INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE user_sites (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
          region TEXT NOT NULL, country TEXT NOT NULL, blurb TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL);
        INSERT INTO sightings VALUES
          ('s-3', 'local', 'you', 'reef-manta', '${wall}', '2026-03-02', NULL, NULL, 0, 0, '2026-03-02T09:00:00.000Z'),
          ('s-1', 'local', 'you', 'reef-manta', '${reef}', '2026-03-01', NULL, NULL, 0, 0, '2026-03-01T09:00:00.000Z'),
          ('s-2', 'local', 'you', 'whale-shark', '${reef}', '2026-03-01', NULL, NULL, 0, 0, '2026-03-01T09:05:00.000Z');
        PRAGMA user_version = 2;
      `);
    };
    const { app } = await openApp();
    const pages = [...app().dives].sort((a, b) => a.number - b.number);
    expect(pages.map((d) => [d.number, d.siteId, d.divedOn, d.fromSightings])).toEqual([
      [1, reef, '2026-03-01', true],
      [2, wall, '2026-03-02', true],
    ]);
    const on = (id: string) => app().sightings.find((s) => s.id === id)?.diveId;
    expect([on('s-1'), on('s-2'), on('s-3')]).toEqual([pages[0].id, pages[0].id, pages[1].id]);
  });

  // One page in an odd shape (a hand-edited or half-written row) blocked the whole log behind "Your log
  // couldn't be opened (Invalid time value)": the app now opens, and only the odd values are left out.
  it('a page whose stored values are unreadable does not stop the log opening', async () => {
    const { db } = await openApp();
    sqliteHooks.last.exec(`
      INSERT INTO dives (id, user_id, number, site_id, dived_on, max_depth_m, kinds, signature_name, signed_at, remote_signatures, created_at)
      VALUES ('d-odd', 'local', 3, '${reef}', '2026-03-01', 'deep', '{not json', 'Maya', 'yesterday-ish', '[{oops', '2026-03-01T09:00:00.000Z');
    `);
    // What opening the app reads (initDb and every reload read the log the same way).
    const local = await db.loadAll();
    const odd = local.dives.find((d) => d.id === 'd-odd');
    expect(odd).toMatchObject({ number: 3, siteId: reef, divedOn: '2026-03-01' });
    expect(odd?.signature).toBeUndefined();
    expect(odd?.maxDepthM).toBeUndefined();
    expect(odd?.kinds).toBeUndefined();
    expect(odd?.remoteSignatures).toBeUndefined();
  });

  it('signed in, a sighting from an older app on another phone gets its page after a sync', async () => {
    const server = new FakeServer();
    server.tables.profiles.push({ user_id: A, username: 'alice' });
    server.tables.sightings.push({
      id: 's-old-app', user_id: A, species_id: 'reef-manta', site_id: reef, sighted_on: yesterday, notes: null, photo_url: null,
      created_at: '2026-10-01T09:00:00.000Z', updated_at: null, status: 'unverified', is_demo: false,
    });
    const { app } = await openApp(server.device('phone', A).client);
    await app().requestSync();
    const sighting = app().sightings.find((s) => s.id === 's-old-app');
    expect(sighting?.diveId).toBeDefined();
    expect(app().dives.find((d) => d.id === sighting?.diveId)).toMatchObject({ siteId: reef, divedOn: yesterday, fromSightings: true });
  });
});
